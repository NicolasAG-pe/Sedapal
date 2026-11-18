"""Ensayo aislado Android LAB -> Gateway -> conversación -> GroqCloud.

Sin argumentos ejecuta solo el ensayo controlado: Auth sintético, transporte de Groq simulado y ninguna salida a Internet.
Con --run repite ese ensayo y, solo con autorización expresa de un administrador elegible, abre el servicio real
durante un tiempo acotado usando el secreto temporal del piloto.
"""
import argparse
from contextlib import ExitStack
import json
import os
import re
import select
import shlex
import shutil
import signal
import socket
import ssl
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
SDK_ADB = Path.home() / "Android/Sdk/platform-tools/adb"
ADB = os.environ.get("HIDRO_ADB") or (str(SDK_ADB) if SDK_ADB.is_file() else "adb")
OPENER = urllib.request.build_opener(urllib.request.ProxyHandler({}))
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
                upstream.close()
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
            ready = self.path == "/ready"
            known = self.path == "/api/auth/session" and self.headers.get("Authorization") in SESSIONS
            body = json.dumps({"estado": "ok", "usuario": {"rol": "usuario"},
                               "suministro": {"numero_suministro": "900000001"}} if known else {}).encode()
            self.send_response(200 if ready or known else 401)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def log_message(self, *_):
            pass

    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server


