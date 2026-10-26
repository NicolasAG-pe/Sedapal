"use strict";
const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  http = require("node:http");
const {
  chromium,
} = require("../../artifacts/vercel-validation/tools/node_modules/playwright");
const { iniciar } = require("../../Backend/test/email-api.cjs"),
  fixture = require("../../Backend/test/password-recovery-fixture.cjs");
const { buildWeb } = require("../build-web");
const out = path.resolve("artifacts/recuperacion-clave-120/web");
const wait = async (fn, label) => {
  const end = Date.now() + 15000;
  while (!(await fn())) {
    assert.ok(Date.now() < end, label);
    await new Promise((r) => setTimeout(r, 60));
  }
};
test(
  "recuperación cliente y Admin: pantallas reales, correo simulado, MFA, red y responsive",
  { timeout: 120000 },
  async () => {
    fs.mkdirSync(out, { recursive: true });
    fixture.configure();
    const ctx = await iniciar({ databasePrefix: "reset_ui" }),
      mail = await fixture.attach(ctx);
    let browser, server;
    const errors = [],
      checks = [];
    const ok = (s) => {
      checks.push(s);
      console.log("OK: " + s);
    };
    try {
      const client = buildWeb(
          "web",
          { API_BASE_URL: "" },
          path.join(out, "client"),
        ),
        admin = buildWeb(
          "admin",
          { API_BASE_URL: "" },
          path.join(out, "admin"),
        );
      server = http.createServer(async (req, res) => {
        if (req.url.startsWith("/api/") || req.url.startsWith("/socket.io/")) {
          try {
            const chunks = [];
            for await (const b of req) chunks.push(b);
            const r = await fetch(ctx.base + req.url, {
              method: req.method,
              headers: { ...req.headers, host: new URL(ctx.base).host },
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
          base = url.pathname.startsWith("/admin/") ? admin : client,
          relative = url.pathname.replace(/^\/(admin\/)?/, "") || "index.html",
          file = path.resolve(base, relative);
        if (!file.startsWith(base + path.sep)) {
          res.writeHead(403);
          res.end();
          return;
        }
        try {
          const content = fs.readFileSync(file),
            ext = path.extname(file);
          res.setHeader(
            "Content-Type",
            {
              ".html": "text/html",
              ".js": "text/javascript",
              ".css": "text/css",
              ".svg": "image/svg+xml",
              ".png": "image/png",
            }[ext] || "application/octet-stream",
          );
          res.end(content);
        } catch (_) {
          res.writeHead(404);
          res.end();
        }
      });
      await new Promise((r) => server.listen(0, "127.0.0.1", r));
      const base = "http://localhost:" + server.address().port;
      browser = await chromium.launch({
        headless: true,
        args: ["--no-sandbox"],
      });
      let index = 4000;
      async function account(admin = false) {
        const a = ctx.registro(++index);
        const p = (await ctx.request("register", a, 202)).data,
          d = (
            await ctx.request(
              "verify-email",
              ctx.verificar(p.registro_id, ctx.codigo(a.correo)),
              201,
            )
          ).data;
        let factor = "";
        if (admin) {
          await ctx.db.query(
            "UPDATE usuarios SET rol='admin' WHERE id_usuario=$1",
            [d.usuario.id_usuario],
          );
          let token = (
            await ctx.request(
              "login",
              { numero_suministro: a.numero_suministro, password: a.password },
              200,
            )
          ).data.token;
          const post = async (p, b) => {
            const r = await fetch(ctx.base + p, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: "Bearer " + token,
              },
              body: JSON.stringify(b),
            });
            assert.equal(r.status, 200);
            return r.json();
          };
          await post("/api/auth/2fa/setup", { password: a.password });
          const row = (
            await ctx.db.query(
              "SELECT pendiente_secreto FROM usuario_2fa WHERE id_usuario=$1",
              [d.usuario.id_usuario],
            )
          ).rows[0];
          const secret = require("../../Backend/totp-crypto")
            .crearCifradoTotp(process.env)
            .decrypt(row.pendiente_secreto, d.usuario.id_usuario);
          const OTPAuth = require("../../Backend/node_modules/otpauth");
          const data = await post("/api/auth/2fa/confirm", {
            codigo: new OTPAuth.TOTP({
              secret: OTPAuth.Secret.fromBase32(secret),
            }).generate(),
          });
          factor = data.codigos_recuperacion[0];
        }
        return { ...a, factor };
      }
      const a = await account(),
        adm = await account(true);
      for (const [width, height] of [
        [360, 800],
        [390, 844],
        [768, 1024],
        [1366, 768],
        [1920, 1080],
      ]) {
        for (const isAdmin of [false, true]) {
          const context = await browser.newContext({
              viewport: { width, height },
            }),
            p = await context.newPage();
          p.on("pageerror", (e) => errors.push(e.message));
          await p.goto(base + (isAdmin ? "/admin/" : ""));
          await p.locator(isAdmin ? "#admin-forgot" : "#forgot-link").click();
          await p.locator("#recovery-email").waitFor();
          await p.screenshot({
            path: path.join(
              out,
              `${isAdmin ? "admin" : "client"}-${width}-email.png`,
            ),
            fullPage: true,
          });
          assert.ok(await p.locator("#recovery-request button").isVisible());
          assert.ok(
            await p.evaluate(
              () => document.documentElement.scrollWidth <= innerWidth + 1,
            ),
          );
          const box = await p.locator("#recovery-email").boundingBox();
          assert.ok(box.width >= 220, "campo legible");
          await p.locator("#recovery-back").click();
          await context.close();
        }
      }
      ok(
        "10 pantallas de correo: 5 resoluciones × cliente/Admin, sin desbordamiento y campos legibles",
      );
      for (const [isAdmin, account] of [
        [false, a],
        [true, adm],
      ]) {
        const context = await browser.newContext({
            viewport: isAdmin
              ? { width: 1366, height: 768 }
              : { width: 390, height: 844 },
          }),
          p = await context.newPage();
        p.on("pageerror", (e) => errors.push(e.message));
        await p.goto(base + (isAdmin ? "/admin/" : ""));
        await p.locator(isAdmin ? "#admin-forgot" : "#forgot-link").click();
        await p.locator("#recovery-email").fill(account.correo);
        // Pérdida de respuesta: el servidor sí procesa; el reintento debe conservar UUID.
        let lost = false;
        await p.route("**/password-recovery/request", async (route) => {
          if (!lost) {
            lost = true;
            await route.fetch();
            await route.abort("failed");
          } else await route.continue();
        });
        await p.locator("#recovery-request button").click();
        await p
          .locator("#recovery-error")
          .getByText(/No pudimos/)
          .waitFor();
        await p.locator("#recovery-request button").click();
        await p.locator("#recovery-verify").waitFor({ state: "visible" });
        const count = (
          await ctx.db.query(
            "SELECT count(*)::int n FROM recuperaciones_clave r JOIN recuperacion_clave_outbox o ON r.id=o.solicitud_id WHERE o.proposito='codigo'",
          )
        ).rows[0].n;
        assert.equal(count, isAdmin ? 2 : 1);
        await mail.drain();
        await p
          .locator("#recovery-code")
          .fill(
            "99999999" === mail.code(account.correo) ? "00000000" : "99999999",
          );
        await p.locator("#recovery-verify button[type=submit]").click();
        await p
          .locator("#recovery-error")
          .getByText(/inválido/)
          .waitFor();
        await p.locator("#recovery-code").fill(mail.code(account.correo));
        if (isAdmin) await p.locator("#recovery-factor").fill(account.factor);
        await p.locator("#recovery-verify button[type=submit]").click();
        await p.locator("#recovery-complete").waitFor({ state: "visible" });
        await p.screenshot({
          path: path.join(
            out,
            (isAdmin ? "admin" : "client") + "-password.png",
          ),
          fullPage: true,
        });
        assert.ok(
          await p.evaluate(
            () =>
              ![
                ...Object.keys(localStorage),
                ...Object.keys(sessionStorage),
              ].some((k) => /recovery|permiso/.test(k)),
          ),
        );
        await p.locator("#recovery-password").fill("NuevaFixture987");
        await p.locator("#recovery-confirm").fill("DistintaFixture12");
        await p.locator("#recovery-complete button").click();
        assert.ok(await p.locator("#recovery-error").isVisible());
        await p.locator("#recovery-confirm").fill("NuevaFixture987");
        await p.locator("#recovery-complete button").click();
        await p
          .locator(isAdmin ? "#admin-login-form" : "#login-form")
          .waitFor({ state: "visible" });
        await p.screenshot({
          path: path.join(out, (isAdmin ? "admin" : "client") + "-success.png"),
          fullPage: true,
        });
        assert.equal(await p.locator("#password-recovery").isVisible(), false);
        assert.equal(
          await p
            .locator(isAdmin ? "#admin-login-error" : "#form-error")
            .getAttribute("data-result"),
          "success",
        );
        await ctx.request(
          "login",
          {
            numero_suministro: account.numero_suministro,
            password: account.password,
          },
          401,
        );
        const login = await ctx.request(
          "login",
          {
            numero_suministro: account.numero_suministro,
            password: "NuevaFixture987",
          },
          isAdmin ? 202 : 200,
        );
        if (isAdmin) assert.equal(login.data.estado, "segundo_factor");
        ok(
          (isAdmin ? "Admin con 2FA" : "Cliente") +
            ": código incorrecto, respuesta perdida idempotente, contraseña validada, sesión no automática y login normal",
        );
        await context.close();
      }
      assert.deepEqual(errors, []);
      ok(
        "Sin errores JavaScript; secretos de recuperación ausentes de Web Storage",
      );
      fs.writeFileSync(
        path.join(out, "result.json"),
        JSON.stringify({ status: "passed", checks, errors }, null, 2),
      );
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
