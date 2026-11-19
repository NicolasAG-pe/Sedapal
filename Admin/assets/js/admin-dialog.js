/* Cuadros administrativos. El diálogo nativo vuelve inerte el fondo, incluso al apilar cuadros. */
(function () {
  'use strict';

  const stack = [];
  const options = new WeakMap();
  const focus = element => element?.focus({preventScroll:true});
  const visible = element => element?.isConnected && element.getClientRects().length && !element.matches(':disabled');
  const controls = dialog => [...dialog.querySelectorAll(
    'button,input,select,textarea,a[href],summary,[tabindex]'
  )].filter(element => visible(element) && element.tabIndex >= 0);

  function snapshot(root) {
    return JSON.stringify([...root.querySelectorAll('input,select,textarea')].map(field => {
      if (field.type === 'checkbox' || field.type === 'radio') return field.checked;
      if (field.type === 'file') return [...field.files].map(file => file.name);
      return [field.value, field.validity.badInput];
    }));
  }

  const discard = document.getElementById('admin-discard-dialog');

  function register(dialog, settings = {}) {
    options.set(dialog, settings);
    dialog.addEventListener('cancel', event => {
      event.preventDefault();
      if (dialog === top()) dismiss(dialog);
    });
    dialog.addEventListener('click', event => {
      const button = event.target.closest('[data-dialog-close]');
      if (button?.closest('dialog') === dialog) dismiss(dialog);
    });
    dialog.addEventListener('keydown', event => {
      if (event.key !== 'Tab' || top() !== dialog) return;
      const items = controls(dialog);
      const edge = event.shiftKey ? items[0] : items.at(-1);
      event.stopPropagation();
      if (!items.includes(document.activeElement) || document.activeElement === edge) {
        event.preventDefault();
        focus((event.shiftKey ? items.at(-1) : items[0]) || dialog);
      }
    }, true);
    return dialog;
  }

  const top = () => stack.at(-1)?.dialog;
  function open(dialog, opener = document.activeElement) {
    if (dialog.open) return;
    const settings = options.get(dialog);
    const entry = {dialog, opener, key:opener?.dataset.dialogTrigger, x:window.scrollX,
      y:window.scrollY, initial:snapshot(dialog)};
    const status = dialog.querySelector('[data-dialog-status]');
    if (status) {
      status.textContent = '';
      status.classList.remove('admin-dialog-wait');
    }
    const root = document.documentElement;
    if (!stack.length && root.clientWidth < window.innerWidth) root.classList.add('admin-dialog-gutter');
    stack.push(entry);
    root.classList.add('admin-dialog-open');
    dialog.showModal();
    dialog.querySelector('.admin-dialog-body')?.scrollTo(0, 0);
    focus(dialog.querySelector(settings.initialFocus || '[data-dialog-title]') || controls(dialog)[0]);
  }

  function close(dialog, {restore = true} = {}) {
    const index = stack.findIndex(entry => entry.dialog === dialog);
    if (index < 0) return;
    while (top() !== dialog) close(top(), {restore:false});
    const entry = stack.pop();
    const settings = options.get(dialog);
    dialog.close();
    settings.onClose?.();
    if (!stack.length) document.documentElement.classList.remove('admin-dialog-open', 'admin-dialog-gutter');
    if (restore) {
      const replacement = entry.key && document.querySelector('[data-dialog-trigger="' + CSS.escape(entry.key) + '"]');
      const target = [entry.opener, replacement, settings.fallback?.(), document.querySelector('.dash-sec.active .page-title')].find(visible);
      focus(target);
      window.scrollTo({top:entry.y, left:entry.x, behavior:'instant'});
    }
  }

  function dismiss(dialog = top()) {
    if (!dialog || dialog !== top()) return false;
    const settings = options.get(dialog);
    if (settings.busy?.() || dialog.querySelector('form[aria-busy="true"], #two-factor-controls[aria-busy="true"]')) {
      const status = dialog.querySelector('[data-dialog-status]');
      if (status && !status.textContent) {
        status.classList.add('admin-dialog-wait');
        status.textContent = 'Espera a que termine la operación antes de cerrar.';
      }
      return false;
    }
    const changed = settings.dirty ? settings.dirty() : settings.watch && snapshot(dialog) !== stack.at(-1).initial;
    if (changed) {
      discard.querySelector('p').textContent = settings.discardMessage?.() ||
        'Tienes cambios sin guardar. Si sales ahora, perderás esos cambios.';
      open(discard);
      return false;
    }
    close(dialog);
    return true;
  }

  register(discard, {initialFocus:'#admin-keep-editing'});
  document.getElementById('admin-discard-changes').addEventListener('click', () => {
    close(discard, {restore:false});
    close(top());
  });

  window.HMAdminDialog = {register, open, close, dismiss, top};
})();
