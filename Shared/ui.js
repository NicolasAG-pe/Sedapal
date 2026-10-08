// Formatos y creación segura de nodos reutilizables, sin IDs de ningún cliente.
(function (global) {
  'use strict';
  global.HMShared = global.HMShared || {};
  function node(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined && text !== null) element.textContent = text;
    return element;
  }
  function date(value, withTime = false) {
    if (!value) return '—';
    // Una fecha SQL sin hora debe conservar el día en America/Lima.
    const parsed = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? value + 'T12:00:00-05:00' : value);
    if (Number.isNaN(parsed.getTime())) return '—';
    return new Intl.DateTimeFormat('es-PE', {
      timeZone: 'America/Lima', day: '2-digit', month: '2-digit', year: 'numeric',
      ...(withTime ? { hour: '2-digit', minute: '2-digit', hour12: false } : {})
    }).format(parsed);
  }
  function debounce(fn, milliseconds = 300) {
    let timer;
    function wrapped(...args) { clearTimeout(timer); timer = setTimeout(() => fn(...args), milliseconds); }
    wrapped.cancel = () => clearTimeout(timer);
    return wrapped;
  }
  const formLocks = new WeakMap();
  function beginForm(form) {
    if (formLocks.has(form)) return null;
    const token = {};
    const buttons = [...form.querySelectorAll('button[type="submit"],button:not([type]),input[type="submit"]')];
    const previous = buttons.map(button => button.disabled);
    formLocks.set(form, {token, buttons, previous});
    form.setAttribute('aria-busy', 'true');
    buttons.forEach(button => {button.disabled=true;button.dataset.loading='1';});
    return () => {
      if (formLocks.get(form)?.token !== token) return;
      formLocks.delete(form);form.removeAttribute('aria-busy');
      buttons.forEach((button,index) => {button.disabled=previous[index];delete button.dataset.loading;});
    };
  }
  function clearFormLocks(root) {
    root.querySelectorAll('form').forEach(form => {
      const lock=formLocks.get(form);if(!lock)return;
      formLocks.delete(form);form.removeAttribute('aria-busy');
      lock.buttons.forEach((button,index)=>{button.disabled=lock.previous[index];delete button.dataset.loading;});
    });
  }
  // Delegación única: también cubre formularios administrativos clonados al entrar.
  const installedRoots=new WeakSet();let helpId=0;
  function installFormUX(root){
    if(installedRoots.has(root))return;installedRoots.add(root);
    function describe(field){
      if(!field.matches('input,select,textarea'))return;
      const hint=field.closest('.field')?.querySelector('.hint');
      if(hint){
        if(!hint.id)hint.id='hm-field-help-'+(++helpId);
        const references=new Set((field.getAttribute('aria-describedby')||'').split(/\s+/).filter(Boolean));
        references.add(hint.id);field.setAttribute('aria-describedby',[...references].join(' '));
      }
    }
    function validate(field){
      if(!field.matches('input,select,textarea')||field.disabled||field.readOnly)return;
      field.setAttribute('aria-invalid',String(!field.validity.valid));
    }
    root.addEventListener('focusin',event=>describe(event.target));
    root.addEventListener('focusout',event=>validate(event.target));
    root.addEventListener('invalid',event=>{describe(event.target);validate(event.target);},true);
    root.addEventListener('input',event=>{if(event.target.hasAttribute('aria-invalid'))validate(event.target);});
    root.addEventListener('change',event=>{if(event.target.hasAttribute('aria-invalid'))validate(event.target);});
    root.addEventListener('reset',event=>event.target.querySelectorAll('[aria-invalid]').forEach(field=>field.removeAttribute('aria-invalid')));
  }
  global.HMShared.ui = {
    node, date, debounce, beginForm, clearFormLocks, installFormUX,
    money: value => 'S/ ' + Number(value).toFixed(2),
    isAborted: error => !!error && error.name === 'AbortError'
  };
  if(typeof document!=='undefined')installFormUX(document);
})(window);
