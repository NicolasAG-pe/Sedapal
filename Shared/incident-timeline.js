/* Línea de tiempo de consulta compartida. No contiene controles de modificación. */
(function (global) {
  "use strict";
  global.createHMIncidentTimeline = function ({
    container = document.body,
    apiFetch,
    path,
    isActive,
    openDialog,
    closeDialog,
    onSnapshot = () => {},
    onClosed = () => {},
  } = {}) {
    const modal = document.createElement("div");
    modal.className = "overlay incident-history-modal";
    modal.id = "incident-history-modal";
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.setAttribute("aria-hidden", "true");
    modal.setAttribute("aria-labelledby", "incident-history-title");
    modal.innerHTML = `<div class="dialog incident-history-dialog"><div class="dialog-head"><div><h3 id="incident-history-title">Seguimiento de incidencia</h3><p id="incident-history-current"></p></div><button type="button" class="icon-btn" id="incident-history-close" aria-label="Cerrar seguimiento">×</button></div><div class="dialog-body"><p id="incident-history-updated" class="hint"></p><p id="incident-history-legacy" class="incident-history-legacy" hidden></p><p id="incident-history-error" role="alert" tabindex="-1"></p><p id="incident-history-loading" role="status" aria-live="polite"></p><ol id="incident-history-events" class="incident-timeline" aria-label="Eventos de la incidencia"></ol><div class="incident-history-actions"><button class="btn btn-ghost" type="button" id="incident-history-more" hidden>Ver más eventos</button><button class="btn btn-ghost" type="button" id="incident-history-refresh">Actualizar seguimiento</button></div></div></div>`;
    container.append(modal);
    const el = (s) => modal.querySelector("#incident-history-" + s),
      events = new Map();
    let id = "",
      version = 0,
      loading = false,
      refreshPending = false,
      cursor = "",
      more = false,
      controller = null;
    const date = (v) => {
      if (!v) return "Fecha no disponible";
      const d = new Date(v);
      return isNaN(d)
        ? "Fecha no disponible"
        : new Intl.DateTimeFormat("es-PE", {
            timeZone: "America/Lima",
            dateStyle: "medium",
            timeStyle: "medium",
            hour12: false,
          }).format(d);
    };
    const node = (tag, className, text) => {
      const n = document.createElement(tag);
      if (className) n.className = className;
      if (text !== undefined) n.textContent = text;
      return n;
    };
    function clear() {
      version++;
      controller?.abort();
      controller = null;
      id = "";
      loading = refreshPending = false;
      cursor = "";
      more = false;
      events.clear();
      el("events").replaceChildren();
      el("current").textContent =
        el("updated").textContent =
        el("legacy").textContent =
        el("error").textContent =
        el("loading").textContent =
          "";
      el("legacy").hidden = true;
      el("more").hidden = true;
      modal.removeAttribute("aria-busy");
      onClosed();
    }
    modal.hmOnClose = clear;
    function hide() {
      closeDialog(modal);
      clear();
    }
    function render() {
      el("events").replaceChildren();
      for (const e of events.values()) {
        const li = node("li", "incident-event");
        li.dataset.eventId = e.id;
        li.append(
          node(
            "strong",
            "",
            e.tipo === "registro"
              ? "Incidencia registrada"
              : e.estado_anterior + " → " + e.estado_nuevo,
          ),
        );
        const time = node("time", "", date(e.fecha));
        time.dateTime = e.fecha;
        li.append(time);
        li.append(
          node("span", "incident-event-state", "Estado: " + e.estado_nuevo),
        );
        if (e.responsable?.etiqueta)
          li.append(node("small", "", e.responsable.etiqueta));
        if (e.comentario_publico)
          li.append(node("p", "incident-event-comment", e.comentario_publico));
        el("events").append(li);
      }
      if (!events.size)
        el("events").append(
          node(
            "li",
            "incident-event-empty",
            "Sin eventos de seguimiento registrados.",
          ),
        );
      el("more").hidden = !more;
    }
    async function load() {
      if (!id || !isActive() || !modal.classList.contains("open")) return;
      if (loading) {
        refreshPending = true;
        return;
      }
      loading = true;
      const epoch = version;
      controller = new AbortController();
      modal.setAttribute("aria-busy", "true");
      el("loading").textContent = "Consultando seguimiento…";
      el("error").textContent = "";
      el("refresh").disabled = el("more").disabled = true;
      try {
        const r = await apiFetch(path(id, cursor), {
          cache: "no-store",
          signal: controller.signal,
        });
        const data = await r.json();
        if (epoch !== version || !isActive()) return;
        if (!r.ok) {
          if (r.status === 404) {
            events.clear();
            el("events").replaceChildren();
            el("current").textContent = el("updated").textContent = "";
          }
          throw Error(data?.mensaje || "No se pudo consultar el seguimiento.");
        }
        const item = data.incidencia;
        el("title").textContent =
          "Seguimiento · Incidencia #" + item.id_incidencia;
        el("current").textContent = "Estado actual: " + item.estado_actual;
        el("updated").textContent = item.ultima_actualizacion
          ? "Última actualización registrada: " +
            date(item.ultima_actualizacion)
          : "Sin actualizaciones de seguimiento registradas.";
        el("legacy").hidden = item.historial_completo === true;
        el("legacy").textContent =
          "Registro original (fecha/hora tal como constan, sin zona declarada): " +
          (item.fecha_registro_original || "No disponible") +
          ". No hay historial previo disponible. El estado actual procede de la incidencia; no se reconstruyen cambios anteriores.";
        for (const e of data.eventos) {
          if (!events.has(e.id)) events.set(e.id, e);
          cursor = e.id;
        }
        more = !!data.siguiente;
        render();
        onSnapshot(data);
      } catch (error) {
        if (epoch === version && isActive() && error.name !== "AbortError")
          el("error").textContent =
            error.message && !(error instanceof TypeError)
              ? error.message
              : "Sin conexión. Se conserva lo último confirmado; pulsa Actualizar al recuperar la red.";
      } finally {
        if (epoch === version) {
          loading = false;
          controller = null;
          modal.removeAttribute("aria-busy");
          el("loading").textContent = "";
          el("refresh").disabled = el("more").disabled = false;
          if (refreshPending) {
            refreshPending = false;
            load();
          }
        }
      }
    }
    el("close").addEventListener("click", hide);
    el("refresh").addEventListener("click", load);
    el("more").addEventListener("click", load);
    modal.addEventListener("click", (e) => {
      if (e.target === modal) hide();
    });
    modal.addEventListener("keydown", (e) => {
      if (e.key !== "Tab" || !modal.classList.contains("open")) return;
      const controls = [...modal.querySelectorAll("button:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex='0']")]
        .filter((n) => !n.hidden && n.getClientRects().length);
      if (!controls.length) return;
      e.stopPropagation();
      if (e.shiftKey && document.activeElement === controls[0]) {
        e.preventDefault(); controls.at(-1).focus();
      } else if (!e.shiftKey && document.activeElement === controls.at(-1)) {
        e.preventDefault(); controls[0].focus();
      }
    });
    const reconnect = () => {
      if (id) load();
    };
    global.addEventListener("online", reconnect);
    return {
      modal,
      body: modal.querySelector(".dialog-body"),
      currentId: () => id,
      open(value, opener) {
        if (!/^[1-9][0-9]{0,18}$/.test(String(value)) || !isActive()) return;
        clear();
        id = String(value);
        el("title").textContent = "Seguimiento · Incidencia #" + id;
        openDialog(modal, opener);
        load();
      },
      refresh: load,
      clear() {
        if (modal.classList.contains("open")) closeDialog(modal);
        clear();
      },
      destroy() {
        closeDialog(modal);
        clear();
        global.removeEventListener("online", reconnect);
        modal.remove();
      },
    };
  };
})(window);
