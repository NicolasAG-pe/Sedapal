"use strict";
const assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path");
module.exports = async ({
  ctx,
  fixture,
  getPage,
  restart,
  until,
  ok,
  screenshot,
  login,
  dashboard,
  logout,
  android,
  output,
}) => {
  const pkg = "pe.edu.hidromejora.app",
    p = () => getPage(),
    a = ctx.registro(711);
  const pending = (await ctx.request("register", a, 202)).data;
  await ctx.drain();
  const loginData = (
    await ctx.request(
      "verify-email",
      ctx.verificar(pending.registro_id, ctx.codigo(a.correo)),
      201,
    )
  ).data;
  await login(a.numero_suministro);
  await until(
    () =>
      p().evaluate(
        () =>
          localStorage.getItem("hm_tutorial_seen") === "1" ||
          document.body.classList.contains("tutorial-open"),
      ),
    "tutorial inicial disponible/completado",
  );
  if (
    await p().evaluate(() => document.body.classList.contains("tutorial-open"))
  )
    await p()
      .locator("#spot-skip-mobile:visible,#spot-skip:visible")
      .first()
      .click();
  await until(
    () =>
      p().evaluate(
        () =>
          localStorage.getItem("hm_tutorial_seen") === "1" &&
          !document.body.classList.contains("tutorial-open"),
      ),
    "tutorial cerrado antes de medir Cuenta",
  );

  await p().evaluate(() =>
    document.querySelector("#sidebar [data-sec=perfil]").click(),
  );
  await p()
    .locator("#push-status")
    .getByText(/Firebase pendiente/)
    .waitFor();
  await p().locator("#push-settings").scrollIntoViewIfNeeded();
  await p().evaluate(() =>
    document
      .getElementById("push-settings")
      .scrollIntoView({ block: "start", behavior: "instant" }),
  );
  await p().evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
  screenshot("android-push-not-configured");
  assert.equal(await p().locator("#push-enable").isDisabled(), true);
  assert.equal(
    (await ctx.db.query("SELECT count(*)::int n FROM push_dispositivos"))
      .rows[0].n,
    0,
  );
  ok(
    "Android 15 real sin Firebase: compilación normal, login/Keystore intactos, sin auto-registro ni permiso al login",
  );
  async function nativeTap(pattern) {
    let target;
    await until(() => {
      try {
        android("shell", "uiautomator", "dump", "/sdcard/hm-push-window.xml");
        const xml = android("shell", "cat", "/sdcard/hm-push-window.xml"),
          nodes = [...xml.matchAll(/<node\b[^>]*>/g)].map((x) =>
            Object.fromEntries(
              [...x[0].matchAll(/([\w-]+)="([^"]*)"/g)].map((m) => [
                m[1],
                m[2],
              ]),
            ),
          );
        target = nodes.find((n) => pattern.test(n["resource-id"] || ""));
        return !!target;
      } catch (_) {
        return false;
      }
    }, "diálogo nativo de permiso");
    const b = target.bounds
      .match(/\[(\d+),(\d+)\]\[(\d+),(\d+)\]/)
      .slice(1)
      .map(Number);
    android(
      "shell",
      "input",
      "tap",
      String((b[0] + b[2]) >> 1),
      String((b[1] + b[3]) >> 1),
    );
  }
  async function permission() {
    await p().evaluate(() => {
      window.__hmPermission = null;
      Capacitor.Plugins.PushNotifications.requestPermissions().then(
        (r) => (window.__hmPermission = r.receive),
      );
    });
  }
  assert.notEqual(
    await p().evaluate(
      async () =>
        (await Capacitor.Plugins.PushNotifications.checkPermissions()).receive,
    ),
    "granted",
  );
  await permission();
  screenshot("android-permission-dialog");
  await nativeTap(/\/permission_deny_button$/);
  await until(
    () =>
      p().evaluate(() =>
        ["denied", "prompt-with-rationale"].includes(__hmPermission),
      ),
    "permiso denegado",
  );
  ok(
    "Plugin oficial: permiso POST_NOTIFICATIONS denegado sin romper el centro",
  );
  await permission();
  await nativeTap(/\/permission_allow_button$/);
  await until(
    () => p().evaluate(() => __hmPermission === "granted"),
    "permiso concedido",
  );
  await p().evaluate(() =>
    Capacitor.Plugins.PushNotifications.createChannel({
      id: "hm_updates",
      name: "Hidro-Mejora",
      importance: 3,
      visibility: 0,
    }),
  );
  const channels = await p().evaluate(() =>
    Capacitor.Plugins.PushNotifications.listChannels(),
  );
  assert.ok(channels.channels.some((c) => c.id === "hm_updates"));
  ok(
    "Plugin oficial: permiso voluntario concedido y canal Android existente; sin solicitar token FCM",
  );
  const n = (
    await ctx.db.query(
      "INSERT INTO notificaciones(id_suministro,alcance,titulo,mensaje,tipo) VALUES($1,'Usuario','Recibo de laboratorio','Consulta tus recibos.','recibo') RETURNING *",
      [loginData.suministro.id_suministro],
    )
  ).rows[0];
  await p().evaluate(() =>
    document.querySelector("#sidebar [data-sec=notificaciones]").click(),
  );
  await p()
    .locator("#sec-notificaciones")
    .getByText(n.titulo, { exact: true })
    .waitFor();
  screenshot("android-notification-center");
  ok(
    "Centro Android consulta PostgreSQL y conserva estado leído independiente de push",
  );
  // Intents locales con el formato de la acción del plugin; no son entregas de FCM.
  android(
    "shell",
    "am",
    "start",
    "-n",
    pkg + "/.MainActivity",
    "--es",
    "google.message_id",
    "fixture-foreground",
    "--es",
    "hm_event",
    n.push_evento,
  );
  await p().waitForFunction(() =>
    document.getElementById("sec-historial").classList.contains("active"),
  );
  screenshot("android-local-tap-receipts");
  ok(
    "Intent local de toque: revalida evento/suministro y abre Recibos con sesión válida",
  );
  await restart("force-stop", n.push_evento);
  await dashboard(a.numero_suministro);
  await p().waitForFunction(() =>
    document.getElementById("sec-historial").classList.contains("active"),
  );
  screenshot("android-cold-local-intent");
  ok(
    "Arranque desde proceso cerrado por intent local: restaura sesión segura antes de navegar; no prueba recepción remota",
  );
  const secret = await p().evaluate(
    async () =>
      (await Capacitor.nativePromise("HidroPushState", "read", {})).proof,
  );
  const ciphertext = android(
    "shell",
    "run-as",
    pkg,
    "cat",
    "no_backup/hm-secure-v1/push.bin",
  );
  assert.ok(!ciphertext.includes(secret));
  ok(
    "Capacidad de revocación cifrada separada: no aparece en texto plano del archivo nativo",
  );
  await logout();
  await restart("force-stop", n.push_evento);
  await p().waitForFunction(
    () =>
      !document.getElementById("login-form").hidden &&
      document.getElementById("session-restore").hidden,
  );
  assert.equal(
    await p().evaluate(() =>
      document.getElementById("view-dashboard").classList.contains("active"),
    ),
    false,
  );
  screenshot("android-local-tap-logged-out");
  ok("Toque con sesión cerrada permanece en login y no expone recibos");
  fs.writeFileSync(
    path.join(output, "push-result.json"),
    JSON.stringify(
      {
        android: 15,
        status: "passed",
        remoteFcm: false,
        tokenRegistration: "simulated in Chromium only",
        permission: "official plugin",
        tap: "local Android intent",
      },
      null,
      2,
    ),
  );
};