def tls_fixture(directory, hostname):
    """HTTPS local para comprobar el mismo relé TLS con un certificado desechable."""
    cert, key = directory / "ca.pem", directory / "tls.key"
    subprocess.run(["openssl", "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1",
                    "-subj", f"/CN={hostname}", "-addext", f"subjectAltName=DNS:{hostname}",
                    "-out", str(cert), "-keyout", str(key)], capture_output=True, check=True, timeout=10)
    context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    context.load_cert_chain(cert, key)
    calls = []

    class Handler(BaseHTTPRequestHandler):
        def do_POST(self):
            data = self.rfile.read(int(self.headers.get("Content-Length", 0)))
            public = json.loads(json.loads(data)["messages"][1]["content"])
            calls.append(self.path == "/openai/v1/chat/completions" and self.headers["Host"] == UPSTREAM[0]
                         and self.headers["Authorization"] == "Bearer " + FIXTURE_KEY
                         and set(public) == {"topic", "continuation", "style", "extracts"}
                         and public["topic"] == "saving" and b"jwt-sintetico" not in data)
            content = {"text": "Para cuidar el agua en casa, revisa los caños y acorta las duchas.", "evidence": ["base"]}
            body = json.dumps({"choices": [{"finish_reason": "stop", "message": {
                "role": "assistant", "content": json.dumps(content)}}]}).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def log_message(self, *_):
            pass

    class FixtureServer(ThreadingHTTPServer):
        def finish_request(self, request, address):
            try:
                with context.wrap_socket(request, server_side=True) as secured:
                    super().finish_request(secured, address)
            except ssl.SSLError:
                pass  # La prueba de identidad inválida cierra TLS antes de iniciar HTTP.

    server = FixtureServer(("127.0.0.1", 0), Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server, cert, calls


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


def sandbox_command(relay_dir, mode, canary, ttl, budget, secret_fd, tls_ca, synthetic_supply):
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
    if tls_ca is not None:
        command += ["--ro-bind", str(tls_ca), "/run/tls-fixture.pem"]
    return command + ["--chdir", "/pilot", "/node", "sandbox.cjs", mode, str(canary), str(ttl), str(budget), synthetic_supply]


def request(port, token, body, observed=None):
    # Origen de la WebView de Capacitor en Android LAB v10.
    headers = {"Content-Type": "application/json", "Origin": "http://localhost"}
    if token:
        headers["Authorization"] = "Bearer " + token
    data = json.dumps({"version": 2, "style": "summary", "topic": "saving", **body}).encode()
    call = urllib.request.Request(f"http://127.0.0.1:{port}/api/chat", data=data, headers=headers, method="POST")
    try:
        with OPENER.open(call, timeout=9) as response:
            body = json.load(response)
            if observed is not None:
                observed.append(json.dumps(body) + str(response.headers))
            return response.status, body, response.headers
    except urllib.error.HTTPError as error:
        with error:
            body = json.load(error)
            if observed is not None:
                observed.append(json.dumps(body) + str(error.headers))
            return error.code, body, error.headers


def check(condition, message):
    if not condition:
        raise AssertionError(message)
    log("  OK " + message)


def rehearse(port):
    """Guion del ensayo controlado. Solo usa sesiones y conversaciones sintéticas."""
    observed = []
    def chat(token, body):
        return request(port, token, body, observed)

    ids = [str(uuid.uuid4()) for _ in range(3)]
    status, body, headers = chat(None, {"conversationId": ids[0]})
    check(status == 401 and body["code"] == "CHAT_AUTH_REQUIRED", "sin sesión: 401")
    status, body, headers = chat("jwt-sintetico-invalido", {"conversationId": ids[0]})
    check(status == 403 and body["code"] == "CHAT_AUTH_REQUIRED", "sesión desconocida: 403")
    status, body, headers = chat("jwt-sintetico-A", {"conversationId": ids[0]})
    check(status == 200 and body["mode"] == "generated-simulated" and body["evidence"] == ["base"] and len(body["text"]) > 24,
          "A: texto generado por el adaptador real con transporte controlado")
    check(headers["Access-Control-Allow-Origin"] == "http://localhost" and headers["Cache-Control"] == "no-store",
          "CORS para la WebView de Android y respuesta sin caché")
    status, body, headers = chat("jwt-sintetico-B", {"conversationId": ids[0], "topic": "more"})
    check(status == 200 and body["mode"] == "clarification", "B no hereda el contexto de A con el mismo identificador")
    status, body, headers = chat("jwt-sintetico-A", {"conversationId": ids[1], "style": "standard"})
    check(status == 200 and body == {"version": 2, "mode": "fallback", "topic": "saving", "variant": "base"},
          "plazo vencido: respaldo del catálogo")
    status, body, headers = chat("jwt-sintetico-B", {"conversationId": ids[2]})
    check(status == 200 and body["mode"] == "fallback", "HTTP 429: respaldo del catálogo")
    status, body, headers = chat("jwt-sintetico-A", {"conversationId": ids[0], "topic": "more", "style": "standard"})
    check(status == 200 and body["mode"] == "fallback" and body["variant"] == "detail",
          "pausa por cuota: respaldo sin nueva salida")
    check(len(observed) == 7 and not any(FIXTURE_KEY in item or "jwt-sintetico-" in item for item in observed),
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


def host_checks(process, gateway, port, source_key):
    """Comprueba desde el anfitrión, sobre procesos vivos, el aislamiento que declara el diseño."""
    # bwrap también menciona sandbox.cjs en sus argumentos: se identifica el proceso por su ejecutable dentro del sandbox.
    node = next((pid for pid in descendants(process.pid)
                 if Path(f"/proc/{pid}/cmdline").read_bytes().split(b"\0")[0] == b"/node"), None)
    check(node is not None, "el servicio de conversación corre dentro del sandbox")
    check(os.readlink(f"/proc/{node}/ns/net") != os.readlink("/proc/self/ns/net"), "espacio de red propio, distinto del anfitrión")
    check(os.readlink(f"/proc/{node}/ns/pid") != os.readlink("/proc/self/ns/pid"), "espacio de procesos propio")
    names = {item.split(b"=")[0] for item in Path(f"/proc/{node}/environ").read_bytes().split(b"\0") if item}
    check(names <= {b"PWD"}, "el servicio no recibió variables del anfitrión (solo PWD, fijada por bubblewrap)")
    check(not Path(f"/proc/{gateway.pid}/environ").read_bytes(), "el Gateway arrancó sin variables heredadas")
    targets = [os.readlink(f"/proc/{node}/fd/{fd.name}") for fd in Path(f"/proc/{node}/fd").iterdir()]
    check(not any(source_key in target for target in targets), "el sandbox no conserva un descriptor del archivo de la clave")
    listening = subprocess.run(["ss", "-ltnH", f"sport = :{port}"], capture_output=True, text=True, timeout=5).stdout.split()
    locals_ = [item for item in listening if item.endswith(f":{port}")]
    check(locals_ and all(item.startswith("127.0.0.1:") for item in locals_), f"el Gateway del ensayo solo escucha en 127.0.0.1:{port}")


def phone_request(path, token=None, payload=None):
    """curl ejecutado en el teléfono contra el puente adb reverse, con el origen de la WebView."""
    command = "curl -s -m 8 -w '\\n%{http_code}' -H 'Origin: http://localhost' -H 'Content-Type: application/json'"
    if token:
        command += f" -H 'Authorization: Bearer {token}'"
    if payload is not None:
        command += " -X POST -d " + shlex.quote(json.dumps(payload))
    out = adb("shell", f"{command} http://127.0.0.1:45689{path}").stdout.strip()
    body, _, code = out.rpartition("\n")
    try:
        return int(code), json.loads(body) if body.startswith("{") else body
    except ValueError:
        return 0, out


def adb(*args):
    return subprocess.run([ADB, *args], capture_output=True, text=True, timeout=15, check=True)


def bridge_command(action):
    return subprocess.run(["bash", str(HERE / "adb-bridge.sh"), action], capture_output=True,
                          text=True, timeout=20, env={**os.environ, "HIDRO_ADB": ADB})


def bridge_points(port):
    return any(line.split()[-2:] == ["tcp:45689", f"tcp:{port}"] for line in adb("reverse", "--list").stdout.splitlines())


def switch_bridge(port):
    check(bridge_points(8284), "puente inicial hacia el Gateway anterior (8284)")
    check(bridge_command("switch").returncode == 0 and bridge_points(port),
          f"el teléfono apunta al Gateway del ensayo ({port})")


def bridge_check(port):
    """Cambia el puente de la APK LAB al Gateway del ensayo, lo usa desde el teléfono y lo restaura."""
    payload = {"version": 2, "conversationId": str(uuid.uuid4()), "topic": "saving", "style": "summary"}
    try:
        switch_bridge(port)
        check(phone_request("/ready")[0] == 200, "desde el teléfono, /ready del Gateway del ensayo responde 200")
        code, _ = phone_request("/api/chat", None, payload)
        check(code == 401, "desde el teléfono, /api/chat sin sesión responde 401")
        code, body = phone_request("/api/chat", "jwt-sintetico-A", payload)
        check(code == 200 and isinstance(body, dict) and body.get("mode") == "generated-simulated" and body.get("evidence") == ["base"],
              "desde el teléfono, una sesión sintética recibe generated-simulated por el Gateway del ensayo")
    finally:
        restore_bridge()
    check(phone_request("/ready")[0] == 200, "el Gateway anterior atiende tras el regreso a 8284")
    code, _ = phone_request("/api/chat", "jwt-sintetico-A", payload)
    check(code == 403, "tras el rollback, Auth real rechaza la sesión del doble de Auth")


def read_events(process, events, key):
    for line in process.stdout:
        line = line.rstrip()
        events.append(line)
        if key in line:
            continue
        if line.startswith("{"):
            try:
                events.append(json.loads(line))
            except json.JSONDecodeError:
                pass
        log("  [sandbox] " + line)


def add_http_fixture(stack, server):
    stack.callback(server.server_close)
    stack.callback(server.shutdown)


def run_session(mode, *, origins=None, gateway_port=0, auth_target=None, ttl=30, budget=0, secret_fd=None,
                key=FIXTURE_KEY, verify=rehearse, tls_hostname=None, synthetic_supply=""):
    """Levanta el sandbox, los relés y el Gateway, y libera los recursos incluso tras un error de arranque."""
    with ExitStack() as stack:
        work_dir = Path(stack.enter_context(tempfile.TemporaryDirectory(prefix="hidrobot-e2e-", dir=RUNTIME)))
        relay_dir = work_dir / "sockets"
        relay_dir.mkdir(mode=0o700)
        canary = stack.enter_context(socket.socket())
        canary.bind(("127.0.0.1", 0))
        canary.listen()
        events, tls_ca, tls_calls = [], None, []
        if auth_target is None:
            auth_server = fake_auth()
            add_http_fixture(stack, auth_server)
            auth_target = auth_server.server_address
        if origins is None:
            origins = work_dir / "origins.json"
            names = ("auth", "billing", "operations", "notifications", "realtime")
            origins.write_text(json.dumps({name: f"http://127.0.0.1:{auth_target[1]}" for name in names}))
        auth_relay = Relay(relay_dir / "auth.sock", lambda: socket.create_connection(auth_target, timeout=3), 64 * 1024)
        stack.callback(auth_relay.close)
        if mode == "run" or tls_hostname:
            target = UPSTREAM
            if tls_hostname:
                fixture, tls_ca, tls_calls = tls_fixture(work_dir, tls_hostname)
                add_http_fixture(stack, fixture)
                target = fixture.server_address
                fixture_key = work_dir / "fixture-api.secret"
                fixture_key.write_text(FIXTURE_KEY)
                fixture_key.chmod(0o600)
                secret_fd = os.open(fixture_key, os.O_RDONLY)
                stack.callback(os.close, secret_fd)
            groq_relay = Relay(relay_dir / "groq.sock", lambda: socket.create_connection(target, timeout=5),
                               128 * 1024, maximum=budget)
            stack.callback(groq_relay.close)

        source_key = os.readlink(f"/proc/self/fd/{secret_fd}") if secret_fd is not None else str(SECRET)
        command = sandbox_command(relay_dir, mode, canary.getsockname()[1], ttl, budget, secret_fd, tls_ca, synthetic_supply)
        process = subprocess.Popen(command,
                                   stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True,
                                   pass_fds=() if secret_fd is None else (secret_fd,))
        stack.callback(process.stdout.close)
        stack.callback(process.stdin.close)
        stack.callback(Child(process).close)
        reader = threading.Thread(target=read_events, args=(process, events, key), daemon=True)
        reader.start()
        deadline = time.monotonic() + 10
        while not (relay_dir / "chat.sock").exists():
            if process.poll() is not None or time.monotonic() > deadline:
                raise RuntimeError("El sandbox no quedó listo.")
            time.sleep(0.05)
        bridge = TcpToUnix(relay_dir / "chat.sock")
        stack.callback(bridge.close)
        gateway = subprocess.Popen([str(NODE), str(HERE / "gateway.cjs"), str(origins), str(gateway_port), str(bridge.port)],
                                   stdout=subprocess.PIPE, text=True, cwd=REPO, env={})
        stack.callback(gateway.stdout.close)
        stack.callback(Child(gateway).close)
        if not select.select([gateway.stdout], [], [], 10)[0]:
            raise RuntimeError("El Gateway del ensayo no quedó listo.")
        line = gateway.stdout.readline()
        if not line:
            raise RuntimeError("El Gateway del ensayo terminó antes de escuchar.")
        port = json.loads(line)["puerto"]
        host_checks(process, gateway, port, source_key)
        if verify:
            verify(port)
        else:
            log(f"Gateway del ensayo en 127.0.0.1:{port}. Disponible hasta {ttl} s o Ctrl-C.")
            log("Para Android LAB v10: scripts/hidrobot-groq/adb-bridge.sh switch")
            try:
                process.wait(timeout=ttl + 5)
            except (subprocess.TimeoutExpired, KeyboardInterrupt):
                pass
        summary = finish(process, reader, events)
        assert_no_secret(events, key, "los registros del sandbox")
        return summary, tls_calls


def finish(process, reader, events):
    try:
        process.stdin.close()
        process.wait(timeout=8)
    except (subprocess.TimeoutExpired, OSError):
        Child(process).close()
    reader.join(timeout=3)
    summary = next((event for event in reversed(events) if isinstance(event, dict) and event.get("evento") == "resumen"), None)
    if summary is None:
        raise AssertionError("El sandbox no entregó su resumen.")
    return summary


def assert_no_secret(events, secret, where):
    """La clave no puede aparecer en ningún registro del sandbox ni en lo que imprime el lanzador."""
    if not secret:
        raise AssertionError("Comprobación de fugas sin secreto.")
    if any(secret in (item if isinstance(item, str) else json.dumps(item)) for item in events):
        raise AssertionError("El secreto apareció en " + where + ".")


def restore_bridge():
    """Restaura únicamente el puente del ensayo activo y comprueba el destino por ADB."""
    if bridge_points(8285):
        check(bridge_command("rollback").returncode == 0 and bridge_points(8284),
              "el puente vuelve al Gateway de demostración (8284)")


def rehearse_tls():
    for hostname, expected in ((UPSTREAM[0], "generated-simulated"), ("fixture.invalid", "fallback")):
        def verify(port):
            status, body, _ = request(port, "jwt-sintetico-A", {"conversationId": str(uuid.uuid4())})
            check(status == 200 and body["mode"] == expected, f"relé TLS local: {expected}")
            check(FIXTURE_KEY not in json.dumps(body), "el relé TLS no expone la clave en la respuesta")
            status, body, _ = request(port, "jwt-sintetico-B", {"conversationId": str(uuid.uuid4())})
            check(status == 200 and body["mode"] == "fallback", "presupuesto TLS agotado: catálogo")

        summary, calls = run_session("tls-check", budget=1, verify=verify, tls_hostname=hostname)
        check(calls == ([True] if hostname == UPSTREAM[0] else []), "HTTP solo llega al destino TLS con nombre válido y sin JWT")
        check(summary["intentos_transporte"] == 1 and summary["intentos_externos"] == 0,
              "un intento por el relé local y cero intentos externos")


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    modes = parser.add_mutually_exclusive_group()
    modes.add_argument("--run", action="store_true", help="Usar solo con autorización expresa de una cuenta elegible.")
    modes.add_argument("--android", action="store_true", help="APK LAB y Auth LAB con transporte simulado en 8285.")
    modes.add_argument("--bridge-check", action="store_true", help="Prueba ADB en 8285 con Auth y transporte simulados.")
    parser.add_argument("--origins", type=Path, default=DEFAULT_ORIGINS, help="origins.json del Gateway LAB (--android o --run).")
    parser.add_argument("--gateway-port", type=int, choices=[8285], default=8285)
    parser.add_argument("--auth", default="%s:%d" % DEFAULT_AUTH, help="Auth LAB loopback (--android o --run).")
    parser.add_argument("--synthetic-supply", help="Suministro de la cuenta sintética autorizada del LAB, obligatorio con --run.")
    parser.add_argument("--ttl", type=int, default=300, help="Segundos que queda abierto el Gateway para Android (5-1800).")
    parser.add_argument("--max-external", type=int, default=1,
                        help="Tope de peticiones a GroqCloud (1-%d). El primer ensayo real usa 1." % MAX_REAL_REQUESTS)
    args = parser.parse_args()
    if args.run and not re.fullmatch(r"9[0-9]{8}", args.synthetic_supply or ""):
        parser.error("--run requiere --synthetic-supply con un suministro sintético LAB de nueve dígitos que empiece con 9.")
    ttl, budget = min(1800, max(5, args.ttl)), min(MAX_REAL_REQUESTS, max(1, args.max_external))
    log("Ensayo controlado: Auth sintético y transporte de Groq simulado, sin salida a Internet.")
    summary, _ = run_session("preflight")
    check(True, "los registros del sandbox no contienen la clave simulada")
    check(summary["intentos_transporte"] == 3 and summary["intentos_externos"] == 0,
          "el servicio simulado hizo tres intentos, la pausa evitó el cuarto y ninguno salió a Internet")
    check(summary["codigos_backend"] == ["CHAT_PROVIDER_TIMEOUT", "GROQ_QUOTA", "GROQ_QUOTA"],
          "códigos de respaldo acotados y sin detalles")
    rehearse_tls()
    log("Ensayo controlado y relé TLS local aprobados. No hubo llamadas a GroqCloud.")
    if args.bridge_check:
        log("Ensayo del puente ADB: Gateway del ensayo en 8285 con Auth sintético y transporte simulado.")
        summary, _ = run_session("bridge", gateway_port=args.gateway_port, verify=bridge_check)
        check(summary["intentos_transporte"] == 1 and summary["intentos_externos"] == 0 and summary["codigos_backend"] == [],
              "el teléfono provocó una única generación simulada y ninguna llamada externa")
        return
    if not (args.run or args.android):
        return
    host, port = args.auth.rsplit(":", 1)
    if host not in ("127.0.0.1", "localhost") or not args.origins.is_file():
        raise ValueError("Auth debe ser loopback y origins.json debe existir.")
    check(bridge_points(8284), "puente inicial hacia el Gateway anterior (8284)")
    signal.signal(signal.SIGTERM, lambda *_: signal.raise_signal(signal.SIGINT))
    try:
        with ExitStack() as stack:
            fd, key = None, FIXTURE_KEY
            if args.run:
                fd = secret_file()
                stack.callback(os.close, fd)
                key = os.pread(fd, 256, 0).decode().strip()
                if not key or not key.isascii() or not key.isprintable() or any(c.isspace() for c in key):
                    raise ValueError("Formato inesperado del archivo de clave.")
                log(f"Modo real solicitado por el operador, tope de {budget} peticiones a GroqCloud.")
            run_session("run" if args.run else "android", origins=args.origins, gateway_port=args.gateway_port,
                        auth_target=(host, int(port)), ttl=ttl, budget=budget if args.run else 0,
                        secret_fd=fd, key=key, verify=None, synthetic_supply=args.synthetic_supply or "")
    finally:
        restore_bridge()


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        raise SystemExit(130)
    except (OSError, ValueError, AssertionError, RuntimeError, subprocess.SubprocessError) as error:
        print("Ensayo no completado. " + (str(error) if isinstance(error, (ValueError, AssertionError, RuntimeError, FileNotFoundError)) else type(error).__name__))
        raise SystemExit(1)
