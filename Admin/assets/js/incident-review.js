/* Controles de revisión exclusivos del panel; nunca se empaquetan en Android. */
(function (global) {
  "use strict";
  global.createHMIncidentReview = function (options) {
    const dialogs = global.HMAdminDialog;
    const dialog = document.createElement("dialog");
    dialog.className = "admin-dialog admin-dialog--wide";
    dialog.setAttribute("aria-labelledby", "incident-history-title");
    const form = document.createElement("form");
    form.id = "incident-history-change";
    form.className = "incident-history-change";
    form.innerHTML = `<h4>Actualizar estado</h4><label for="incident-history-state">Nuevo estado</label><select id="incident-history-state"><option>Registrada</option><option>En revisión</option><option>Resuelta</option></select><label for="incident-history-comment">Comentario público (opcional)</label><textarea id="incident-history-comment" maxlength="300" rows="2" aria-describedby="incident-history-comment-help"></textarea><small id="incident-history-comment-help">Visible para el cliente. No incluyas datos personales ni notas internas. Solo se registra cuando cambia el estado.</small><button class="btn btn-primary" type="submit">Guardar cambio</button><p id="incident-history-change-result" role="status" aria-live="polite"></p>`;
    const el = (id) => form.querySelector("#incident-history-" + id);
    let version = 0,
      writing = false,
      initialState = "";
    const view = global.createHMIncidentTimeline({
      ...options,
      openDialog(modal, opener) {
        modal.classList.add("open");
        modal.removeAttribute("aria-hidden");
        dialogs.open(dialog, opener);
      },
      closeDialog() { dialogs.close(dialog, {restore:false}); },
      onSnapshot: (data) => {
        if (!writing && (!initialState || el("state").value === initialState))
          el("state").value = data.incidencia.estado_actual;
        initialState = data.incidencia.estado_actual;
        form.hidden = false;
        if (!writing) submit.disabled = false;
      },
      onClosed: () => {
        version++;
        writing = false;
        initialState = "";
        form.hidden = true;
        form.removeAttribute("aria-busy");
        form.reset();
        submit.disabled = true;
        context.replaceChildren();
        el("change-result").textContent = "";
        form
          .querySelectorAll("button,select,textarea")
          .forEach((c) => (c.disabled = false));
      },
    });
    const modal = view.modal;
    modal.removeAttribute("role");
    modal.removeAttribute("aria-modal");
    const frame = modal.querySelector(".incident-history-dialog");
    const head = frame.querySelector(".dialog-head");
    head.className = "admin-dialog-head";
    head.querySelector("h3").setAttribute("data-dialog-title", "");
    head.querySelector("h3").tabIndex = -1;
    head.querySelector("button").addEventListener("click", event => {
      event.stopImmediatePropagation();
      dialogs.dismiss(dialog);
    }, true);
    const footer = document.createElement("footer");
    footer.className = "admin-dialog-foot";
    footer.innerHTML = '<button type="button" class="btn btn-ghost" data-dialog-close>Cerrar</button>';
    const submit = form.querySelector('[type="submit"]');
    submit.setAttribute("form", form.id);
    submit.disabled = true;
    footer.append(submit);
    const status = document.createElement("p");
    status.className = "admin-dialog-status";
    status.dataset.dialogStatus = "";
    status.setAttribute("role", "status");
    const context = document.createElement("div");
    view.body.classList.add("admin-dialog-body");
    view.body.prepend(context);
    view.body.append(form);
    frame.append(status, footer);
    dialog.append(modal);
    options.container.append(dialog);
    dialogs.register(dialog, {
      dirty: () => !!initialState && (el("state").value !== initialState || !!el("comment").value),
      onClose: () => {
        modal.classList.remove("open");
        modal.setAttribute("aria-hidden", "true");
        modal.hmOnClose();
      }
    });
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (writing || !view.currentId() || !options.isActive()) return;
      writing = true;
      form.setAttribute("aria-busy", "true");
      submit.disabled = true;
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
          initialState = el("state").value;
          el("comment").value = "";
          el("change-result").textContent = result.cambiada
            ? "Cambio guardado y registrado."
            : "Cambio registrado. Revisa el estado actualizado en el historial.";
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
          form.removeAttribute("aria-busy");
          submit.disabled = false;
          controls.forEach((c) => (c.disabled = false));
        }
      }
    });
    return {
      refresh:view.refresh,
      destroy() { view.destroy(); dialog.remove(); },
      open(id, opener, incident) {
        view.open(id, opener);
        if (!dialog.open || !incident) return;
        const { node } = global.HMShared.ui;
        context.replaceChildren(node("p", "hint", "Suministro " + incident.numero_suministro + " · " + incident.tipo),
          node("p", null, incident.descripcion),
          node("p", "hint", "Referencia: " + (incident.referencia || "Sin referencia")));
      }
    };
  };
})(window);
