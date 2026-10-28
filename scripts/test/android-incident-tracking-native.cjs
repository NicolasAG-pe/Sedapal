"use strict";
const assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path");
module.exports = async ({
  ctx,
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
  before,
}) => {
  const p = () => getPage(),
    supply = "900000711";
  const { PNG } = require("../../Backend/node_modules/pngjs"),
    image = new PNG({ width: 12, height: 12 });
  image.data.fill(255);
  const photo = PNG.sync.write(image);
  async function account(n, admin = false) {
    const a = ctx.registro(n),
      reg = (await ctx.request("register", a, 202)).data;
    await ctx.drain();
    const d = (
      await ctx.request(
        "verify-email",
        ctx.verificar(reg.registro_id, ctx.codigo(a.correo)),
        201,
      )
    ).data;
    if (admin) {
      await ctx.db.query(
        "UPDATE usuarios SET rol='admin' WHERE id_usuario=$1",
        [d.usuario.id_usuario],
      );
      d.token = (
        await ctx.request(
          "login",
          { numero_suministro: a.numero_suministro, password: a.password },
          200,
        )
      ).data.token;
    }
    return d;
  }
  const u = await account(711),
    admin = await account(713, true);
  let ip = 1;
  async function api(route, body, token = u.token, method = "POST") {
    const r = await fetch(ctx.base + route, {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + token,
        "X-Forwarded-For": "192.0.2." + ip++,
      },
      body: JSON.stringify(body),
    });
    assert.ok(r.ok);
    return r.json();
  }
  const i = (
    await api("/api/incidencias", {
      tipo: "Fuga",
      descripcion: "Incidencia de laboratorio para seguimiento Android.",
      referencia: "Referencia sintética sin datos personales",
      foto_base64: "data:image/png;base64," + photo.toString("base64"),
      foto_mime: "image/png",
    })
  ).incidencia;
  async function settleTutorial() {
    await until(
      () => p().evaluate(() =>
        localStorage.getItem("hm_tutorial_seen") === "1" ||
        document.body.classList.contains("tutorial-open")),
      "tutorial disponible",
    );
    if (await p().evaluate(() => document.body.classList.contains("tutorial-open"))) {
      await p().locator("#spot-skip-mobile:visible,#spot-skip:visible").first().click();
    }
    await until(
      () => p().evaluate(() => !document.body.classList.contains("tutorial-open")),
      "tutorial cerrado",
    );
  }
  await login(supply);
  await settleTutorial();
  const originalSize = android("shell", "wm", "size"),
    originalDensity = android("shell", "wm", "density");
  const size = originalSize.match(/Override size: (\d+x\d+)/)?.[1],
    density = originalDensity.match(/Override density: (\d+)/)?.[1];
  const measures = [];
  try {
    for (const [width, height] of [
      [360, 800],
      [390, 844],
    ]) {
      android("shell", "am", "force-stop", "pe.edu.hidromejora.app");
      android("shell", "wm", "size", width + "x" + (height + 48));
      android("shell", "wm", "density", "160");
      await restart();
      await dashboard(supply);
      await settleTutorial();
      let physicalHeight = height + 48;
      for (let attempt = 0; attempt < 4; attempt++) {
        const actual = await p().evaluate(() => innerHeight);
        if (actual === height) break;
        physicalHeight += height - actual;
        android("shell", "am", "force-stop", "pe.edu.hidromejora.app");
        android("shell", "wm", "size", width + "x" + physicalHeight);
        await restart();
        await dashboard(supply);
        await settleTutorial();
      }
      await p().evaluate(() =>
        document.querySelector("#sidebar [data-sec=incidencias]").click(),
      );
      await p().locator("#inc-list .inc-item").waitFor();
      await p().waitForFunction(
        () => !document.querySelector(".dash-sec.page-exit"),
      );
      await p().evaluate(
        () =>
          new Promise((r) =>
            requestAnimationFrame(() => requestAnimationFrame(r)),
          ),
      );
      const measured = await p().evaluate(() => ({
        width: innerWidth,
        height: innerHeight,
        native: Capacitor.getPlatform(),
        scroll: document.documentElement.scrollWidth,
      }));
      assert.equal(measured.width, width);
      assert.equal(measured.height, height);
      assert.ok(measured.scroll <= width + 1);
      measures.push({ requested: { width, height }, measured });
      screenshot(
        (before ? "before" : "after") + "-android-" + width + "-cards",
      );
      if (before) {
        assert.equal(await p().locator("[data-history-id]").count(), 0);
        continue;
      }
      await p()
        .locator('[data-history-id="' + i.id_incidencia + '"]')
        .click();
      await p().locator(".incident-event").first().waitFor();
      screenshot("after-android-" + width + "-timeline");
      if (width === 360) {
        await api(
          "/api/admin/incidencias/" + i.id_incidencia + "/estado",
          {
            estado: "En revisión",
            solicitud_id: crypto.randomUUID(),
            comentario_publico: "Revisión de laboratorio en curso.",
          },
          admin.token,
          "PATCH",
        );
        await p()
          .locator("#incident-history-current")
          .getByText("Estado actual: En revisión", { exact: true })
          .waitFor();
        assert.equal(await p().locator(".incident-event").count(), 2);
        ok(
          "WebView Android: cambio administrativo actualiza la línea de tiempo por Socket.IO sin recargar",
        );
      }
      android("shell", "input", "keyevent", "4");
      await p().waitForFunction(
        () =>
          !document
            .getElementById("incident-history-modal")
            .classList.contains("open"),
      );
      assert.ok(await p().locator("#sec-incidencias").isVisible());
    }
    ok(
      (before ? "Baseline anterior" : "Vista final") +
        ": tarjetas/fotografía/contador conservados en Android nativo 360 y 390, sin desbordamiento",
    );
    if (!before) {
      await p()
        .locator('[data-history-id="' + i.id_incidencia + '"]')
        .click();
      await p().locator(".incident-event").nth(1).waitFor();
      android("shell", "svc", "wifi", "disable");
      android("shell", "svc", "data", "disable");
      await p().locator("#incident-history-refresh").click();
      await p()
        .locator("#incident-history-error")
        .waitFor({ state: "visible" });
      await api(
        "/api/admin/incidencias/" + i.id_incidencia + "/estado",
        { estado: "Resuelta", solicitud_id: crypto.randomUUID() },
        admin.token,
        "PATCH",
      );
      android("shell", "svc", "wifi", "enable");
      android("shell", "svc", "data", "enable");
      await until(
        () =>
          p().evaluate(async () => {
            try {
              return (
                await fetch(HMShared.apiUrl("/api/health"), {
                  signal: AbortSignal.timeout(1000),
                })
              ).ok;
            } catch (_) {
              return false;
            }
          }),
        "red del AVD recuperada",
      );
      await p().locator("#incident-history-refresh").click();
      await p()
        .locator("#incident-history-current")
        .getByText("Estado actual: Resuelta", { exact: true })
        .waitFor();
      assert.equal(await p().locator(".incident-event").count(), 3);
      screenshot("android-history-reconnected");
      ok(
        "Sin red y reconexión recuperan estado/historial confirmado sin eventos duplicados",
      );
      android("shell", "input", "keyevent", "4");
      await p().waitForFunction(
        () =>
          !document
            .getElementById("incident-history-modal")
            .classList.contains("open"),
      );
      await p()
        .locator("#inc-list button")
        .filter({ hasText: "Ver foto" })
        .click();
      await p().waitForFunction(
        () => document.getElementById("foto-img").naturalWidth > 0,
      );
      screenshot("android-photo-preserved");
      android("shell", "input", "keyevent", "4");
      ok(
        "Botón Atrás cierra seguimiento y fotografía; foto original preservada",
      );
      await restart();
      await dashboard(supply);
      await settleTutorial();
      await p().evaluate(() =>
        document.querySelector("#sidebar [data-sec=incidencias]").click(),
      );
      await p()
        .locator('[data-history-id="' + i.id_incidencia + '"]')
        .click();
      await p().locator(".incident-event").nth(2).waitFor();
      ok(
        "Cierre y reapertura restauran sesión Keystore y consultan historial persistido",
      );
      await logout();
    }
    fs.writeFileSync(
      path.join(output, "incident-tracking.json"),
      JSON.stringify(
        { status: "passed", androidNative: true, before, measures },
        null,
        2,
      ),
    );
  } finally {
    android("shell", "svc", "wifi", "enable");
    android("shell", "svc", "data", "enable");
    android("shell", "wm", "size", size || "reset");
    android("shell", "wm", "density", density || "reset");
  }
};
const crypto = require("node:crypto");
