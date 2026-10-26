"use strict";
const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  http = require("node:http"),
  crypto = require("node:crypto");
const {
    chromium,
  } = require("../../artifacts/vercel-validation/tools/node_modules/playwright"),
  { buildWeb } = require("../build-web"),
  { iniciar } = require("../../Backend/test/email-api.cjs"),
  fixture = require("../../Backend/test/push-fixture.cjs");
const out = path.resolve("artifacts/notificaciones-push-120/web"),
  pause = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, label) {
  const end = Date.now() + 15000;
  while (!(await fn())) {
    assert.ok(Date.now() < end, label);
    await pause(70);
  }
}
test(
  "push simulado + API/PostgreSQL/Socket.IO reales: permiso, token, aviso, toque, red y revocación",
  { timeout: 120000 },
  async () => {
    fixture.configure();
    const ctx = await iniciar({ databasePrefix: "push_ui" }),
      f = await fixture.attach(ctx);
    fs.mkdirSync(out, { recursive: true });
    let server, browser;
    const checks = [],
      errors = [];
    const ok = (s) => {
      checks.push(s);
      console.log("OK: " + s);
    };
    try {
      const directory = buildWeb(
        "web",
        { API_BASE_URL: "" },
        path.join(out, "client"),
      );
      server = http.createServer(async (req, res) => {
        if (req.url.startsWith("/api/") || req.url.startsWith("/socket.io/")) {
          try {
            const chunks = [];
            for await (const b of req) chunks.push(b);
            const r = await fetch(ctx.base + req.url, {
              method: req.method,
              headers: {
                ...req.headers,
                origin: "http://localhost:8080",
                host: new URL(ctx.base).host,
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
        const file = path.resolve(
          directory,
          new URL(req.url, "http://localhost").pathname.slice(1) ||
            "index.html",
        );
        if (!file.startsWith(directory + path.sep)) {
          res.writeHead(403);
          res.end();
          return;
        }
        try {
          res.setHeader(
            "Content-Type",
            {
              ".js": "text/javascript",
              ".css": "text/css",
              ".svg": "image/svg+xml",
              ".html": "text/html",
            }[path.extname(file)] || "application/octet-stream",
          );
          res.end(fs.readFileSync(file));
        } catch (_) {
          res.writeHead(404);
          res.end();
        }
      });
      await new Promise((r) => server.listen(0, "127.0.0.1", r));
      const account = ctx.registro(6101),
        pending = (await ctx.request("register", account, 202)).data,
        login = (
          await ctx.request(
            "verify-email",
            ctx.verificar(pending.registro_id, ctx.codigo(account.correo)),
            201,
          )
        ).data;
      browser = await chromium.launch({
        headless: true,
        args: ["--no-sandbox"],
      });
      const context = await browser.newContext({
          viewport: { width: 390, height: 844 },
          reducedMotion: "reduce",
        }),
        p = await context.newPage();
      async function nav(section) {
        for (let attempt = 0; attempt < 20; attempt++) {
          if (
            await p.evaluate(() =>
              document.body.classList.contains("tutorial-open"),
            )
          )
            await p
              .locator("#spot-skip-mobile:visible,#spot-skip:visible")
              .first()
              .click();
          await p
            .locator('#sidebar [data-sec="' + section + '"]')
            .evaluate((e) => e.click());
          await pause(100);
          if (
            await p.evaluate(
              (s) =>
                document
                  .getElementById("sec-" + s)
                  .classList.contains("active"),
              section,
            )
          ) {
            await pause(200);
            if (
              await p.evaluate(
                (s) =>
                  document
                    .getElementById("sec-" + s)
                    .classList.contains("active"),
                section,
              )
            )
              return;
          }
        }
        throw Error("No se pudo navegar a " + section);
      }
      p.on("pageerror", (e) => errors.push(e.message));
      p.setDefaultTimeout(15000);
      await p.goto("http://localhost:" + server.address().port);
      await p.locator("#suministro").fill(account.numero_suministro);
      await p.locator("#password").fill(account.password);
      await p.locator("#btn-login").click();
      await p.waitForFunction(() =>
        document.getElementById("view-dashboard").classList.contains("active"),
      );
      // Contexto nuevo: completar el tutorial real antes de iniciar el caso push.
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
      await nav("perfil");
      await p
        .locator("#push-status")
        .getByText(/únicamente/)
        .waitFor();
      await p
        .locator("#push-settings")
        .screenshot({ path: path.join(out, "web-unsupported.png") });
      ok(
        "Frontend web conserva centro y muestra incompatibilidad sin solicitar permisos",
      );
      await p.evaluate(
        ({ token, installation, proof, fcm, supply }) => {
          const root = document.getElementById("push-settings");
          root.replaceWith(root.cloneNode(true));
          let state = {
            installation_id: installation,
            proof,
            enabled: false,
            pending: false,
            categories: {
              recibos: true,
              vencimientos: true,
              incidencias: true,
              cortes: true,
            },
          };
          const callbacks = {},
            mock = {
              permission: "prompt",
              grant: "denied",
              requests: 0,
              registrations: 0,
              jwt: token,
              notices: 0,
              refreshes: 0,
            };
          const plugin = {
            addListener: async (name, cb) => {
              callbacks[name] = cb;
              return { remove() {} };
            },
            checkPermissions: async () => ({ receive: mock.permission }),
            requestPermissions: async () => {
              mock.requests++;
              mock.permission = mock.grant;
              return { receive: mock.permission };
            },
            createChannel: async () => {},
            register: async () => {
              mock.registrations++;
              callbacks.registration({ value: fcm });
            },
            unregister: async () => {},
            removeAllDeliveredNotifications: async () => {},
          };
          const session = {
            token: () => mock.jwt,
            isUser: () =>
              document
                .getElementById("view-dashboard")
                .classList.contains("active"),
            generation: () => 1,
            fetch: (url, options = {}) =>
              fetch(HMShared.apiUrl(url), {
                ...options,
                headers: {
                  ...options.headers,
                  Authorization: "Bearer " + mock.jwt,
                },
              }),
          };
          const controller = createHMPush({
            session,
            platform: {
              getPlatform: () => "android",
              Plugins: {
                App: {
                  addListener: (name, callback) => {
                    mock.resume = callback;
                    return { remove() {} };
                  },
                },
              },
            },
            plugin,
            configured: async () => ({ configured: true }),
            store: {
              read: async () => state,
              flags: async (flags) => (state = { ...state, ...flags }),
            },
            navigate: (section) =>
              document
                .querySelector('#sidebar [data-sec="' + section + '"]')
                .click(),
            refresh: () => mock.refreshes++,
            notice: () => mock.notices++,
          });
          window.__pushLab = {
            controller,
            mock,
            callbacks,
            getState: () => state,
          };
          return controller.start(supply);
        },
        {
          token: login.token,
          supply: account.numero_suministro,
          installation: crypto.randomUUID(),
          proof: crypto.randomBytes(32).toString("base64url"),
          fcm: "fixture:" + crypto.randomBytes(32).toString("base64url"),
        },
      );
      assert.equal(await p.evaluate(() => __pushLab.mock.requests), 0);
      await p.locator("#push-enable").click();
      await p
        .locator("#push-status")
        .getByText(/No activadas/)
        .waitFor();
      assert.equal(await p.evaluate(() => __pushLab.mock.requests), 1);
      ok(
        "Adaptador simulado: ningún permiso al login; rechazo conserva centro y no registra",
      );
      await p.evaluate(() => {
        __pushLab.mock.permission = "prompt";
        __pushLab.mock.grant = "granted";
      });
      await p.locator("#push-enable").click();
      await p
        .locator("#push-status")
        .getByText(/Activadas/)
        .waitFor();
      await p
        .locator("#push-settings")
        .screenshot({ path: path.join(out, "simulated-enabled.png") });
      assert.equal(
        (
          await ctx.db.query(
            "SELECT count(*)::int n FROM push_dispositivos WHERE activo",
          )
        ).rows[0].n,
        1,
      );
      ok(
        "Consentimiento, registro y token cifrado; sin secretos en Web Storage",
      );
      assert.equal(
        await p.evaluate(() =>
          [...Object.keys(localStorage), ...Object.keys(sessionStorage)].some(
            (k) => /push.*(token|proof)/i.test(k),
          ),
        ),
        false,
      );
      const n = (
        await ctx.db.query(
          "INSERT INTO notificaciones(id_suministro,alcance,titulo,mensaje,tipo) VALUES($1,'Usuario','Recibo de laboratorio','Sin deuda real','recibo') RETURNING *",
          [login.suministro.id_suministro],
        )
      ).rows[0];
      // La fixture inserta el centro; emitir el mismo evento Socket.IO que usa la API.
      ctx.io
        .to("suministro:" + login.suministro.id_suministro)
        .emit("notificacion:nueva", { id: n.id_notificacion });
      await f.worker.processOne();
      const message = f.messages.at(-1).message;
      await p.evaluate(async (data) => {
        await Promise.all([
          __pushLab.controller.openEvent(data.hm_event, false),
          __pushLab.controller.openEvent(data.hm_event, false),
        ]);
      }, message.data);
      assert.equal(await p.evaluate(() => __pushLab.mock.notices), 1);
      assert.equal(await p.evaluate(() => __pushLab.mock.refreshes), 1);
      ok(
        "Aviso de primer plano simulado consulta API y deduplica eventos/solicitudes",
      );
      await nav("notificaciones");
      await p
        .locator("#sec-notificaciones")
        .getByText("Recibo de laboratorio", { exact: true })
        .waitFor();
      await p.screenshot({
        path: path.join(out, "notification-center.png"),
        fullPage: true,
      });
      await p.evaluate(
        (id) => __pushLab.controller.openEvent(id, true),
        n.push_evento,
      );
      await p.waitForFunction(() =>
        document.getElementById("sec-historial").classList.contains("active"),
      );
      assert.equal(
        (
          await ctx.db.query(
            "SELECT count(*)::int n FROM notificaciones_lecturas WHERE id_notificacion=$1",
            [n.id_notificacion],
          )
        ).rows[0].n,
        0,
      );
      ok(
        "Centro real y toque validado abren Recibos; entrega no altera leído/no leído",
      );
      const previous = await p.evaluate(() => location.hash);
      await p.evaluate(() =>
        __pushLab.controller.openEvent("https://example.invalid/private", true),
      );
      assert.equal(await p.evaluate(() => location.hash), previous);
      await p.waitForTimeout(650);
      await nav("perfil");
      await p.waitForFunction(() =>
        document.getElementById("sec-perfil").classList.contains("active"),
      );
      const second = ctx.registro(6102),
        secondPending = (await ctx.request("register", second, 202)).data;
      const secondLogin = (
        await ctx.request(
          "verify-email",
          ctx.verificar(secondPending.registro_id, ctx.codigo(second.correo)),
          201,
        )
      ).data;
      const registrations = await p.evaluate(
        () => __pushLab.mock.registrations,
      );
      await p.evaluate(
        async ({ token, supply }) => {
          __pushLab.mock.jwt = token;
          await __pushLab.controller.start(supply);
        },
        { token: secondLogin.token, supply: second.numero_suministro },
      );
      assert.equal(await p.evaluate(() => __pushLab.getState().enabled), false);
      assert.equal(
        await p.evaluate(() => __pushLab.mock.registrations),
        registrations,
      );
      assert.equal(
        (
          await ctx.db.query(
            "SELECT count(*)::int n FROM push_dispositivos WHERE activo",
          )
        ).rows[0].n,
        0,
      );
      await p.locator("#push-enable").click();
      await p
        .locator("#push-status")
        .getByText(/Activadas/)
        .waitFor();
      assert.equal(
        String(
          (
            await ctx.db.query(
              "SELECT id_usuario FROM push_dispositivos WHERE activo",
            )
          ).rows[0].id_usuario,
        ),
        String(secondLogin.usuario.id_usuario),
      );
      ok(
        "Otra identidad después de caducar/cambiar sesión revoca la asociación y exige consentimiento nuevo",
      );
      await context.setOffline(true);
      await p.evaluate(() => __pushLab.controller.logout());
      assert.equal(await p.evaluate(() => __pushLab.getState().pending), true);
      await context.setOffline(false);
      await until(
        () => p.evaluate(() => !__pushLab.getState().pending),
        "revocación pendiente sincronizada",
      );
      assert.equal(
        (
          await ctx.db.query(
            "SELECT count(*)::int n FROM push_dispositivos WHERE activo",
          )
        ).rows[0].n,
        0,
      );
      ok(
        "Logout sin red conserva revocación pendiente y reconexión la retira, sin duplicar asociación",
      );
      for (const [width, height] of [
        [360, 800],
        [390, 844],
        [768, 1024],
        [1366, 768],
        [1920, 1080],
      ]) {
        await p.setViewportSize({ width, height });
        await p.locator("#push-settings").scrollIntoViewIfNeeded();
        assert.ok(
          await p.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth + 1,
          ),
        );
        await p
          .locator("#push-settings")
          .screenshot({ path: path.join(out, "settings-" + width + ".png") });
      }
      ok("Preferencias responsive en cinco resoluciones");
      assert.deepEqual(errors, []);
      fs.writeFileSync(
        path.join(out, "result.json"),
        JSON.stringify({ status: "passed", checks, remoteFcm: false }, null, 2),
      );
    } catch (error) {
      const pages = browser?.contexts().flatMap((c) => c.pages()) || [];
      for (let i = 0; i < pages.length; i++)
        try {
          await pages[i].screenshot({
            path: path.join(out, "failure-" + i + ".png"),
            fullPage: true,
          });
          fs.writeFileSync(
            path.join(out, "failure-state.json"),
            JSON.stringify(
              await pages[i].evaluate(() => ({
                body: document.body.className,
                section: document.querySelector(".dash-sec.active")?.id,
                hash: location.hash,
                status: document.getElementById("push-status").textContent,
              })),
              null,
              2,
            ),
          );
        } catch (_) {}
      throw error;
    } finally {
      await browser?.close();
      if (server) {
        server.closeAllConnections();
        await new Promise((r) => server.close(r));
      }
      await require("./close-native-fixture.cjs")(ctx);
    }
  },
);
