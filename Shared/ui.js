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
  function receiptDate(value) {
    // PostgreSQL DATE puede llegar serializado como ISO con hora.
    const day = /^\d{4}-\d{2}-\d{2}(?=T|$)/.exec(value || '');
    return date(day ? day[0] : value);
  }
  const MONTHS = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  const MONTHS_SHORT = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
  const MONTH_TOKENS = new Map([
    ['enero',0],['ene',0],['febrero',1],['feb',1],['marzo',2],['mar',2],['abril',3],['abr',3],
    ['mayo',4],['may',4],['junio',5],['jun',5],['julio',6],['jul',6],['agosto',7],['ago',7],
    ['septiembre',8],['setiembre',8],['sept',8],['sep',8],['set',8],
    ['octubre',9],['oct',9],['noviembre',10],['nov',10],['diciembre',11],['dic',11]
  ]);
  function parseEmissionYearMonth(value) {
    if (!value) return null;
    const raw = String(value).trim();
    const iso = raw.match(/^((?:19|20|21)\d{2})-(0[1-9]|1[0-2])(?=-\d{2}(?:$|[T\s]))/);
    if (iso) return { year: Number(iso[1]), month: Number(iso[2]) - 1 };
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      return { year: value.getUTCFullYear(), month: value.getUTCMonth() };
    }
    const parsed = new Date(raw);
    if (!Number.isNaN(parsed.getTime())) {
      return { year: parsed.getUTCFullYear(), month: parsed.getUTCMonth() };
    }
    return null;
  }
  function parseReceiptPeriod(periodo, fechaEmision) {
    const raw = periodo == null ? '' : String(periodo).trim();
    let year = null, month = null, source = 'none';
    if (raw) {
      const ym = raw.match(/(?:^|[^\d])((?:19|20|21)\d{2})[-/](0?[1-9]|1[0-2])(?=$|[^\d])/);
      const my = !ym && raw.match(/(?:^|[^\d])(0?[1-9]|1[0-2])[-/]((?:19|20|21)\d{2})(?=$|[^\d])/);
      if (ym) {
        year = Number(ym[1]);
        month = Number(ym[2]) - 1;
        source = 'periodo';
      } else if (my) {
        month = Number(my[1]) - 1;
        year = Number(my[2]);
        source = 'periodo';
      } else {
        const normalized = raw.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        const tokens = normalized.match(/[a-z]+/g) || [];
        const matchedMonths = [...new Set(tokens.filter(t => MONTH_TOKENS.has(t)).map(t => MONTH_TOKENS.get(t)))];
        if (matchedMonths.length === 1) month = matchedMonths[0];
        const y = raw.match(/(?:^|[^\d])((?:19|20|21)\d{2})(?=$|[^\d])/);
        if (y) year = Number(y[1]);
        if (month !== null || year !== null) source = 'periodo';
      }
    }
    if (source === 'none') {
      const emitted = parseEmissionYearMonth(fechaEmision);
      if (emitted) {
        year = emitted.year;
        month = emitted.month;
        source = 'emision';
      }
    }
    const mesNombre = month !== null ? MONTHS[month] : '';
    const mesShort = month !== null ? MONTHS_SHORT[month] : '';
    const filePeriod = year !== null && month !== null ? year + '-' + String(month + 1).padStart(2, '0') : null;
    const etiqueta = raw || (mesNombre && year !== null ? mesNombre + ' ' + year : mesNombre || (year !== null ? String(year) : 'Sin periodo'));
    return { anio: year, mes: month, mesNombre, mesShort, etiqueta, filePeriod, source };
  }
  function debounce(fn, milliseconds = 300) {
    let timer;
    function wrapped(...args) { clearTimeout(timer); timer = setTimeout(() => fn(...args), milliseconds); }
    wrapped.cancel = () => clearTimeout(timer);
    return wrapped;
  }
  function legacyCopy(text) {
    if (typeof document === 'undefined' || !document.body) throw new Error('Portapapeles no disponible.');
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.setAttribute('aria-hidden', 'true');
    area.style.cssText = 'position:fixed;top:0;left:-9999px;opacity:0';
    document.body.appendChild(area);
    const selection = document.getSelection ? document.getSelection() : null;
    const previous = selection && selection.rangeCount ? selection.getRangeAt(0) : null;
    area.select();
    if (area.setSelectionRange) area.setSelectionRange(0, area.value.length);
    let copied = false;
    try { copied = document.execCommand('copy'); } finally {
      area.remove();
      if (previous && selection) { selection.removeAllRanges(); selection.addRange(previous); }
    }
    if (!copied) throw new Error('No se pudo copiar el texto.');
    return true;
  }
  function copyText(value) {
    const text = value === undefined || value === null ? '' : String(value);
    if (!text) return Promise.reject(new Error('No hay texto para copiar.'));
    const clipboard = global.navigator && global.navigator.clipboard;
    if (clipboard && typeof clipboard.writeText === 'function') {
      return clipboard.writeText(text).then(() => true).catch(error => {
        if (typeof document === 'undefined') throw error;
        return legacyCopy(text);
      });
    }
    try { legacyCopy(text); return Promise.resolve(true); }
    catch (error) { return Promise.reject(error); }
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
  // Presentación de mensajes automáticos conocidos; la API y la auditoría conservan su literal.
  function paymentAuditMessage(value){
    const labels={
      'Ensayo sintético revisado sin movimiento de dinero':'Operación confirmada. No se recibió dinero.',
      'Operación demostrativa sin acreditación financiera':'Operación registrada sin acreditación financiera.',
      'Estado consultado al proveedor simulado; sin movimiento financiero':'Estado actualizado por el proveedor de pruebas; sin movimiento financiero.'
    };
    return Object.hasOwn(labels,value)?labels[value]:String(value??'');
  }
  global.HMShared.ui = {
    node, date, receiptDate, parseReceiptPeriod, debounce, paymentAuditMessage, beginForm, clearFormLocks, installFormUX, copyText,
    money: value => {
      const amount = Number(value);
      return 'S/ ' + (Number.isFinite(amount) ? amount : 0)
        .toLocaleString('es-PE', {minimumFractionDigits: 2, maximumFractionDigits: 2});
    },
    isAborted: error => !!error && error.name === 'AbortError'
  };
  if(typeof document!=='undefined')installFormUX(document);
})(window);
