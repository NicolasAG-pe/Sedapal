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
FIXTURE_KEY = "groq-fixture-only"
MAX_REAL_REQUESTS = 3
# Todo lo que Android o un cliente recibiría del Gateway durante el ensayo controlado.
OBSERVED = []


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
            body = json.load(response)
            OBSERVED.append(json.dumps(body) + str(response.headers))
            return response.status, body, response.headers
    except urllib.error.HTTPError as error:
        body = json.load(error)
        OBSERVED.append(json.dumps(body) + str(error.headers))
        return error.code, body, error.headers


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
    check(len(OBSERVED) == 7 and not any(FIXTURE_KEY in item or "Bearer" in item for item in OBSERVED),
          "ninguna respuesta ni encabezado hacia Android contiene la clave del proveedor ni un token")


def descendants(pid):
    """Procesos descendientes de pid, leídos de /proc."""
    children = {}
    for entry in Path("/proc").iterdir():
        if entry.name.isdigit():
            try:
                parent = int((entry / "stat").read_text().rsplit(")", 1)[1].split()[1])
            except (OSError, IndexError, ValueError):
                continue
            children.setdefault(parent, []).append(int(entry.name))
    found, pending = [], [pid]
    while pending:
        for child in children.get(pending.pop(), []):
            found.append(child)
            pending.append(child)
    return found


def host_checks(process, port):
    """Comprueba desde el anfitrión, sobre procesos vivos, el aislamiento que declara el diseño."""
    # bwrap también menciona sandbox.cjs en sus argumentos: se identifica el proceso por su ejecutable dentro del sandbox.
    node = next((pid for pid in descendants(process.pid)
                 if Path(f"/proc/{pid}/cmdline").read_bytes().split(b"\0")[0] == b"/node"), None)
    check(node is not None, "el servicio de conversación corre dentro del sandbox")
    check(os.readlink(f"/proc/{node}/ns/net") != os.readlink("/proc/self/ns/net"), "espacio de red propio, distinto del anfitrión")
    check(os.readlink(f"/proc/{node}/ns/pid") != os.readlink("/proc/self/ns/pid"), "espacio de procesos propio")
    names = {item.split(b"=")[0] for item in Path(f"/proc/{node}/environ").read_bytes().split(b"\0") if item}
    check(names <= {b"PWD"}, "el servicio no recibió variables del anfitrión (solo PWD, fijada por bubblewrap)")
    targets = [os.readlink(f"/proc/{node}/fd/{fd.name}") for fd in Path(f"/proc/{node}/fd").iterdir()]
    check(not any(str(SECRET) in target for target in targets), "el sandbox no conserva un descriptor del archivo de la clave")
    listening = subprocess.run(["ss", "-ltnH", f"sport = :{port}"], capture_output=True, text=True, timeout=5).stdout.split()
    locals_ = [item for item in listening if item.endswith(f":{port}")]
    check(locals_ and all(item.startswith("127.0.0.1:") for item in locals_), f"el Gateway del ensayo solo escucha en 127.0.0.1:{port}")


def phone_request(path, token=None, payload=None):
    """curl ejecutado en el teléfono contra el puente adb reverse, con el origen de la WebView."""
    command = "curl -s -m 8 -w '\\n%{http_code}' -H 'Origin: http://localhost' -H 'Content-Type: application/json'"
    if token:
        command += f" -H 'Authorization: Bearer {token}'"
    if payload is not None:
        command += f" -X POST -d '{json.dumps(payload)}'"
    out = subprocess.run(["adb", "shell", f"{command} http://127.0.0.1:45689{path}"],
                         capture_output=True, text=True, timeout=20).stdout.strip()
    body, _, code = out.rpartition("\n")
    try:
        return int(code), json.loads(body) if body.startswith("{") else body
    except ValueError:
        return 0, out


def bridge_check(port):
    """Cambia el puente de la APK LAB al Gateway del ensayo, lo usa desde el teléfono y lo restaura."""
    script = str(HERE / "adb-bridge.sh")
    run = lambda action: subprocess.run(["bash", script, action], capture_output=True, text=True, timeout=30)
    mapping = lambda: subprocess.run(["adb", "reverse", "--list"], capture_output=True, text=True, timeout=15).stdout
    payload = {"version": 2, "conversationId": str(uuid.uuid4()), "topic": "saving", "style": "summary"}
    try:
        check("tcp:45689 tcp:8284" in mapping(), "puente inicial hacia el Gateway anterior (8284)")
        result = run("switch")
        check(result.returncode == 0 and f"tcp:45689 tcp:{port}" in mapping(), f"switch: el teléfono apunta al Gateway del ensayo ({port})")
        check(phone_request("/ready")[0] == 200, "desde el teléfono, /ready del Gateway del ensayo responde 200")
        code, _ = phone_request("/api/chat", None, payload)
        check(code == 401, "desde el teléfono, /api/chat sin sesión responde 401")
        code, body = phone_request("/api/chat", "jwt-sintetico-A", payload)
        check(code == 200 and isinstance(body, dict) and body.get("mode") == "generated" and body.get("evidence") == ["base"],
              "desde el teléfono, una sesión sintética recibe modo generated por el Gateway del ensayo")
        result = run("rollback")
        check(result.returncode == 0 and "tcp:45689 tcp:8284" in mapping(), "rollback: el puente vuelve al Gateway anterior (8284)")
        code, body = phone_request("/api/chat", "jwt-sintetico-A", payload)
        check(code == 403, "tras el rollback, el Gateway anterior (Auth real) rechaza la sesión sintética")
    finally:
        restore_bridge()


def read_events(process, events):  # events mezcla el hilo lector, líneas de texto y dicts
    for line in process.stdout:
        line = line.rstrip()
        events.append(line)
        if line.startswith("{"):
            try:
                events.append(json.loads(line))
            except json.JSONDecodeError:
                pass
        log("  [sandbox] " + line)


