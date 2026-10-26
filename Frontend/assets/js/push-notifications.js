/* Push es un aviso: autorización y datos se consultan siempre en PostgreSQL/API. */
(function (global) {
  "use strict";
  const categories = ["recibos", "vencimientos", "incidencias", "cortes"],
    valid = (id) =>
      typeof id === "string" &&
      /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(id);
  global.createHMPush = function ({
    session,
    navigate,
    refresh,
    notice,
    platform = global.Capacitor,
    store,
    plugin,
    configured,
  } = {}) {
    const root = document.getElementById("push-settings"),
      el = (id) => document.getElementById("push-" + id);
    const native = platform?.getPlatform?.() === "android";
    plugin = plugin || platform?.Plugins?.PushNotifications;
    store = store || {
      read: () => platform.nativePromise("HidroPushState", "read", {}),
      flags: (options) =>
        platform.nativePromise("HidroPushState", "flags", options),
    };
    const nativeConfig =
      configured ||
      (() => platform.nativePromise("HidroPushState", "configuration", {}));
    let epoch = 0,
      authGeneration = -1,
      owner = "",
      active = false,
      state = null,
      fcmToken = "",
      available = false,
      ready = false,
      busy = false,
      pendingEvent = null,
      sequence = Promise.resolve(),
      registered = false;
    const seen = new Set(),
      resolving = new Map();
    const status = (text) => {
      el("status").textContent = text;
    };
    const current = (e) =>
      active &&
      session.isUser() &&
      e === epoch &&
      session.generation() === authGeneration;
    const serialize = (fn) => {
      const p = sequence.then(fn);
      sequence = p.catch(() => {});
      return p;
    };
    const prefs = () =>
      Object.fromEntries(categories.map((k) => [k, el(k).checked]));
    function render() {
      el("enable").disabled = busy || !native || !available || !ready;
      el("disable").disabled = busy || !state?.enabled;
      el("save").disabled = busy || !state?.enabled || !fcmToken;
    }
    async function request(path, body, authenticated = true) {
      const opts = {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(7000),
      };
      const r = authenticated
        ? await session.fetch(path, opts)
        : await fetch(global.HMShared.apiUrl(path), opts);
      if (!r.ok)
        throw Error(
          "No se pudo sincronizar. Revisa tu conexión y vuelve a intentarlo.",
        );
      return r.status === 204 ? null : r.json();
    }
    async function flush() {
      if (!state?.pending) return true;
      try {
        await request(
          "/api/push/revoke",
          { installation_id: state.installation_id, proof: state.proof },
          false,
        );
        state = await store.flags({
          enabled: false,
          pending: false,
          categories: state.categories,
        });
        return true;
      } catch (_) {
        return false;
      }
    }
    async function bind(token, e) {
      if (!current(e) || !state?.enabled || !ready || !available) return;
      await request("/api/push/devices", {
        installation_id: state.installation_id,
        proof: state.proof,
        token,
        consent: true,
        categories: state.categories,
      });
      if (!current(e)) return;
      fcmToken = token;
      status(
        "Activadas en este dispositivo. Los avisos no muestran datos privados.",
      );
      render();
    }
    async function handleEvent(id, tap) {
      if (!valid(id)) return;
      const e = epoch;
      if (!current(e)) {
        if (tap) pendingEvent = id;
        return;
      }
      try {
        const r = await session.fetch(
          "/api/push/events/" + encodeURIComponent(id),
          { cache: "no-store" },
        );
        if (!r.ok) {
          pendingEvent = null;
          return;
        }
        const data = await r.json();
        if (!current(e)) return;
        if (!["historial", "incidencias", "cortes"].includes(data.seccion))
          return;
        refresh();
        if (tap) {
          pendingEvent = null;
          await navigate(data.seccion);
        } else if (!seen.has(id)) {
          seen.add(id);
          if (seen.size > 100) seen.delete(seen.values().next().value);
          notice("Tienes un nuevo aviso de Hidro-Mejora.");
        }
      } catch (_) {
        if (tap) pendingEvent = id;
      }
    }
    function openEvent(id, tap) {
      if (!valid(id) || (!tap && seen.has(id))) return Promise.resolve();
      const key = (tap ? "tap:" : "receive:") + id;
      if (resolving.has(key)) return resolving.get(key);
      const task = handleEvent(id, tap);
      resolving.set(key, task);
      task.finally(() => resolving.delete(key));
      return task;
    }
    async function listeners() {
      if (registered || !native || !plugin) return;
      registered = true;
      await plugin.addListener("registration", (event) => {
        const e = epoch;
        if (typeof event.value !== "string") return;
        serialize(() => bind(event.value, e)).catch(() => {
          if (current(e))
            status("No se pudo autorizar el dispositivo. Revisa tu conexión.");
        });
      });
      await plugin.addListener("registrationError", () => {
        if (active)
          status(
            "No se pudo registrar el dispositivo. Verifica la configuración y tu conexión.",
          );
      });
      await plugin.addListener("pushNotificationReceived", (event) => {
        openEvent(event.data?.hm_event, false);
      });
      await plugin.addListener("pushNotificationActionPerformed", (action) => {
        openEvent(action.notification?.data?.hm_event, true);
      });
    }
    async function initialize(e) {
      if (!native || !plugin) {
        status(
          "Push disponible únicamente en la aplicación Android compatible. El centro de notificaciones sigue funcionando.",
        );
        render();
        return;
      }
      state = await store.read();
      if (!current(e)) return;
      if (state.owner !== owner) {
        if (state.enabled || state.pending) await disable(false);
        if (!current(e)) return;
        state = await store.flags({
          enabled: false,
          pending: state.pending,
          owner,
          categories: Object.fromEntries(categories.map((k) => [k, true])),
        });
      }
      for (const k of categories)
        el(k).checked = state.categories?.[k] !== false;
      if (!(await flush())) {
        status(
          "Desactivación pendiente de sincronizar. Conéctate antes de volver a activar.",
        );
        render();
        return;
      }
      const config = await nativeConfig();
      if (!current(e)) return;
      ready = config.configured === true;
      const response = await fetch(
          global.HMShared.apiUrl("/api/push/capabilities"),
          { signal: AbortSignal.timeout(7000), cache: "no-store" },
        ),
        caps = await response.json();
      if (!current(e)) return;
      available = caps.disponible === true;
      const permission = await plugin.checkPermissions();
      if (!current(e)) return;
      el("permission").textContent =
        permission.receive === "granted"
          ? "Permiso Android concedido"
          : ["denied", "prompt-with-rationale"].includes(permission.receive)
            ? "Permiso Android denegado"
            : "Permiso Android aún no solicitado";
      status(
        !ready
          ? "Firebase pendiente de configuración autorizada. No se enviarán notificaciones remotas."
          : !available
            ? "Entrega push desactivada en el servidor."
            : state.enabled
              ? "Comprobando dispositivo…"
              : "Puedes activar avisos después de leer la explicación.",
      );
      render();
      if (
        ready &&
        available &&
        state.enabled &&
        permission.receive === "granted"
      ) {
        await plugin.createChannel({
          id: "hm_updates",
          name: "Hidro-Mejora",
          description: "Avisos de tu servicio",
          importance: 3,
          visibility: 0,
        });
        if (!fcmToken) await plugin.register();
      }
      if (
        state.enabled &&
        ["denied", "prompt-with-rationale"].includes(permission.receive)
      ) {
        await disable(false);
        status(
          "Permiso denegado. Puedes cambiarlo en los ajustes Android; tu centro de notificaciones continúa disponible.",
        );
      }
      if (pendingEvent) await openEvent(pendingEvent, true);
    }
    async function run(fn) {
      if (busy) return;
      busy = true;
      render();
      try {
        await fn();
      } catch (_) {
        status(
          "No se pudo completar la operación. Revisa tu conexión o la configuración.",
        );
      } finally {
        busy = false;
        render();
      }
    }
    async function disable(show = true) {
      fcmToken = "";
      if (!native || !state) return;
      state = await store.flags({
        enabled: false,
        pending: true,
        categories: state.categories,
      });
      let removed = await flush();
      if (ready) {
        try {
          await plugin.unregister();
          await plugin.removeAllDeliveredNotifications();
        } catch (_) {
          removed = false;
        }
      }
      if (show)
        status(
          removed
            ? "Notificaciones push desactivadas."
            : "Desactivadas en la app; revocación remota pendiente de conexión.",
        );
      render();
    }
    el("enable").addEventListener("click", () =>
      run(async () => {
        const e = epoch;
        if (!current(e) || !ready || !available) return;
        await serialize(async () => {
          if (!(await flush())) throw Error();
          let permission = await plugin.checkPermissions();
          if (permission.receive !== "granted")
            permission = await plugin.requestPermissions();
          if (!current(e)) return;
          el("permission").textContent =
            permission.receive === "granted"
              ? "Permiso Android concedido"
              : "Permiso Android denegado";
          if (permission.receive !== "granted") {
            status(
              "No activadas. Puedes conservar los avisos dentro de la app.",
            );
            return;
          }
          state = await store.flags({
            enabled: true,
            pending: false,
            categories: prefs(),
            owner,
          });
          await plugin.createChannel({
            id: "hm_updates",
            name: "Hidro-Mejora",
            description: "Avisos de tu servicio",
            importance: 3,
            visibility: 0,
          });
          await plugin.register();
        });
      }),
    );
    el("disable").addEventListener("click", () =>
      run(() => serialize(() => disable())),
    );
    el("save").addEventListener("click", () =>
      run(async () => {
        const e = epoch;
        await serialize(async () => {
          if (!current(e) || !fcmToken) return;
          state = await store.flags({
            enabled: true,
            pending: false,
            categories: prefs(),
            owner,
          });
          await bind(fcmToken, e);
        });
      }),
    );
    window.addEventListener("online", () => {
      if (active && session.isUser())
        run(() => serialize(() => initialize(epoch)));
      else if (native)
        serialize(async () => {
          state = await store.read();
          await flush();
        }).catch(() => {});
    });
    try {
      if (native && platform?.Plugins?.App)
        Promise.resolve(
          platform.Plugins.App.addListener("appStateChange", (event) => {
            if (event.isActive && active && session.isUser())
              run(() => serialize(() => initialize(epoch)));
          }),
        ).catch(() => {});
    } catch (_) {}
    listeners().catch(() => {
      registered = false;
    });
    return {
      start(supply) {
        if (!native || !plugin) {
          status(
            "Push disponible únicamente en la aplicación Android compatible. El centro de notificaciones sigue funcionando.",
          );
          render();
          return Promise.resolve();
        }
        if (typeof supply !== "string" || !/^\d{9}$/.test(supply)) {
          status("No se pudo comprobar el contexto push.");
          return Promise.resolve();
        }
        // Solo contexto local de consentimiento: la autorización sigue en REST.
        let claims;
        try {
          claims = JSON.parse(
            atob(
              session
                .token()
                .split(".")[1]
                .replace(/-/g, "+")
                .replace(/_/g, "/"),
            ),
          );
        } catch (_) {
          {
            status("No se pudo comprobar el contexto push.");
            return Promise.resolve();
          }
        }
        const user = String(claims.id_usuario || "");
        if (
          !/^[1-9][0-9]{0,18}$/.test(user) ||
          String(claims.numero_suministro) !== supply
        ) {
          status("No se pudo comprobar el contexto push.");
          return Promise.resolve();
        }
        owner = user + ":" + supply;
        active = true;
        authGeneration = session.generation();
        const e = ++epoch;
        fcmToken = "";
        seen.clear();
        return serialize(() => initialize(e)).catch(() => {
          if (current(e))
            status(
              "No se pudo consultar push. El centro de notificaciones sigue disponible.",
            );
        });
      },
      logout() {
        active = false;
        epoch++;
        fcmToken = "";
        pendingEvent = null;
        seen.clear();
        if (!native || !plugin) return Promise.resolve();
        return serialize(async () => {
          state = await store.read();
          if (state.enabled || state.pending) await disable(false);
        });
      },
      refresh() {
        if (active) return run(() => serialize(() => initialize(epoch)));
      },
      openEvent,
    };
  };
})(window);
