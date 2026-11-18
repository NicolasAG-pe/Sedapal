"""Ensayo aislado Android LAB -> Gateway -> conversación -> GroqCloud.

Sin argumentos ejecuta solo el ensayo controlado: Auth sintético, transporte de Groq simulado y ninguna salida a Internet.
Con --run repite ese ensayo y, solo con autorización expresa de un administrador elegible, abre el servicio real
durante un tiempo acotado usando el secreto temporal del piloto.
"""
import argparse
import json
import os
import shutil
import socket
import stat
import subprocess
import sys
import tempfile
import threading
import time
import urllib.error
import urllib.request
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[1]
NODE = Path(shutil.which("node") or Path.home() / ".nvm/versions/node/v22.23.4/bin/node")
RUNTIME = Path("/run/user") / str(os.getuid())
# Nombre propio: la clave del piloto anterior nunca se reutiliza por accidente.
SECRET = RUNTIME / "hidrobot-groq-e2e.key"
MAX_SECRET_AGE = 2 * 60 * 60
UPSTREAM = ("api.groq.com", 443)
DEFAULT_AUTH = ("127.0.0.1", 8280)
DEFAULT_ORIGINS = Path.home() / ".local/share/hidromejora/integration-hotfix-main-ms120/artifacts/android/hidrobot3-lab-593cacd/origins.json"
SESSIONS = {"Bearer jwt-sintetico-A", "Bearer jwt-sintetico-B"}


def log(message):
    print(message, flush=True)


def pipe(source, target, limit):
    try:
        while data := source.recv(8192):
            limit -= len(data)
            if limit < 0:
                return
            target.sendall(data)
    except OSError:
        pass
    finally:
        try:
            target.shutdown(socket.SHUT_WR)
        except OSError:
            pass


def bridge(left, right, limit):
    """Copia en ambos sentidos con un tope de bytes por sentido y cierra los dos extremos."""
    try:
        left.settimeout(30)
        right.settimeout(30)
        upload = threading.Thread(target=pipe, args=(left, right, limit), daemon=True)
        upload.start()
        pipe(right, left, limit)
        upload.join(timeout=10)
    finally:
        left.close()
        right.close()


class Relay:
    """Escucha en un socket Unix y reenvía cada conexión a un único destino fijo, con tope de conexiones."""

    def __init__(self, path, connect, limit, maximum=None):
        self.maximum, self.count, self.stop = maximum, 0, threading.Event()
        self.listener = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        self.listener.bind(str(path))
        self.listener.listen(16)
        self.listener.settimeout(0.5)
        self.connect, self.limit = connect, limit
        threading.Thread(target=self.loop, daemon=True).start()

    def loop(self):
        while not self.stop.is_set():
            try:
                client, _ = self.listener.accept()
            except TimeoutError:
                continue
            except OSError:
                return
            if self.maximum is not None and self.count >= self.maximum:
                client.close()
                continue
            self.count += 1
            try:
                upstream = self.connect()
            except OSError:
                client.close()
                continue
            threading.Thread(target=bridge, args=(client, upstream, self.limit), daemon=True).start()

    def close(self):
        self.stop.set()
        self.listener.close()


class Child:
    """Proceso hijo que se detiene con SIGTERM y, si no sale, con SIGKILL."""

    def __init__(self, process):
        self.process = process

    def close(self):
        self.process.terminate()
        try:
            self.process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            self.process.kill()
            self.process.wait()


class TcpToUnix:
    """Puente de un puerto loopback efímero hacia el socket Unix del servicio de conversación."""

    def __init__(self, path):
        self.path = str(path)
        self.listener = socket.socket()
        self.listener.bind(("127.0.0.1", 0))
        self.listener.listen(16)
        self.listener.settimeout(0.5)
        self.stop = threading.Event()
        self.port = self.listener.getsockname()[1]
        threading.Thread(target=self.loop, daemon=True).start()

    def loop(self):
        while not self.stop.is_set():
            try:
                client, _ = self.listener.accept()
            except TimeoutError:
                continue
            except OSError:
                return
            try:
                upstream = socket.socket(socket.AF_UNIX)
                upstream.connect(self.path)
            except OSError:
                client.close()
                continue
            threading.Thread(target=bridge, args=(client, upstream, 4 * 1024 * 1024), daemon=True).start()

    def close(self):
        self.stop.set()
        self.listener.close()


