"use strict";
const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  http = require("node:http");
const {
    chromium,
  } = require("../../artifacts/vercel-validation/tools/node_modules/playwright"),
  { buildWeb } = require("../build-web");
const root = path.resolve(__dirname, "../.."),
  out = path.join(root, "artifacts/seguimiento-incidencias-120"),
  before = process.env.HM_INCIDENT_BEFORE === "1",
  pause = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, label) {
  const end = Date.now() + 15000;
  while (!(await fn())) {
    assert.ok(Date.now() < end, label);
    await pause(80);
  }
}
test(
  "Cliente y Admin: seguimiento real, responsive, respuesta perdida, Socket.IO y reconexión",
  { timeout: 150000 },
  async () => {
    const c =
        await require("../../Backend/test/incident-tracking-fixture.cjs").start(),
      created = await c.create();
    assert.equal(created.status, 201);
    const incident = created.data.incidencia;
    const target = path.join(out, before ? "before" : "after");
    fs.mkdirSync(target, { recursive: true });
    const clientDir = before
        ? path.join(target, "web")
        : buildWeb("web", { API_BASE_URL: "" }, path.join(target, "web")),
      adminDir = before
        ? path.join(target, "admin")
        : buildWeb("admin", { API_BASE_URL: "" }, path.join(target, "admin"));
    let server, browser;
    const checks = [],
      errors = [];
    const ok = (s) => {
      checks.push(s);
      console.log("OK: " + s);
    };
    try {
      server = http.createServer(async (req, res) => {
        if (req.url.startsWith("/api/") || req.url.startsWith("/socket.io/")) {
          try {
            const chunks = [];
            for await (const b of req) chunks.push(b);
            const r = await fetch(c.base + req.url, {
              method: req.method,
              headers: {
                ...req.headers,
                origin: "http://localhost:8080",
                host: new URL(c.base).host,
              },
              ...(["GET", "HEAD"].includes(req.method)
                ? {}
                : { body: Buffer.concat(chunks) }),
            });
            res.writeHead(r.status, Object.fromEntries(r.headers));
            res.end(Buffer.from(await r.arrayBuffer()));
          } catch (_) {
            res.writeHead(502);
            res.end();
          }
          return;
        }
        const url = new URL(req.url, "http://localhost"),
          base = url.pathname.startsWith("/admin/") ? adminDir : clientDir,
          relative = url.pathname.replace(/^\/(admin\/)?/, "") || "index.html",
          file = path.resolve(base, relative);
        if (!file.startsWith(base + path.sep)) {
          res.writeHead(403);
          res.end();
          return;
        }
        try {
          res.setHeader(
            "Content-Type",
            {
              ".html": "text/html",
              ".js": "text/javascript",
              ".css": "text/css",
              ".svg": "image/svg+xml",
              ".png": "image/png",
            }[path.extname(file)] || "application/octet-stream",
          );
          res.end(fs.readFileSync(file));
        } catch (_) {
          res.writeHead(404);
          res.end();
        }
      });
      await new Promise((r) => server.listen(0, "127.0.0.1", r));
      const url = "http://localhost:" + server.address().port;
      browser = await chromium.launch({
        headless: true,
        args: ["--no-sandbox"],
      });
      const pc = await browser.newContext({
          viewport: { width: 390, height: 844 },
          reducedMotion: "reduce",
        }),
        ac = await browser.newContext({
          viewport: { width: 1366, height: 768 },
          reducedMotion: "reduce",
        }),
        p = await pc.newPage(),
        a = await ac.newPage();
      for (const pg of [p, a]) {
        pg.setDefaultTimeout(15000);
        pg.on("pageerror", (e) => errors.push(e.message));
      }
      await p.goto(url);
      await p.locator("#suministro").fill(c.accounts.client.numero_suministro);
      await p.locator("#password").fill(c.accounts.client.password);
      await p.locator("#btn-login").click();
      await p.waitForFunction(() =>
        document.body.classList.contains("tutorial-open"),
      );
      await p
        .locator("#spot-skip-mobile:visible,#spot-skip:visible")
        .first()
        .click();
      await p.waitForFunction(
        () =>
          localStorage.getItem("hm_tutorial_seen") === "1" &&
          !document.body.classList.contains("tutorial-open"),
      );
      await p
        .locator("#sidebar [data-sec=incidencias]")
        .evaluate((e) => e.click());
      await p.locator("#inc-list .inc-item").first().waitFor();
      await a.goto(url + "/admin/");
      await a.locator("#admin-supply").fill(c.accounts.admin.numero_suministro);
      await a.locator("#admin-password").fill(c.accounts.admin.password);
      await a.locator("#admin-login-submit").click();
      await a.locator("#admin-nav [data-sec=admin-incidencias]").click();
      await a.locator("#admin-inc-list tr").nth(1).waitFor();
      await until(
        () => c.io.engine.clientsCount === 2,
        "dos conexiones Socket.IO reales",
      );
      for (const [width, height] of [
        [360, 800],
        [390, 844],
        [768, 1024],
        [1366, 768],
        [1920, 1080],
      ]) {
        await p.setViewportSize({ width, height });
        await a.setViewportSize({ width, height });
        for (const [pg, name] of [
          [p, "client"],
          [a, "admin"],
        ]) {
          assert.ok(
            await pg.evaluate(
              () => document.documentElement.scrollWidth <= innerWidth + 1,
            ),
          );
          await pg.screenshot({
            path: path.join(target, `${name}-${width}-cards.png`),
            fullPage: true,
          });
        }
      }
      ok("Tarjetas/tablas existentes en cinco resoluciones sin desbordamiento");
      if (before) {
        fs.writeFileSync(
          path.join(target, "result.json"),
          JSON.stringify(
            { status: "passed", baseline: "5e3ea8f", checks },
            null,
            2,
          ),
        );
        return;
      }
      await p.setViewportSize({ width: 390, height: 844 });
      await a.setViewportSize({ width: 1366, height: 768 });
      const clientOpen = () =>
          p
            .locator('[data-history-id="' + incident.id_incidencia + '"]')
            .click(),
        adminOpen = () =>
          a
            .locator('[data-history-id="' + incident.id_incidencia + '"]')
            .click();
      await clientOpen();
      await p.locator(".incident-event").waitFor();
      assert.equal(await p.locator(".incident-event").count(), 1);
      assert.equal(
        await p.locator("#incident-history-legacy").isVisible(),
        false,
      );
      await adminOpen();
      await a.locator(".incident-event").waitFor();
      // UUID se conserva cuando el servidor confirma pero la respuesta HTTP se pierde.
      let lost = false;
      await a.route("**/incidencias/*/estado", async (route) => {
        if (!lost) {
          lost = true;
          const r = await route.fetch();
          assert.equal(r.status(), 200);
          await route.abort("failed");
        } else await route.continue();
      });
      await a.locator("#incident-history-state").selectOption("En revisión");
      await a
        .locator("#incident-history-comment")
        .fill("Inspección programada. <texto público>");
      await a.locator("#incident-history-change button").click();
      await a
        .locator("#incident-history-change-result")
        .getByText(/No se confirmó/)
        .waitFor();
      await p
        .locator("#incident-history-current")
        .getByText("Estado actual: En revisión", { exact: true })
        .waitFor();
      assert.equal(await p.locator(".incident-event").count(), 2);
      ok(
        "Cambio confirmado en PostgreSQL aparece en la pantalla cliente por Socket.IO, sin recarga",
      );
      await a.locator("#incident-history-change button").click();
      await a
        .locator("#incident-history-change-result")
        .getByText(/Solicitud confirmada/)
        .waitFor();
      assert.equal(
        (await c.history(incident.id_incidencia)).data.eventos.length,
        2,
      );
      ok(
        "Respuesta perdida y reintento con UUID original no duplican el historial ni el aviso",
      );
      await a.unroute("**/incidencias/*/estado");
      await a.locator("#incident-history-state").selectOption("Resuelta");
      await a
        .locator("#incident-history-comment")
        .fill("Trabajo finalizado en el laboratorio.");
      await a.locator("#incident-history-change button").click();
      await p
        .locator("#incident-history-current")
        .getByText("Estado actual: Resuelta", { exact: true })
        .waitFor();
      assert.equal(await p.locator(".incident-event").count(), 3);
      assert.equal(
        await p.locator('script:has-text("texto público")').count(),
        0,
      );
      ok(
        "Resuelta y comentario público se actualizan; cliente no recibe identidad administrativa",
      );
      for (const [width, height] of [
        [360, 800],
        [390, 844],
        [768, 1024],
        [1366, 768],
        [1920, 1080],
      ]) {
        for (const [pg, name] of [
          [p, "client"],
          [a, "admin"],
        ]) {
          await pg.setViewportSize({ width, height });
          assert.ok(await pg.locator("#incident-history-modal").isVisible());
          await pg
            .locator(".incident-history-dialog")
            .evaluate((e) => (e.scrollTop = 0));
          const contrast = await pg
            .locator("#incident-history-current")
            .evaluate((e) => getComputedStyle(e).color);
          assert.equal(contrast, "rgb(36, 55, 70)");
          const box = await pg
            .locator(".incident-history-dialog")
            .boundingBox();
          assert.ok(box.x >= 0 && box.x + box.width <= width + 1);
          await pg.screenshot({
            path: path.join(target, `${name}-${width}-timeline.png`),
            fullPage: true,
          });
        }
      }
      await p.setViewportSize({ width: 390, height: 844 });
      await pc.setOffline(true);
      await p.locator("#incident-history-refresh").click();
      await p
        .locator("#incident-history-error")
        .getByText(/conexión/)
        .waitFor();
      await c.change(incident.id_incidencia, "En revisión");
      await pc.setOffline(false);
      await p
        .locator("#incident-history-current")
        .getByText("Estado actual: En revisión", { exact: true })
        .waitFor();
      assert.equal(await p.locator(".incident-event").count(), 4);
      ok(
        "Pérdida de red conserva lo confirmado; online/Socket.IO recuperan eventos sin duplicar",
      );
      await p.keyboard.press("Escape");
      await p.waitForFunction(
        () =>
          !document
            .getElementById("incident-history-modal")
            .classList.contains("open"),
      );
      await p
        .locator('[data-history-id="' + c.legacy.id_incidencia + '"]')
        .focus();
      await p.keyboard.press("Enter");
      await p
        .locator("#incident-history-legacy")
        .getByText(/No hay historial previo/)
        .waitFor();
      assert.equal(await p.locator(".incident-event").count(), 0);
      await p.screenshot({
        path: path.join(target, "client-legacy.png"),
        fullPage: true,
      });
      ok("Teclado/Escape y legado sin eventos inventados");
      await p.keyboard.press("Escape");
      await p.waitForFunction(
        () =>
          !document
            .getElementById("incident-history-modal")
            .classList.contains("open"),
      );
      await p
        .locator("#inc-list button")
        .filter({ hasText: "Ver foto" })
        .first()
        .click();
      await p.locator("#foto-img").waitFor();
      await p.waitForFunction(
        () =>
          document.getElementById("foto-img").complete &&
          document.getElementById("foto-img").naturalWidth > 0,
      );
      await p.keyboard.press("Escape");
      ok("Fotografía protegida conservada y visor existente funcional");
      await p.locator("#btn-nueva-incidencia").click();
      await p.locator("#inc-tipo").selectOption("Baja presión");
      await p.locator("#inc-desc").fill("Incidencia adicional desde el formulario conservado de laboratorio.");
      await p.locator("#inc-dir").fill("Referencia sin datos personales de laboratorio");
      await p.locator("#inc-foto").setInputFiles({name:"fixture.png",mimeType:"image/png",buffer:c.photo});
      const registration=p.waitForResponse(r=>r.url().endsWith('/api/incidencias')&&r.request().method()==='POST');
      await p.locator("#inc-submit").click();
      const reg=await registration;assert.equal(reg.status(),201);const newIncident=(await reg.json()).incidencia;
      await p.locator("#inc-ok").waitFor();await p.locator("#inc-view").click();
      await a.keyboard.press("Escape");
      await a.locator('[data-history-id="'+newIncident.id_incidencia+'"]').waitFor();
      await p.locator('[data-history-id="'+newIncident.id_incidencia+'"]').click();
      await p.locator('.incident-event').waitFor();assert.equal(await p.locator('.incident-event').count(),1);
      assert.equal((await c.history(newIncident.id_incidencia)).data.eventos[0].estado_nuevo,'Registrada');
      for(const pg of [p,a]){
        if(pg===a){await pg.locator('[data-history-id="'+newIncident.id_incidencia+'"]').click();await pg.locator('.incident-event').waitFor();}
        await pg.locator('#incident-history-close').focus();await pg.keyboard.press('Shift+Tab');
        assert.equal(await pg.evaluate(()=>!!document.activeElement.closest('#incident-history-modal')),true);
        await pg.keyboard.press('Tab');assert.equal(await pg.evaluate(()=>document.activeElement.id),'incident-history-close');
        await pg.keyboard.press('Escape');await pg.waitForFunction(()=>!document.getElementById('incident-history-modal').classList.contains('open'));
      }
      ok("Formulario original conserva foto/validaciones; nueva incidencia aparece en Admin sin recarga y tiene un único evento inicial");
      ok("Foco de teclado contenido en seguimiento, cierre Escape y retorno al módulo en cliente y Admin");
      assert.deepEqual(errors, []);
      fs.writeFileSync(
        path.join(target, "result.json"),
        JSON.stringify(
          { status: "passed", checks, androidNative: false },
          null,
          2,
        ),
      );
    } catch (error) {
      for (const context of browser?.contexts() || [])
        for (const pg of context.pages())
          try {
            await pg.screenshot({
              path: path.join(
                target,
                "failure-" +
                  (pg.url().includes("/admin/") ? "admin" : "client") +
                  ".png",
              ),
              fullPage: true,
            });
          } catch (_) {}
      throw error;
    } finally {
      await browser?.close();
      if (server) {
        server.closeAllConnections();
        await new Promise((r) => server.close(r));
      }
      await require("./close-native-fixture.cjs")(c);
    }
  },
);
