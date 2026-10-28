/* Controles de revisión exclusivos del panel; nunca se empaquetan en Android. */
(function (global) {
  "use strict";
  global.createHMIncidentReview = function (options) {
    const form = document.createElement("form");
    form.id = "incident-history-change";
    form.className = "incident-history-change";
    form.innerHTML = `<h4>Actualizar estado</h4><label for="incident-history-state">Nuevo estado</label><select id="incident-history-state"><option>Registrada</option><option>En revisión</option><option>Resuelta</option></select><label for="incident-history-comment">Comentario público (opcional)</label><textarea id="incident-history-comment" maxlength="300" rows="2" aria-describedby="incident-history-comment-help"></textarea><small id="incident-history-comment-help">Visible para el cliente. No incluyas datos personales ni notas internas. Solo se registra cuando cambia el estado.</small><button class="btn btn-primary" type="submit">Guardar cambio</button><p id="incident-history-change-result" role="status" aria-live="polite"></p>`;
    const el = (id) => form.querySelector("#incident-history-" + id);
    let version = 0,
      writing = false,
      dirty = false;
    const view = global.createHMIncidentTimeline({
      ...options,
      onSnapshot: (data) => {
        if (!writing && !dirty)
          el("state").value = data.incidencia.estado_actual;
      },
      onClosed: () => {
        version++;
        writing = dirty = false;
        form.reset();
        el("change-result").textContent = "";
        form
          .querySelectorAll("button,select,textarea")
          .forEach((c) => (c.disabled = false));
      },
    });
    view.body.append(form);
    el("state").addEventListener("change", () => {
      dirty = true;
    });
    el("comment").addEventListener("input", () => {
      dirty = true;
    });
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (writing || !view.currentId() || !options.isActive()) return;
      writing = true;
      const epoch = version;
      el("change-result").textContent = "Guardando cambio…";
      const controls = [...form.querySelectorAll("button,select,textarea")];
      controls.forEach((c) => (c.disabled = true));
      try {
        const result = await options.change(
          view.currentId(),
          el("state").value,
          el("comment").value,
        );
        if (epoch !== version || !options.isActive()) return;
        if (result) {
          dirty = false;
          el("comment").value = "";
          el("change-result").textContent = result.cambiada
            ? "Cambio guardado y registrado."
            : "Solicitud confirmada. Consulta el estado actual del historial.";
          view.refresh();
        } else
          el("change-result").textContent =
            "No se confirmó el cambio. Revisa la conexión y vuelve a intentar el mismo cambio.";
      } catch (_) {
        if (epoch === version && options.isActive())
          el("change-result").textContent =
            "No se confirmó el cambio. Consulta el historial antes de reintentar.";
      } finally {
        if (epoch === version) {
          writing = false;
          controls.forEach((c) => (c.disabled = false));
        }
      }
    });
    return view;
  };
})(window);