def fake_auth():
    """Auth sintético: reconoce dos sesiones de cliente y nada más. Solo para el ensayo controlado."""
    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):
            known = self.path == "/api/auth/session" and self.headers.get("Authorization") in SESSIONS
            body = json.dumps({"estado": "ok", "usuario": {"rol": "usuario"},
                               "suministro": {"numero_suministro": "900000001"}} if known else {}).encode()
            self.send_response(200 if known else 401)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def log_message(self, *_):
            pass

    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server


def secret_file():
    if RUNTIME.stat().st_uid != os.getuid() or stat.S_IMODE(RUNTIME.stat().st_mode) != 0o700:
        raise ValueError("Directorio de ejecución con permisos inesperados.")
    fd = os.open(SECRET, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    metadata = os.fstat(fd)
    if not (stat.S_ISREG(metadata.st_mode) and metadata.st_uid == os.getuid()
            and stat.S_IMODE(metadata.st_mode) == 0o600 and metadata.st_nlink == 1
            and 1 <= metadata.st_size <= 256):
        os.close(fd)
        raise ValueError("El secreto debe ser un archivo propio, regular, 0600 y de hasta 256 bytes.")
    if time.time() - metadata.st_mtime > MAX_SECRET_AGE:
        os.close(fd)
        raise ValueError("El secreto tiene más de dos horas. Carga una clave nueva autorizada para este ensayo.")
    return fd


def sandbox_command(relay_dir, mode, canary, ttl, budget, secret_fd):
    command = [
        "bwrap", "--die-with-parent", "--unshare-net", "--unshare-pid", "--clearenv",
        "--ro-bind", "/usr", "/usr", "--ro-bind", "/lib", "/lib", "--ro-bind", "/lib64", "/lib64",
        "--proc", "/proc", "--dev", "/dev", "--tmpfs", "/tmp",
        "--ro-bind", str(NODE), "/node",
        "--ro-bind", str(HERE / "sandbox.cjs"), "/pilot/sandbox.cjs",
        "--bind", str(relay_dir), "/run/hidrobot-e2e",
    ]
    for path in (
        "Backend/services/conversation",
        "Backend/services/runtime.cjs",
        "Backend/services/auth/internal-transport.cjs",
        "Backend/config.js",
        "Backend/node_modules",
        "Frontend/assets/js/sedapal-knowledge.js",
    ):
        command += ["--ro-bind", str((REPO / path).resolve(strict=True)), "/pilot/" + path]
    if secret_fd is not None:
        command += ["--ro-bind-data", str(secret_fd), "/run/secrets/chat-groq-api-key"]
    return command + ["--chdir", "/pilot", "/node", "sandbox.cjs", mode, str(canary), str(ttl), str(budget)]


def request(port, token, body):
    # Origen de la WebView de Capacitor en Android LAB v10.
    headers = {"Content-Type": "application/json", "Origin": "http://localhost"}
    if token:
        headers["Authorization"] = "Bearer " + token
    data = json.dumps({"version": 2, "style": "summary", "topic": "saving", **body}).encode()
    call = urllib.request.Request(f"http://127.0.0.1:{port}/api/chat", data=data, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(call, timeout=9) as response:
            return response.status, json.load(response), response.headers
    except urllib.error.HTTPError as error:
        return error.code, json.load(error), error.headers


def check(condition, message):
    if not condition:
        raise AssertionError(message)
    log("  OK " + message)


def rehearse(port):
    """Guion del ensayo controlado. Solo usa sesiones y conversaciones sintéticas."""
    ids = [str(uuid.uuid4()) for _ in range(3)]
    status, body, headers = request(port, None, {"conversationId": ids[0]})
    check(status == 401 and body["code"] == "CHAT_AUTH_REQUIRED", "sin sesión: 401")
    status, body, headers = request(port, "jwt-sintetico-invalido", {"conversationId": ids[0]})
    check(status == 403 and body["code"] == "CHAT_AUTH_REQUIRED", "sesión desconocida: 403")
    status, body, headers = request(port, "jwt-sintetico-A", {"conversationId": ids[0]})
    check(status == 200 and body["mode"] == "generated" and body["evidence"] == ["base"] and len(body["text"]) > 24,
          "A: texto generado por el adaptador real con transporte controlado")
    check(headers["Access-Control-Allow-Origin"] == "http://localhost" and headers["Cache-Control"] == "no-store",
          "CORS para la WebView de Android y respuesta sin caché")
    status, body, headers = request(port, "jwt-sintetico-B", {"conversationId": ids[0], "topic": "more"})
    check(status == 200 and body["mode"] == "clarification", "B no hereda el contexto de A con el mismo identificador")
    status, body, headers = request(port, "jwt-sintetico-A", {"conversationId": ids[1], "style": "standard"})
    check(status == 200 and body == {"version": 2, "mode": "fallback", "topic": "saving", "variant": "base"},
          "plazo vencido: respaldo del catálogo")
    status, body, headers = request(port, "jwt-sintetico-B", {"conversationId": ids[2]})
    check(status == 200 and body["mode"] == "fallback", "HTTP 429: respaldo del catálogo")
    status, body, headers = request(port, "jwt-sintetico-A", {"conversationId": ids[0], "topic": "more", "style": "standard"})
    check(status == 200 and body["mode"] == "fallback" and body["variant"] == "detail",
          "pausa por cuota: respaldo sin nueva salida")


def read_events(process, events):  # events[0] será el hilo lector; el resto son dicts
    for line in process.stdout:
        line = line.rstrip()
        if line.startswith("{"):
            try:
                events.append(json.loads(line))
            except json.JSONDecodeError:
                pass
        log("  [sandbox] " + line)


def session(real, origins, gateway_port, auth_target, ttl, budget, secret_fd):
    """Levanta sandbox, relés y Gateway. En modo controlado ejecuta el guion y apaga todo."""
    with tempfile.TemporaryDirectory(prefix="hidrobot-e2e-", dir=RUNTIME) as name:
        relay_dir = Path(name)
        cleanup, events = [], []
        auth_server = None
        with socket.socket() as canary:
            canary.bind(("127.0.0.1", 0))
            canary.listen()
            try:
                if not real:
                    auth_server = fake_auth()
                    auth_target = auth_server.server_address
                    origins = relay_dir / "origins.json"
                    origins.write_text(json.dumps({n: f"http://172.31.0.{i}:3100" for i, n in
                                                   enumerate(["auth", "billing", "operations", "notifications", "realtime"], 2)}))
                cleanup.append(Relay(relay_dir / "auth.sock", lambda: socket.create_connection(auth_target, timeout=3), 64 * 1024))
                if real:
                    cleanup.append(Relay(relay_dir / "groq.sock", lambda: socket.create_connection(UPSTREAM, timeout=7),
                                         128 * 1024, maximum=budget))
                mode = "run" if real else "preflight"
                process = subprocess.Popen(
                    sandbox_command(relay_dir, mode, canary.getsockname()[1], ttl, budget, secret_fd),
                    stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True, pass_fds=() if secret_fd is None else (secret_fd,))
                reader = threading.Thread(target=read_events, args=(process, events), daemon=True)
                reader.start()
                events.append(reader)
                deadline = time.monotonic() + 10
                while not (relay_dir / "chat.sock").exists():
                    if process.poll() is not None or time.monotonic() > deadline:
                        raise RuntimeError("El sandbox no quedó listo.")
                    time.sleep(0.05)
                bridge_port = TcpToUnix(relay_dir / "chat.sock")
                cleanup.append(bridge_port)
                gateway = subprocess.Popen(
                    [str(NODE), str(HERE / "gateway.cjs"), str(origins), str(gateway_port), str(bridge_port.port)],
                    stdout=subprocess.PIPE, text=True, cwd=REPO)
                cleanup.append(Child(gateway))
                port = json.loads(gateway.stdout.readline())["puerto"]
                if real:
                    log(f"Gateway del ensayo en 127.0.0.1:{port}. Servicio real abierto hasta {ttl} s o Ctrl-C.")
                    log(f"Para Android LAB v10: adb reverse tcp:45689 tcp:{port}")
                    try:
                        process.wait(timeout=ttl + 10)
                    except (subprocess.TimeoutExpired, KeyboardInterrupt):
                        pass
                else:
                    rehearse(port)
                return process, events, cleanup
            except BaseException:
                for item in reversed(cleanup):
                    item.close()
                raise
            finally:
                if auth_server:
                    auth_server.shutdown()


def finish(process, events):
    try:
        process.stdin.close()
        process.wait(timeout=8)
    except (subprocess.TimeoutExpired, OSError):
        process.kill()
    for item in events:
        if isinstance(item, threading.Thread):
            item.join(timeout=3)
    summary = next((event for event in reversed(events) if isinstance(event, dict) and event.get("evento") == "resumen"), None)
    if summary is None:
        raise AssertionError("El sandbox no entregó su resumen.")
    return summary


def run_session(*args):
    process, events, cleanup = session(*args)
    try:
        return finish(process, events)
    finally:
        for item in reversed(cleanup):
            item.close()


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--run", action="store_true", help="Usar solo con autorización expresa de una cuenta elegible.")
    parser.add_argument("--origins", type=Path, default=DEFAULT_ORIGINS, help="origins.json del Gateway LAB (solo --run).")
    parser.add_argument("--gateway-port", type=int, default=8285)
    parser.add_argument("--auth", default="%s:%d" % DEFAULT_AUTH, help="Auth LAB loopback (solo --run).")
    parser.add_argument("--ttl", type=int, default=600, help="Segundos que queda abierto el servicio real (5-1800).")
    parser.add_argument("--max-external", type=int, default=6, help="Tope de peticiones a GroqCloud (1-20).")
    args = parser.parse_args()
    ttl, budget = min(1800, max(5, args.ttl)), min(20, max(1, args.max_external))
    log("Ensayo controlado: Auth sintético y transporte de Groq simulado, sin salida a Internet.")
    summary = run_session(False, None, 0, None, 30, 0, None)
    check(summary["intentos_externos"] == 3, "el servicio simulado hizo exactamente tres intentos y la pausa evitó el cuarto")
    check(summary["codigos_backend"] == ["CHAT_PROVIDER_TIMEOUT", "GROQ_QUOTA", "GROQ_QUOTA"],
          "códigos de respaldo acotados y sin detalles")
    log("Ensayo controlado aprobado. No hubo llamadas a GroqCloud.")
    if not args.run:
        return
    host, port = args.auth.rsplit(":", 1)
    if host not in ("127.0.0.1", "localhost") or not args.origins.is_file():
        raise ValueError("Auth debe ser loopback y origins.json debe existir.")
    fd = secret_file()
    try:
        log(f"AUTORIZADO: ensayo real con tope de {budget} peticiones a GroqCloud.")
        result = run_session(True, args.origins, args.gateway_port, (host, int(port)), ttl, budget, fd)
        log("Resumen: " + json.dumps(result, ensure_ascii=False))
    finally:
        os.close(fd)


if __name__ == "__main__":
    try:
        main()
    except (OSError, ValueError, AssertionError, RuntimeError, subprocess.SubprocessError) as error:
        print("Ensayo no completado. " + (str(error) if isinstance(error, (ValueError, AssertionError, RuntimeError, FileNotFoundError)) else type(error).__name__))
        raise SystemExit(1)
