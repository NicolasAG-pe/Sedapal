"use strict";
const assert = require("node:assert/strict"),
  crypto = require("node:crypto"),
  fs = require("node:fs"),
  path = require("node:path");
module.exports = async function ({
  ctx,
  recovery,
  getPage,
  restart,
  until,
  ok,
  screenshot,
  login,
  dashboard,
  logout,
  android,
  saved,
  noPlainToken,
  loginScreen,
  output,
}) {
  const a = ctx.registro(711),
    next = "RecuperadaFixture789",
    final = "FinalFixture987";
  const reg = (await ctx.request("register", a, 202)).data;
  await ctx.drain();
  await ctx.request(
    "verify-email",
    ctx.verificar(reg.registro_id, ctx.codigo(a.correo)),
    201,
  );
  await login(a.numero_suministro);
  const old = (await saved()).token;
  assert.ok(old);
  await noPlainToken();
  const cipher = android(
    "shell",
    "run-as",
    "pe.edu.hidromejora.app",
    "ls",
    "no_backup/hm-secure-v1/session.bin",
  );
  assert.match(cipher, /session.bin/);
  ok("Login inicial y sesión Android cifrada existentes conservados");
  let ip = 1;
  async function post(action, body, status = 200) {
    const r = await fetch(ctx.base + "/api/auth/password-recovery/" + action, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Forwarded-For": "203.0.113." + ip++,
      },
      body: JSON.stringify(body),
    });
    const d = await r.json();
    assert.equal(r.status, status, d.mensaje);
    return d;
  }
  const id = crypto.randomUUID();
  await post("request", { solicitud_id: id, correo: a.correo }, 202);
  await recovery.drain();
  const grant = await post("verify", {
    solicitud_id: id,
    codigo: recovery.code(a.correo),
  });
  await post("complete", {
    solicitud_id: id,
    permiso: grant.permiso,
    password_nueva: next,
    password_confirmacion: next,
  });
  await loginScreen();
  await until(
    async () => !(await saved()).token,
    "Keystore retirado por revocación",
  );
  await noPlainToken();
  screenshot("android-revoked");
  assert.equal(
    (
      await fetch(ctx.base + "/api/auth/session", {
        headers: { Authorization: "Bearer " + old },
      })
    ).status,
    401,
  );
  ok(
    "Restablecimiento externo revoca JWT, desconecta Socket.IO y elimina sesión persistida de Android",
  );
  await restart();
  await loginScreen();
  assert.ok(!(await saved()).token);
  ok("Force-stop y reapertura no restauran la sesión revocada");
  // Solo fixture aislado: adelantar cooldown, sin cambiar el límite en producción.
  await ctx.db.query(
    "UPDATE recuperacion_clave_limites SET ultimo_envio_en=ultimo_envio_en-INTERVAL '61 seconds'",
  );
  let p = getPage();
  // Android puede tener el DOM listo antes de terminar la primera composición.
  // Esperar las animaciones finitas reales; no alterar CSS ni saltar el control.
  await p.waitForFunction(
    () =>
      !document
        .getAnimations()
        .some(
          (a) =>
            a.playState === "running" &&
            Number.isFinite(a.effect.getTiming().iterations),
        ),
  );
  await p.evaluate(() => {
    window.__recoveryClicks = [];
    document.addEventListener(
      "click",
      (e) =>
        window.__recoveryClicks.push({
          id: e.target.id,
          tag: e.target.tagName,
        }),
      true,
    );
  });
  screenshot("android-before-forgot");
  await p.locator("#forgot-link").click();
  await new Promise((r) => setTimeout(r, 700));
  fs.writeFileSync(
    path.join(output, "tap-diagnostic.json"),
    JSON.stringify(
      await p.evaluate(() => ({
        clicks: window.__recoveryClicks,
        recoveryHidden: document.getElementById("password-recovery").hidden,
        loginHidden: document.getElementById("login-form").hidden,
        viewport: {
          width: innerWidth,
          height: innerHeight,
          scale: devicePixelRatio,
        },
      })),
    ),
  );
  screenshot("android-after-forgot");
  await p.locator("#recovery-email").fill(a.correo);
  screenshot("android-recovery-email");
  await p.locator("#recovery-request button").click();
  await p.locator("#recovery-verify").waitFor({ state: "visible" });
  await recovery.drain();
  screenshot("android-recovery-code");
  await p
    .locator("#recovery-code")
    .fill(recovery.code(a.correo) === "00000000" ? "11111111" : "00000000");
  await p.locator("#recovery-verify button[type=submit]").click();
  await p
    .locator("#recovery-error")
    .getByText(/inválido/)
    .waitFor();
  await p.locator("#recovery-code").fill(recovery.code(a.correo));
  await p.locator("#recovery-verify button[type=submit]").click();
  await p.locator("#recovery-complete").waitFor({ state: "visible" });
  screenshot("android-recovery-password");
  await p.locator("#recovery-password").fill(final);
  await p.locator("#recovery-confirm").fill(final);
  await p.locator("#recovery-complete button").click();
  await loginScreen();
  assert.ok(!(await saved()).token);
  screenshot("android-recovery-success");
  assert.equal(
    await p.evaluate(() =>
      document.getElementById("view-dashboard").classList.contains("active"),
    ),
    false,
  );
  ok(
    "WebView real: correo, código incorrecto/correcto y contraseña; vuelve al login sin sesión automática",
  );
  await ctx.request(
    "login",
    { numero_suministro: a.numero_suministro, password: next },
    401,
  );
  await p.locator("#suministro").fill(a.numero_suministro);
  await p.locator("#password").fill(final);
  await p.locator("#btn-login").click();
  await dashboard(a.numero_suministro);
  await noPlainToken();
  await restart();
  await dashboard(a.numero_suministro);
  screenshot("android-new-session-restored");
  ok(
    "Login con nueva contraseña y restauración cifrada tras reiniciar; antigua rechazada",
  );
  p = getPage();
  const current = (await saved()).token;
  assert.ok(current && current !== old);
  const logs = android("logcat", "-d");
  assert.ok(
    !logs.includes(old) && !logs.includes(current) && !logs.includes(final),
    "Sin secretos en logcat",
  );
  await logout();
  await restart();
  await loginScreen();
  assert.ok(!(await saved()).token);
  await noPlainToken();
  ok(
    "Logout y reapertura mantienen sesión cerrada; logcat sin JWT/contraseña del flujo",
  );
  fs.writeFileSync(
    path.join(output, "password-recovery.json"),
    JSON.stringify(
      {
        status: "passed",
        androidNative: true,
        mailProvider: "mock",
        production: false,
      },
      null,
      2,
    ),
  );
};
