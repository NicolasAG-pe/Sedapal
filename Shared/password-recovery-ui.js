/* Recuperación pública: código y permiso solo en memoria; nunca crea una sesión. */
(function (global) {
  "use strict";
  global.createHMPasswordRecovery = function ({ container, onOpen, onClose }) {
    container.innerHTML = `
      <section class="password-recovery" aria-labelledby="recovery-title">
        <h2 id="recovery-title">Recuperar contraseña</h2>
        <p class="hint">Necesitas acceso a tu correo verificado. Si activaste la verificación en dos pasos, también necesitarás tu autenticador o un código de recuperación.</p>
        <p id="recovery-message" role="status" aria-live="polite"></p>
        <p id="recovery-error" role="alert" tabindex="-1"></p>
        <form id="recovery-request">
          <div class="field"><label for="recovery-email">Correo registrado</label><input id="recovery-email" type="email" autocomplete="email" maxlength="120" required></div>
          <button class="btn btn-primary" type="submit">Solicitar código</button>
        </form>
        <form id="recovery-verify" hidden>
          <div class="field"><label for="recovery-code">Código del correo</label><input id="recovery-code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{8}" maxlength="8" minlength="8" required></div>
          <div class="field"><label for="recovery-factor">Segundo factor, si está activado</label><input id="recovery-factor" autocomplete="off" maxlength="35" aria-describedby="recovery-factor-help"><small id="recovery-factor-help">Autenticador o código de recuperación 2FA. No es el código del correo.</small></div>
          <button class="btn btn-primary" type="submit">Validar código</button>
          <button class="btn btn-ghost" type="button" id="recovery-resend">Solicitar otro código</button>
          <small id="recovery-wait" role="status"></small>
        </form>
        <form id="recovery-complete" hidden>
          <div class="field"><label for="recovery-password">Contraseña nueva</label><input id="recovery-password" type="password" autocomplete="new-password" minlength="8" maxlength="128" required aria-describedby="recovery-password-help"><small id="recovery-password-help">De 8 a 128 caracteres, con letras y números. Debe ser diferente de la anterior.</small></div>
          <div class="field"><label for="recovery-confirm">Confirmar contraseña</label><input id="recovery-confirm" type="password" autocomplete="new-password" minlength="8" maxlength="128" required></div>
          <button class="btn btn-primary" type="submit">Guardar contraseña</button>
        </form>
        <p class="hint">Si perdiste también el segundo factor, o tu cuenta administrativa aún no tiene uno, solicita revisión de identidad por un canal de atención conocido. El correo no sustituye esa revisión.</p>
        <button class="btn btn-ghost" id="recovery-back" type="button">Volver al inicio de sesión</button>
      </section>`;
    const el = (name) => container.querySelector("#recovery-" + name);
    let id = "",
      permission = "",
      email = "",
      generation = 0,
      busy = false,
      controller,
      timer,
      nextRequest = 0;
    const message = (text) => {
      el("message").textContent = text;
    };
    function step(name) {
      for (const n of ["request", "verify", "complete"])
        el(n).hidden = n !== name;
      el(
        name === "request" ? "email" : name === "verify" ? "code" : "password",
      ).focus();
    }
    function clear() {
      generation++;
      controller?.abort();
      clearInterval(timer);
      id = permission = email = "";
      busy = false;
      nextRequest = 0;
      for (const f of container.querySelectorAll("form")) f.reset();
      container.removeAttribute("aria-busy");
      for (const b of container.querySelectorAll("button")) b.disabled = false;
      el("error").textContent = "";
      message("");
      container.hidden = true;
    }
    function cooldown() {
      const remaining = Math.max(
        0,
        Math.ceil((nextRequest - Date.now()) / 1000),
      );
      el("resend").disabled = busy || remaining > 0;
      el("wait").textContent = remaining
        ? "Podrás solicitar otro código en " + remaining + " s."
        : "";
    }
    async function request(path, body) {
      controller = new AbortController();
      const deadline = setTimeout(() => controller.abort(), 20000);
      try {
        const r = await fetch(
          global.HMShared.apiUrl("/api/auth/password-recovery/" + path),
          {
            method: body ? "POST" : "GET",
            signal: controller.signal,
            cache: "no-store",
            headers: body ? { "Content-Type": "application/json" } : {},
            body: body ? JSON.stringify(body) : undefined,
          },
        );
        const data = await r.json();
        if (!r.ok)
          throw new Error(
            data.mensaje ||
              (r.status === 429
                ? "Demasiadas solicitudes. Espera unos minutos."
                : "No se pudo completar la solicitud."),
          );
        return data;
      } finally {
        clearTimeout(deadline);
      }
    }
    async function run(task) {
      if (busy) return;
      busy = true;
      const epoch = generation;
      el("error").textContent = "";
      container.setAttribute("aria-busy", "true");
      for (const b of container.querySelectorAll("button")) b.disabled = true;
      try {
        await task(() => epoch === generation);
      } catch (error) {
        if (epoch === generation) {
          el("error").textContent =
            error instanceof TypeError || error.name === "AbortError"
              ? "No pudimos confirmar la respuesta. Revisa tu conexión. Si ya guardaste la contraseña, intenta el login normal; no repitas el cambio."
              : error.message;
          el("error").focus();
        }
      } finally {
        if (epoch === generation) {
          busy = false;
          container.removeAttribute("aria-busy");
          for (const b of container.querySelectorAll("button"))
            b.disabled = false;
          cooldown();
        }
      }
    }
    async function send(current) {
      const data = await request("request", {
        solicitud_id: id,
        correo: email,
      });
      if (!current()) return;
      nextRequest = Date.now() + 60000;
      clearInterval(timer);
      timer = setInterval(cooldown, 1000);
      message(data.mensaje);
      step("verify");
    }
    el("request").addEventListener("submit", (event) => {
      event.preventDefault();
      if (!el("request").reportValidity()) return;
      const value = el("email").value.trim().toLowerCase();
      // Una respuesta perdida reintenta la misma UUID; no genera otra solicitud.
      if (!id || email !== value) id = crypto.randomUUID();
      email = value;
      run(send);
    });
    el("resend").addEventListener("click", () => {
      if (busy || Date.now() < nextRequest) return;
      id = crypto.randomUUID();
      permission = "";
      el("code").value = el("factor").value = "";
      run(send);
    });
    el("verify").addEventListener("submit", (event) => {
      event.preventDefault();
      if (!el("verify").reportValidity()) return;
      run(async (current) => {
        const body = {
          solicitud_id: id,
          codigo: el("code").value,
          factor: el("factor").value.trim(),
        };
        el("code").value = el("factor").value = "";
        const data = await request("verify", body);
        if (!current()) return;
        if (
          typeof data.permiso !== "string" ||
          !/^[\w-]{43}$/.test(data.permiso)
        )
          throw new Error(
            "No se pudo validar el permiso. Solicita otro código.",
          );
        permission = data.permiso;
        message(
          "Código validado. Tienes como máximo 2 minutos para guardar la contraseña.",
        );
        step("complete");
      });
    });
    el("complete").addEventListener("submit", (event) => {
      event.preventDefault();
      if (!el("complete").reportValidity()) return;
      const password = el("password").value,
        confirmation = el("confirm").value;
      if (
        !/[A-Za-z]/.test(password) ||
        !/[0-9]/.test(password) ||
        password !== confirmation
      ) {
        el("error").textContent =
          "Incluye letras y números y confirma la misma contraseña.";
        el("confirm").focus();
        return;
      }
      run(async (current) => {
        el("password").value = el("confirm").value = "";
        const data = await request("complete", {
          solicitud_id: id,
          permiso: permission,
          password_nueva: password,
          password_confirmacion: confirmation,
        });
        if (!current()) return;
        clear();
        onClose(data.mensaje, true);
      });
    });
    el("back").addEventListener("click", () => {
      if (!busy) {
        clear();
        onClose("");
      }
    });
    return {
      clear,
      open() {
        clear();
        onOpen();
        container.hidden = false;
        step("request");
        run(async (current) => {
          const data = await request("capabilities");
          if (current() && !data.disponible)
            throw new Error(
              "La recuperación no está disponible temporalmente. Contacta por los canales de atención.",
            );
        });
      },
    };
  };
})(window);