def session(real, origins, gateway_port, auth_target, ttl, budget, secret_fd, hold=None):
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
                    if origins is None:
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
                host_checks(process, port)
                if real:
                    log(f"Gateway del ensayo en 127.0.0.1:{port}. Servicio real abierto hasta {ttl} s o Ctrl-C.")
                    log("Para Android LAB v10, en otra terminal: scripts/hidrobot-groq/adb-bridge.sh switch")
                    log("Al terminar se restaura solo el Gateway anterior; manualmente: scripts/hidrobot-groq/adb-bridge.sh rollback")
                    try:
                        process.wait(timeout=ttl + 10)
                    except (subprocess.TimeoutExpired, KeyboardInterrupt):
                        pass
                elif hold:
                    hold(port)
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


def assert_no_secret(events, secret, where):
    """La clave no puede aparecer en ningún registro del sandbox ni en lo que imprime el lanzador."""
    if not secret:
        raise AssertionError("Comprobación de fugas sin secreto.")
    if any(secret in (item if isinstance(item, str) else json.dumps(item)) for item in events
           if not isinstance(item, threading.Thread)):
        raise AssertionError("El secreto apareció en " + where + ".")


def run_session(*args):
    process, events, cleanup = session(*args)
    try:
        return finish(process, events), events
    finally:
        for item in reversed(cleanup):
            item.close()


def restore_bridge():
    """Devuelve la APK LAB al Gateway anterior, incluso si el ensayo falló."""
    try:
        result = subprocess.run(["bash", str(HERE / "adb-bridge.sh"), "rollback"], timeout=20,
                                capture_output=True, text=True)
        log(("Puente ADB: " if result.returncode == 0 else "Puente ADB sin restaurar. ") + (result.stdout or result.stderr).strip().splitlines()[0])
    except (OSError, subprocess.SubprocessError, IndexError):
        log("Puente ADB sin restaurar. Ejecuta: scripts/hidrobot-groq/adb-bridge.sh rollback")


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--run", action="store_true", help="Usar solo con autorización expresa de una cuenta elegible.")
    parser.add_argument("--origins", type=Path, default=DEFAULT_ORIGINS, help="origins.json del Gateway LAB (solo --run).")
    parser.add_argument("--gateway-port", type=int, default=8285)
    parser.add_argument("--bridge-check", action="store_true",
                        help="Ensayo controlado del puente ADB con un Gateway real en 8285. Sin llamadas a Groq.")
    parser.add_argument("--auth", default="%s:%d" % DEFAULT_AUTH, help="Auth LAB loopback (solo --run).")
    parser.add_argument("--ttl", type=int, default=300, help="Segundos que queda abierto el servicio real (5-1800).")
    parser.add_argument("--max-external", type=int, default=1,
                        help="Tope de peticiones a GroqCloud (1-%d). El primer ensayo real usa 1." % MAX_REAL_REQUESTS)
    args = parser.parse_args()
    ttl, budget = min(1800, max(5, args.ttl)), min(MAX_REAL_REQUESTS, max(1, args.max_external))
    log("Ensayo controlado: Auth sintético y transporte de Groq simulado, sin salida a Internet.")
    summary, events = run_session(False, None, 0, None, 30, 0, None)
    assert_no_secret(events, FIXTURE_KEY, "los registros del sandbox")
    check(True, "los registros del sandbox no contienen la clave simulada")
    check(summary["intentos_externos"] == 3, "el servicio simulado hizo exactamente tres intentos y la pausa evitó el cuarto")
    check(summary["codigos_backend"] == ["CHAT_PROVIDER_TIMEOUT", "GROQ_QUOTA", "GROQ_QUOTA"],
          "códigos de respaldo acotados y sin detalles")
    log("Ensayo controlado aprobado. No hubo llamadas a GroqCloud.")
    if args.bridge_check:
        if args.run or args.gateway_port != 8285 or not args.origins.is_file():
            raise ValueError("--bridge-check usa el puerto 8285, exige origins.json y no se combina con --run.")
        log("Ensayo del puente ADB: Gateway del ensayo en 8285 con Auth sintético y transporte simulado.")
        try:
            summary, events = run_session(False, args.origins, 8285, None, 30, 0, None, bridge_check)
        finally:
            restore_bridge()
        check(summary["intentos_externos"] == 1 and summary["codigos_backend"] == [],
              "el teléfono provocó una única generación simulada y ninguna llamada externa")
        return
    if not args.run:
        return
    host, port = args.auth.rsplit(":", 1)
    if host not in ("127.0.0.1", "localhost") or not args.origins.is_file():
        raise ValueError("Auth debe ser loopback y origins.json debe existir.")
    fd = secret_file()
    try:
        log(f"AUTORIZADO: ensayo real con tope de {budget} peticiones a GroqCloud.")
        result, events = run_session(True, args.origins, args.gateway_port, (host, int(port)), ttl, budget, fd)
        os.lseek(fd, 0, os.SEEK_SET)
        assert_no_secret(events, os.read(fd, 256).decode().strip(), "los registros del sandbox")
        log("Resumen: " + json.dumps(result, ensure_ascii=False))
        log("Comprobado: la clave no aparece en los registros del sandbox.")
    finally:
        os.close(fd)
        restore_bridge()


if __name__ == "__main__":
    try:
        main()
    except (OSError, ValueError, AssertionError, RuntimeError, subprocess.SubprocessError) as error:
        print("Ensayo no completado. " + (str(error) if isinstance(error, (ValueError, AssertionError, RuntimeError, FileNotFoundError)) else type(error).__name__))
        raise SystemExit(1)
