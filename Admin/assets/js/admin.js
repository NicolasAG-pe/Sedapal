/* Panel independiente. Las operaciones administrativas se conservan del frontend
   original; los permisos y la persistencia siguen exclusivamente en la API. */
(function () {
  'use strict';
  const shared = window.HMShared;
  const session = shared.createSession('hm_admin');
  const login = document.getElementById('admin-login');
  const panel = document.getElementById('admin-panel');
  const main = document.getElementById('admin-content');
  const loginForm = document.getElementById('admin-login-form');
  const loginError = document.getElementById('admin-login-error');
  const loginButton = document.getElementById('admin-login-submit');
  let modules = null, loginController = null, toastTimer = null;
  let page = 'admin', attempt = 0;
  const allowedPages = ['admin', 'admin-usuarios', 'admin-recibos', 'admin-cortes',
    'admin-incidencias', 'admin-pagos', 'admin-atencion', 'admin-cuenta'];
  const api = shared.createApi(session, () => logout('Sesión terminada o acceso denegado. Inicia sesión nuevamente.'));
  const realtime = shared.createRealtime(session, {
    events: ['incidencia:nueva', 'incidencia:actualizada', 'atencion:nueva',
      'atencion:actualizada', 'recibo:nuevo', 'recibo:actualizado', 'pago:nuevo', 'corte:actualizado'],
    onChange: () => { if (session.isAdmin() && modules) modules.load(page); },
    onStatus: updateConnection,
    onInvalidated: () => logout('La cuenta fue desactivada. Inicia sesión nuevamente.')
  });

  function updateConnection(state){
    const element=document.getElementById('admin-connection');
    element.dataset.state=state;
    element.textContent=state==='online'?'Actualización en vivo':state==='offline'?'Sin conexión. Revisa tu red.':'Reconectando actualizaciones';
  }
  window.addEventListener('offline',()=>updateConnection('offline'));
  window.addEventListener('online',()=>updateConnection(realtime.isConnected()?'online':'connecting'));
  function notify(message, success = false) {
    if (!session.isAdmin()) return;
    const element = document.getElementById('admin-toast');
    clearTimeout(toastTimer);
    element.textContent = message;
    element.classList.toggle('success', success);
    element.hidden = false;
    toastTimer = setTimeout(() => { element.textContent = ''; element.hidden = true; }, 4500);
  }
  function logout(message = '') {
    attempt++;
    if (loginController) loginController.abort();
    loginController = null;
    shared.ui.clearFormLocks(document);
    session.clear();
    api.cancel();
    realtime.stop();
    if (modules) modules.dispose();
    modules = null;
    main.replaceChildren();
    document.getElementById('admin-load-status').textContent='';
    panel.hidden = true;
    document.querySelectorAll('[data-sec]').forEach(item => item.removeAttribute('aria-current'));
    document.getElementById('admin-identity').textContent = '';
    document.getElementById('admin-current-page').textContent = 'Resumen operativo';
    document.getElementById('admin-toast').textContent = '';
    document.getElementById('admin-toast').hidden = true;
    clearTimeout(toastTimer);
    document.body.classList.remove('modal-open');
    history.replaceState(null, '', location.pathname + location.search);
    loginForm.reset();
    loginButton.disabled = false;
    delete loginButton.dataset.loading;
    loginForm.removeAttribute('aria-busy');
    loginButton.textContent = 'Ingresar al panel';
    loginError.textContent = message;
    loginError.hidden = !message;
    login.hidden = false;
    document.getElementById('admin-supply').focus();
  }
  function navigate(next) {
    if (!session.isAdmin() || !modules) {
      if (location.hash) history.replaceState(null, '', location.pathname + location.search);
      return;
    }
    page = allowedPages.includes(next) ? next : 'admin';
    document.getElementById('admin-current-page').textContent = document.querySelector('#admin-nav [data-sec="'+page+'"]')?.textContent || 'Administración';
    main.querySelectorAll('.dash-sec').forEach(section => section.classList.toggle('active', section.id === 'sec-' + page));
    document.querySelectorAll('[data-sec]').forEach(item => {
      if (item.dataset.sec === page) item.setAttribute('aria-current', 'page');
      else item.removeAttribute('aria-current');
    });
    history.replaceState(null, '', '#' + page);
    modules.load(page);
    main.querySelector('.dash-sec.active .page-title')?.focus({preventScroll:true});
  }
  document.getElementById('admin-nav').addEventListener('click', event => {
    const button = event.target.closest('[data-sec]');
    if (button) navigate(button.dataset.sec);
  });
  const quickPages = { 'adm-usuarios': 'admin-usuarios', 'adm-recibos': 'admin-recibos',
    'adm-pagos': 'admin-pagos', 'adm-cortes': 'admin-cortes', 'adm-incidencias': 'admin-incidencias', 'adm-atencion': 'admin-atencion' };
  main.addEventListener('click', event => {
    const button = event.target.closest('[data-action]');
    if (button && quickPages[button.dataset.action]) navigate(quickPages[button.dataset.action]);
  });
  window.addEventListener('hashchange', () => navigate(location.hash.slice(1)));
  document.getElementById('admin-logout').addEventListener('click', () => logout());
  document.getElementById('admin-supply').addEventListener('input', event => {
    event.target.value = event.target.value.replace(/\D/g, '').slice(0, 9);
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && modules) modules.closeDialogs();
    if (event.key === 'Tab') {
      const modal = main.querySelector('.overlay.open');
      if (!modal) return;
      const items = [...modal.querySelectorAll('button:not([disabled]),input,select,textarea,[tabindex="0"]')];
      if (!items.length) return;
      if (event.shiftKey && document.activeElement === items[0]) { event.preventDefault(); items.at(-1).focus(); }
      else if (!event.shiftKey && document.activeElement === items.at(-1)) { event.preventDefault(); items[0].focus(); }
    }
  });
  loginForm.addEventListener('submit', async event => {
    event.preventDefault();
    if (loginButton.disabled) return;
    const supply = document.getElementById('admin-supply').value.trim();
    const password = document.getElementById('admin-password').value;
    if (!/^\d{9}$/.test(supply) || password.length < 4) {
      loginError.textContent = 'Ingresa un suministro de 9 dígitos y tu contraseña.';
      loginError.hidden = false; return;
    }
    const currentAttempt = ++attempt;
    loginController = new AbortController();
    loginButton.disabled = true;
    loginButton.dataset.loading = '1';
    loginForm.setAttribute('aria-busy','true');
    loginError.hidden = true;
    try {
      const response = await fetch(shared.apiUrl('/api/auth/login'), {
        method: 'POST', signal: loginController.signal, headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ numero_suministro: supply, password })
      });
      const data = await response.json();
      if (currentAttempt !== attempt) return;
      if (!response.ok || data.estado !== 'ok' || !data.token) throw new Error(data.mensaje || 'No se pudo iniciar sesión.');
      // Un usuario normal no provoca ni una consulta /api/admin/*.
      if (!data.usuario || data.usuario.rol !== 'admin') throw new Error('Este panel es exclusivo para administradores.');
      // Confirmación del permiso vigente en PostgreSQL antes de renderizar.
      const permission = await fetch(shared.apiUrl('/api/admin/resumen'), {
        signal: loginController.signal, headers: { Authorization: 'Bearer ' + data.token }
      });
      if (!permission.ok) throw new Error('No tienes acceso administrativo o tu sesión ya no está habilitada.');
      await permission.json();
      if (currentAttempt !== attempt) return;
      session.set(data.token, 'admin');
      main.replaceChildren(document.getElementById('admin-pages').content.cloneNode(true));
      shared.icons.decorate(main);
      modules = createAdminModules();
      document.getElementById('admin-identity').textContent = data.usuario.correo || 'Administrador';
      document.getElementById('admin-password').value = '';
      login.hidden = true; panel.hidden = false;
      navigate(location.hash.slice(1));
      realtime.start();
    } catch (error) {
      if (currentAttempt !== attempt || shared.ui.isAborted(error)) return;
      logout(error.message || 'No se pudo conectar con el servidor.');
    } finally {
      if(currentAttempt===attempt){
        loginController = null;
        loginButton.disabled = false;
        delete loginButton.dataset.loading;
        loginForm.removeAttribute('aria-busy');
      }
    }
  });
  // No se recuperan sesiones anteriores sin una autenticación nueva.
  logout();

  function createAdminModules() {
    let disposed = false, photoUrl = null, photoRequest = 0, lastFocus = null;
    const esAdmin = () => !disposed && session.isAdmin();
    const obtenerRol = () => session.role();
    const apiFetch = (path, options) => {
      if (!esAdmin()) return Promise.reject(new DOMException('Sesión cerrada.', 'AbortError'));
      return api.fetch(path, options);
    };
    const { node: nodo, date: formatearFechaCorta, money: fmt, debounce, isAborted: esAbortado } = shared.ui;
    const formatearFechaHoraCorte = value => shared.ui.date(value, true);
    const showToast = message => notify(message);
    const showSuccess = message => notify(message, true);
    let ctrlPagosAdmin = null, ctrlAtencionAdmin = null;
    const confirmModal = document.getElementById('confirm-modal');
    const fotoModal = document.getElementById('foto-modal');
    function seccionContacto(title, pairs) {
      const section = nodo('div', 'pre-contact');
      section.appendChild(nodo('h4', null, title));
      const dl = nodo('dl');
      pairs.forEach(([key, value]) => { const div = nodo('div'); div.append(nodo('dt', null, key), nodo('dd', null, value)); dl.append(div); });
      section.append(dl); return section;
    }
    function openModal(modal) {
      if (!esAdmin()) return;
      lastFocus = document.activeElement;
      modal.classList.add('open'); modal.setAttribute('aria-hidden', 'false');
      document.body.classList.add('modal-open');
      modal.querySelector('button').focus();
    }
    function closeModal(modal) {
      modal.classList.remove('open'); modal.setAttribute('aria-hidden', 'true');
      if (modal === fotoModal) {
        photoRequest++;
        document.getElementById('foto-img').removeAttribute('src');
        document.getElementById('foto-sub').textContent = '';
        if (photoUrl) URL.revokeObjectURL(photoUrl);
        photoUrl = null;
      }
      if (!main.querySelector('.overlay.open')) document.body.classList.remove('modal-open');
      if (lastFocus && lastFocus.isConnected) lastFocus.focus();
    }
    function closeDialogs() { confirmarAccion = null; closeModal(confirmModal); closeModal(fotoModal); }
    async function abrirFotoProtegida(path, title) {
      closeModal(fotoModal);
      const request = ++photoRequest;
      document.getElementById('foto-sub').textContent = title;
      openModal(fotoModal);
      try {
        const response = await apiFetch(path);
        if (!response.ok) throw new Error('Fotografía no disponible.');
        const blob = await response.blob();
        if (!esAdmin() || request !== photoRequest) return;
        photoUrl = URL.createObjectURL(blob);
        document.getElementById('foto-img').src = photoUrl;
      } catch (error) {
        if (esAbortado(error) || !esAdmin() || request !== photoRequest) return;
        closeModal(fotoModal); showToast('No se pudo cargar la fotografía.');
      }
    }
    ['foto-close', 'foto-done'].forEach(id => document.getElementById(id).addEventListener('click', () => closeModal(fotoModal)));
    fotoModal.addEventListener('click', event => { if (event.target === fotoModal) closeModal(fotoModal); });
    main.querySelectorAll('[data-limite-inteligente]').forEach(input => input.addEventListener('input', () => {
      if (input.dataset.limiteInteligente === 'suministro') input.value = input.value.replace(/\D/g, '').slice(0, 9);
      else if (/^\d+$/.test(input.value)) input.value = input.value.slice(0, 9);
    }, true));
    main.querySelectorAll('[data-contador]').forEach(input => input.addEventListener('input', () => {
      document.getElementById(input.dataset.contador).textContent = input.value.length + ' / ' + input.maxLength;
    }));

    // Operaciones trasladadas de Frontend/index.html; no se modifica la API.
  /* ---------- Panel administrativo: cortes (solo admin) ---------- */
  let adminCortes = [];
  let adminEditId = null;
  let confirmarAccion = null;
  function pedirConfirmacion(titulo, texto, alAceptar){
    document.getElementById('confirm-title').textContent = titulo;
    document.getElementById('confirm-sub').textContent = 'Panel administrativo';
    document.getElementById('confirm-text').textContent = texto;
    confirmarAccion = alAceptar;
    openModal(confirmModal);
  }
  document.getElementById('confirm-close').addEventListener('click', ()=>{ confirmarAccion = null; closeModal(confirmModal); });
  document.getElementById('confirm-cancel').addEventListener('click', ()=>{ confirmarAccion = null; closeModal(confirmModal); });
  document.getElementById('confirm-ok').addEventListener('click', ()=>{
    const fn = confirmarAccion;
    confirmarAccion = null;
    closeModal(confirmModal);
    if(fn) fn();
  });
  confirmModal.addEventListener('click', e=>{ if(e.target===confirmModal){ confirmarAccion = null; closeModal(confirmModal); } });
  function limaInputValor(iso){
    try{
      const d = new Date(iso);
      if(isNaN(d)) return '';
      const partes = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Lima',
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', hour12: false
      }).formatToParts(d);
      const g = t=>((partes.find(p=>p.type===t) || {}).value || '');
      return g('year') + '-' + g('month') + '-' + g('day') + 'T' + g('hour') + ':' + g('minute');
    }catch(e){ return ''; }
  }
  function limaISODesdeInput(valor){
    if(!valor) return null;
    const d = new Date(valor + ':00-05:00');
    if(isNaN(d)) return null;
    return d.toISOString();
  }
  function mostrarFormCorte(editar){
    const button = document.getElementById('admin-corte-submit');
    button.dataset.busy = '0'; button.disabled = false;
    document.getElementById('admin-corte-form-card').hidden = false;
    document.getElementById('admin-corte-error').classList.remove('show');
    document.getElementById('admin-corte-form-title').textContent = editar ? 'Editar corte de servicio' : 'Nuevo corte de servicio';
    document.getElementById('admin-corte-submit-text').textContent = editar ? 'Guardar cambios' : 'Publicar corte';
    aplicarAlcanceCorte();
    document.getElementById('adm-motivo').focus();
  }
  function ocultarFormCorte(){
    document.getElementById('admin-corte-form-card').hidden = true;
    document.getElementById('admin-corte-form').reset();
    adminEditId = null;
  }
  function aplicarAlcanceCorte(){
    const esGeneral = document.getElementById('adm-alcance').value === 'General';
    document.getElementById('adm-distrito').disabled = esGeneral;
    document.getElementById('adm-zona').disabled = esGeneral;
    document.getElementById('adm-distrito-wrap').style.opacity = esGeneral ? '.5' : '1';
    document.getElementById('adm-zona-wrap').style.opacity = esGeneral ? '.5' : '1';
  }
  document.getElementById('btn-nuevo-corte').addEventListener('click', ()=>{
    adminEditId = null;
    document.getElementById('admin-corte-form').reset();
    mostrarFormCorte(false);
  });
  document.getElementById('admin-corte-cancel').addEventListener('click', ocultarFormCorte);
  document.getElementById('adm-alcance').addEventListener('change', aplicarAlcanceCorte);
  async function cargarAdminCortes(){
    if(!esAdmin()) return;
    const list = document.getElementById('admin-cortes-list');
    const emptyEl = document.getElementById('admin-cortes-empty');
    try{
      const resp = await apiFetch('/api/admin/cortes');
      if(!resp.ok) throw new Error('No se pudieron cargar los cortes (código ' + resp.status + ')');
      const data = await resp.json();
      adminCortes = Array.isArray(data.cortes) ? data.cortes : [];
    }catch(err){
      if(esAbortado(err) || !esAdmin()) return;
      console.error('No se pudieron cargar los cortes del panel.', err);
      adminCortes = [];
      if(emptyEl){
        emptyEl.textContent = 'No fue posible cargar los cortes. Inténtalo nuevamente.';
        emptyEl.classList.add('show');
      }
      if(list) list.innerHTML = '';
      document.getElementById('adm-stat-prog').textContent = '—';
      document.getElementById('adm-stat-proc').textContent = '—';
      document.getElementById('adm-stat-fin').textContent = '—';
      document.getElementById('adm-stat-canc').textContent = '—';
      return;
    }
    document.getElementById('adm-stat-prog').textContent = adminCortes.filter(c=>c.estado==='Programado').length;
    document.getElementById('adm-stat-proc').textContent = adminCortes.filter(c=>c.estado==='En proceso').length;
    document.getElementById('adm-stat-fin').textContent = adminCortes.filter(c=>c.estado==='Finalizado').length;
    document.getElementById('adm-stat-canc').textContent = adminCortes.filter(c=>c.estado==='Cancelado').length;
    if(list) list.innerHTML = '';
    if(!adminCortes.length){
      if(emptyEl){
        emptyEl.textContent = 'Sin cortes registrados.';
        emptyEl.classList.add('show');
      }
      return;
    }
    if(emptyEl) emptyEl.classList.remove('show');
    adminCortes.forEach(c=>{
      const d = document.createElement('div');
      d.hmData=c;
      d.className = 'inc-item'; d.setAttribute('role','listitem');
      const titulo = c.alcance === 'General' ? 'AVISO GENERAL' : String(c.distrito || '').toUpperCase();
      const zonaTxt = c.alcance === 'General' ? 'Cobertura general' : (c.zona || '');
      const badgeCls = c.estado === 'Programado' ? 'info' : (c.estado === 'En proceso' ? 'Pendiente' : (c.estado === 'Finalizado' ? 'Pagado' : ''));
      const row = document.createElement('div'); row.className = 'row';
      const code = document.createElement('span'); code.className = 'inc-code'; code.textContent = '#' + c.id_corte + ' · ' + titulo;
      const badge = document.createElement('span'); badge.className = ('badge ' + badgeCls).trim(); badge.textContent = String(c.estado || '').toUpperCase();
      row.appendChild(code); row.appendChild(badge);
      const desc = document.createElement('div'); desc.className = 'inc-desc'; desc.textContent = c.motivo;
      const meta = document.createElement('div'); meta.className = 'inc-meta';
      meta.textContent = zonaTxt + ' · Inicio ' + formatearFechaHoraCorte(c.fecha_inicio) + ' · Fin ' + formatearFechaHoraCorte(c.fecha_fin);
      d.appendChild(row); d.appendChild(desc); d.appendChild(meta);
      const box = document.createElement('div'); box.className = 'tbl-actions';
      if(!c.cancelado){
        const bE = document.createElement('button');
        bE.type = 'button'; bE.className = 'btn-sm detail'; bE.textContent = 'Editar';
        bE.addEventListener('click', ()=>editarCorteAdmin(c.id_corte));
        box.appendChild(bE);
        if(c.estado !== 'Finalizado'){
          const bC = document.createElement('button');
          bC.type = 'button'; bC.className = 'btn-sm payb'; bC.textContent = 'Cancelar';
          bC.addEventListener('click', ()=>pedirConfirmacion('Cancelar corte', '¿Deseas cancelar este aviso de corte?', ()=>cancelarCorteAdmin(c.id_corte)));
          box.appendChild(bC);
        }
      }
      if(box.children.length) d.appendChild(box);
      list.appendChild(d);
    });
    window.HMAdminTable(list);
  }
  function editarCorteAdmin(id){
    const c = adminCortes.find(x=>String(x.id_corte) === String(id));
    if(!c) return;
    adminEditId = c.id_corte;
    document.getElementById('adm-alcance').value = c.alcance;
    document.getElementById('adm-distrito').value = c.distrito || '';
    document.getElementById('adm-zona').value = c.zona || '';
    document.getElementById('adm-motivo').value = c.motivo || '';
    document.getElementById('adm-inicio').value = limaInputValor(c.fecha_inicio);
    document.getElementById('adm-fin').value = limaInputValor(c.fecha_fin);
    mostrarFormCorte(true);
  }
  async function cancelarCorteAdmin(id){
    if(!esAdmin()) return;
    try{
      const resp = await apiFetch('/api/admin/cortes/' + encodeURIComponent(String(id)) + '/cancelar', {method: 'PATCH'});
      if(!resp.ok) throw new Error('No se pudo cancelar el aviso (código ' + resp.status + ')');
      showSuccess('Aviso de corte cancelado.');
      ocultarFormCorte();
      await cargarAdminCortes();
    }catch(err){
      if(esAbortado(err) || !esAdmin()) return;
      console.error('No se pudo cancelar el corte.', err);
      showToast('No se pudo cancelar el aviso. Inténtalo nuevamente.');
    }
  }
  document.getElementById('admin-corte-form').addEventListener('submit', async ev=>{
    ev.preventDefault();
    const _releaseForm=window.HMShared.ui.beginForm(ev.currentTarget);
    if(!_releaseForm)return;
    try{

    ev.preventDefault();
    const btn = document.getElementById('admin-corte-submit');
    if(btn.dataset.busy === '1') return;
    const errBox = document.getElementById('admin-corte-error');
    errBox.classList.remove('show');
    const alcance = document.getElementById('adm-alcance').value;
    const distrito = document.getElementById('adm-distrito').value.trim();
    const zona = document.getElementById('adm-zona').value.trim();
    const motivo = document.getElementById('adm-motivo').value.trim();
    const inicioISO = limaISODesdeInput(document.getElementById('adm-inicio').value);
    const finISO = limaISODesdeInput(document.getElementById('adm-fin').value);
    let msg = null;
    if(alcance !== 'Zona' && alcance !== 'General') msg = '⚠ Alcance inválido.';
    else if(!motivo) msg = '⚠ El motivo es obligatorio.';
    else if(!inicioISO || !finISO) msg = '⚠ Indica inicio y fin válidos.';
    else if(new Date(finISO) <= new Date(inicioISO)) msg = '⚠ El fin debe ser posterior al inicio.';
    else if(alcance === 'Zona' && (!distrito || !zona)) msg = '⚠ Distrito y zona son obligatorios.';
    if(msg){
      errBox.textContent = msg;
      errBox.classList.add('show');
      return;
    }
    btn.dataset.busy = '1';
    btn.disabled = true;
    document.getElementById('admin-corte-submit-text').textContent = adminEditId ? 'Guardando...' : 'Publicando...';
    try{
      const esEdicion = !!adminEditId;
      const url = esEdicion ? '/api/admin/cortes/' + encodeURIComponent(String(adminEditId)) : '/api/admin/cortes';
      const resp = await apiFetch(url, {
        method: esEdicion ? 'PATCH' : 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          alcance: alcance,
          distrito: alcance === 'Zona' ? distrito : null,
          zona: alcance === 'Zona' ? zona : null,
          motivo: motivo,
          fecha_inicio: inicioISO,
          fecha_fin: finISO
        })
      });
      const data = await resp.json().catch(err=>{ if(esAbortado(err)) throw err; return null; });
      if(!resp.ok || !data || data.estado !== 'ok'){
        errBox.textContent = '⚠ ' + ((data && data.mensaje) || 'No se pudo guardar el aviso.');
        errBox.classList.add('show');
        btn.dataset.busy = '0';
        btn.disabled = false;
        document.getElementById('admin-corte-submit-text').textContent = esEdicion ? 'Guardar cambios' : 'Publicar corte';
        return;
      }
      ocultarFormCorte();
      showSuccess(esEdicion ? 'Aviso actualizado correctamente.' : 'Aviso publicado correctamente.');
      await cargarAdminCortes();
    }catch(err){
      if(esAbortado(err) || !esAdmin()) return;
      console.error('No se pudo guardar el aviso de corte.', err);
      errBox.textContent = '⚠ No se pudo conectar con el servidor.';
      errBox.classList.add('show');
      btn.dataset.busy = '0';
      btn.disabled = false;
      document.getElementById('admin-corte-submit-text').textContent = adminEditId ? 'Guardar cambios' : 'Publicar corte';
    }

    }finally{_releaseForm();}
  });

  async function cargarDashboardAdmin(){
    if(!esAdmin()) return;
    try{
      const resp = await apiFetch('/api/admin/resumen');
      if(!resp.ok) throw new Error('No se pudo cargar el resumen (código ' + resp.status + ')');
      const d = await resp.json();
      document.getElementById('adm-dash-usu').textContent = d.usuarios ? d.usuarios.activos : '—';
      document.getElementById('adm-dash-rec').textContent = d.recibos ? d.recibos.total : '—';
      document.getElementById('adm-dash-pay').textContent = d.pagos ? d.pagos.total : '—';
      const incPend = d.incidencias ? (Number(d.incidencias.registradas || 0) + Number(d.incidencias.revision || 0)) : 0;
      document.getElementById('adm-dash-inc').textContent = incPend;
      document.getElementById('adm-dash-activos').textContent = d.cortes ? d.cortes.activos : '—';
      const atePend = d.solicitudes ? (Number(d.solicitudes.registradas || 0) + Number(d.solicitudes.atencion || 0)) : 0;
      document.getElementById('adm-dash-ate').textContent = atePend;
      document.getElementById('adm-dash-user-total').textContent=d.usuarios.total+' cuentas registradas';
      document.getElementById('adm-dash-payment-total').textContent=fmt(d.pagos.monto_total)+' acumulados';
      document.getElementById('adm-dash-cut-next').textContent=d.cortes.programados+' programados';
      const bar=document.getElementById('admin-receipt-bar');bar.replaceChildren();
      const breakdown=document.getElementById('admin-receipt-breakdown');breakdown.replaceChildren();
      [['pagados','Pagados'],['emitidos','Emitidos / pendientes'],['vencidos','Vencidos'],['anulados','Anulados']].forEach(([key,label])=>{
        const count=Number(d.recibos[key]);const segment=nodo('span','status-'+key);segment.style.width=(d.recibos.total?count/d.recibos.total*100:0)+'%';bar.append(segment);
        const line=nodo('div','summary-line');line.append(nodo('span','',label),nodo('b','',count));breakdown.append(line);
      });
      const operation=document.getElementById('admin-operational-breakdown');operation.replaceChildren();
      [['Incidencias resueltas',d.incidencias.resueltas],['Solicitudes respondidas',d.solicitudes.respondidas],['Pagos registrados hoy',d.pagos.hoy],['Cortes programados',d.cortes.programados]].forEach(([label,count])=>{
        const line=nodo('div','summary-line');line.append(nodo('span','',label),nodo('b','',count));operation.append(line);
      });
    }catch(err){
      if(esAbortado(err) || !esAdmin()) return;
      console.error('No se pudo cargar el dashboard administrativo.', err);
      ['admin-receipt-breakdown','admin-operational-breakdown'].forEach(id=>document.getElementById(id).textContent='No fue posible consultar esta información.');
      document.getElementById('admin-receipt-bar').replaceChildren();
      ['adm-dash-user-total','adm-dash-payment-total','adm-dash-cut-next'].forEach(id=>document.getElementById(id).textContent='No disponible');
      ['adm-dash-usu','adm-dash-rec','adm-dash-pay','adm-dash-inc','adm-dash-activos','adm-dash-ate'].forEach(id=>{
        const el = document.getElementById(id);
        if(el) el.textContent = '—';
      });
    }
  }
  async function cargarCuentaAdmin(){
    if(!esAdmin()) return;
    document.getElementById('ac-correo').textContent = '—';
    document.getElementById('ac-rol').textContent = obtenerRol();
    document.getElementById('ac-fecha').textContent = '—';
    try{
      const resp = await apiFetch('/api/me/perfil');
      if(!resp.ok) throw new Error('No se pudo cargar el perfil (código ' + resp.status + ')');
      const data = await resp.json();
      document.getElementById('ac-correo').textContent = data.correo || '—';
      document.getElementById('ac-fecha').textContent = formatearFechaCorta(data.fecha_registro);
    }catch(err){
      if(esAbortado(err) || !esAdmin()) return;
      console.error('No se pudo cargar la cuenta administradora.', err);
    }
  }

  /* ---------- Panel administrativo: usuarios y suministros ---------- */
  let adminUsuarios = [];
  let admUsuSearch = '';
  let admUsuRol = 'Todos';
  let admUsuEstado = 'Todos';
  let adminUsuDetalle = null;
  function fmtFechaLarga(iso){
    try{
      const d = new Date(iso);
      if(isNaN(d)) return '—';
      return new Intl.DateTimeFormat('es-PE', {timeZone:'America/Lima', day:'2-digit', month:'2-digit', year:'numeric'}).format(d);
    }catch(e){ return '—'; }
  }
  async function cargarAdminUsuarios(){
    if(!esAdmin()) return;
    const list = document.getElementById('admin-usu-list');
    const emptyEl = document.getElementById('admin-usu-empty');
    try{
      const resp = await apiFetch('/api/admin/usuarios');
      if(!resp.ok) throw new Error('No se pudieron cargar los usuarios (código ' + resp.status + ')');
      const data = await resp.json();
      adminUsuarios = Array.isArray(data.usuarios) ? data.usuarios : [];
    }catch(err){
      if(esAbortado(err) || !esAdmin()) return;
      console.error('No se pudieron cargar los usuarios del panel.', err);
      adminUsuarios = [];
      if(emptyEl){ emptyEl.textContent = 'No fue posible cargar los usuarios. Inténtalo nuevamente.'; emptyEl.classList.add('show'); }
      if(list) list.innerHTML = '';
      return;
    }
    document.getElementById('adm-usu-total').textContent = adminUsuarios.length;
    document.getElementById('adm-usu-act').textContent = adminUsuarios.filter(u=>u.activo).length;
    document.getElementById('adm-usu-des').textContent = adminUsuarios.filter(u=>!u.activo).length;
    document.getElementById('adm-usu-ubi').textContent = adminUsuarios.filter(u=>u.distrito || u.zona).length;
    document.getElementById('adm-usu-sin').textContent = adminUsuarios.filter(u=>!u.distrito && !u.zona).length;
    renderAdminUsuarios();
  }
  function renderAdminUsuarios(){
    if(!esAdmin()) return;
    const list = document.getElementById('admin-usu-list');
    const emptyEl = document.getElementById('admin-usu-empty');
    if(!list) return;
    list.innerHTML = '';
    const q = admUsuSearch.trim().toLowerCase();
    const rows = adminUsuarios.filter(u =>
      (admUsuRol === 'Todos' || u.rol === admUsuRol) &&
      (admUsuEstado === 'Todos' || (admUsuEstado === 'activos' ? u.activo : !u.activo)) &&
      (!q || String(u.correo || '').toLowerCase().indexOf(q) > -1 || String(u.numero_suministro || '').indexOf(q) > -1)
    );
    if(!rows.length){
      if(emptyEl){
        emptyEl.textContent = adminUsuarios.length ? 'Sin resultados para esos filtros.' : 'Sin usuarios registrados.';
        emptyEl.classList.add('show');
      }
      return;
    }
    if(emptyEl) emptyEl.classList.remove('show');
    rows.forEach(u=>{
      const d = document.createElement('div');
      d.hmData=u;
      d.className = 'inc-item'; d.setAttribute('role','listitem');
      const badgeCls = u.activo ? 'Pagado' : '';
      const rolTxt = u.rol === 'admin' ? 'Administrador' : 'Usuario';
      const row = document.createElement('div'); row.className = 'row';
      const code = document.createElement('span'); code.className = 'inc-code'; code.textContent = u.correo;
      const badge = document.createElement('span'); badge.className = ('badge ' + badgeCls).trim(); badge.textContent = u.activo ? 'ACTIVO' : 'DESACTIVADO';
      row.appendChild(code); row.appendChild(badge);
      const desc = document.createElement('div'); desc.className = 'inc-desc';
      desc.textContent = 'Suministro: ' + (u.numero_suministro || '—') + ' · ' + rolTxt;
      const meta = document.createElement('div'); meta.className = 'inc-meta';
      meta.textContent = (u.distrito || 'Sin distrito') + ' / ' + (u.zona || 'Sin zona') + ' · Reg: ' + fmtFechaLarga(u.fecha_registro);
      const meta2 = document.createElement('div'); meta2.className = 'inc-meta';
      meta2.textContent = 'Recibos: ' + u.cantidad_recibos + ' · Pagos: ' + u.cantidad_pagos + ' · Incidencias: ' + u.cantidad_incidencias;
      d.appendChild(row); d.appendChild(desc); d.appendChild(meta); d.appendChild(meta2);
      const box = document.createElement('div'); box.className = 'tbl-actions';
      const bV = document.createElement('button');
      bV.type = 'button'; bV.className = 'btn-sm detail'; bV.textContent = 'Ver detalle';
      bV.addEventListener('click', ()=>verDetalleUsuario(u.id_usuario));
      box.appendChild(bV);
      d.appendChild(box);
      list.appendChild(d);
    });
    window.HMAdminTable(list);
  }
  async function verDetalleUsuario(idUsuario){
    if(!esAdmin()) return;
    try{
      const resp = await apiFetch('/api/admin/usuarios/' + encodeURIComponent(String(idUsuario)));
      if(!resp.ok) throw new Error('No se pudo cargar el detalle (código ' + resp.status + ')');
      const data = await resp.json();
      adminUsuDetalle = { id: idUsuario, suministro: data.suministro };
      const body = document.getElementById('admin-usu-det-body');
      const card = document.getElementById('admin-usu-det-card');
      const toggleBtn = document.getElementById('admin-usu-toggle');
      const activo = !!(data.cuenta && data.cuenta.activo);
      document.getElementById('admin-usu-det-title').textContent = 'Detalle de cuenta · ' + (data.cuenta ? data.cuenta.correo : '');
      body.innerHTML = '';
      body.appendChild(seccionContacto('Datos de cuenta', [
        ['Correo', (data.cuenta && data.cuenta.correo) || '—'],
        ['Rol', (data.cuenta && data.cuenta.rol === 'admin') ? 'Administrador' : 'Usuario'],
        ['Fecha', fmtFechaLarga(data.cuenta && data.cuenta.fecha_registro)],
        ['Estado', activo ? 'Activo' : 'Desactivado']
      ]));
      body.appendChild(seccionContacto('Suministro', [
        ['Numero', (data.suministro && data.suministro.numero_suministro) || '—'],
        ['Distrito', (data.suministro && data.suministro.distrito) || '—'],
        ['Zona', (data.suministro && data.suministro.zona) || '—']
      ]));
      body.appendChild(seccionContacto('Actividad', [
        ['Recibos', String(data.actividad.cantidad_recibos)],
        ['Pagos', String(data.actividad.cantidad_pagos)],
        ['Incidencias', String(data.actividad.cantidad_incidencias)]
      ]));
      toggleBtn.textContent = activo ? 'Desactivar cuenta' : 'Reactivar cuenta';
      toggleBtn.dataset.activo = activo ? '0' : '1';
      document.getElementById('admin-ubi-form').hidden = true;
      card.hidden = false;
    }catch(err){
      if(esAbortado(err) || !esAdmin()) return;
      console.error('No se pudo cargar el detalle.', err);
      showToast('No se pudo cargar el detalle del usuario.');
    }
  }
  document.getElementById('adm-usu-search').addEventListener('input', ev=>{ admUsuSearch = ev.target.value; renderAdminUsuarios(); });
  document.getElementById('adm-usu-rol').addEventListener('change', ev=>{ admUsuRol = ev.target.value; renderAdminUsuarios(); });
  document.getElementById('adm-usu-estado').addEventListener('change', ev=>{ admUsuEstado = ev.target.value; renderAdminUsuarios(); });
  document.getElementById('admin-usu-det-close').addEventListener('click', ()=>{
    document.getElementById('admin-usu-det-card').hidden = true;
    adminUsuDetalle = null;
  });
  document.getElementById('admin-usu-edit-ubi').addEventListener('click', ()=>{
    if(!adminUsuDetalle) return;
    const f = document.getElementById('admin-ubi-form');
    f.hidden = !f.hidden;
    if(!f.hidden && adminUsuDetalle.suministro){
      document.getElementById('adm-ubi-distrito').value = adminUsuDetalle.suministro.distrito || '';
      document.getElementById('adm-ubi-zona').value = adminUsuDetalle.suministro.zona || '';
    }
  });
  document.getElementById('admin-ubi-cancel').addEventListener('click', ()=>{ document.getElementById('admin-ubi-form').hidden = true; });
  document.getElementById('admin-ubi-form').addEventListener('submit', async ev=>{
    ev.preventDefault();
    const _releaseForm=window.HMShared.ui.beginForm(ev.currentTarget);
    if(!_releaseForm)return;
    try{

    ev.preventDefault();
    if(!adminUsuDetalle) return;
    if(!adminUsuDetalle.suministro) return;
    const idSum = adminUsuDetalle.suministro.id_suministro;
    try{
      const resp = await apiFetch('/api/admin/suministros/' + encodeURIComponent(String(idSum)) + '/ubicacion', {
        method: 'PATCH', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({distrito: document.getElementById('adm-ubi-distrito').value, zona: document.getElementById('adm-ubi-zona').value})
      });
      const data = await resp.json().catch(err=>{ if(esAbortado(err)) throw err; return null; });
      if(!resp.ok || !data || data.estado !== 'ok'){
        showToast('⚠ ' + ((data && data.mensaje) || 'No se pudo guardar la ubicación.'));
        return;
      }
      showSuccess('Ubicación actualizada correctamente.');
      document.getElementById('admin-ubi-form').hidden = true;
      await cargarAdminUsuarios();
      await verDetalleUsuario(adminUsuDetalle.id);
    }catch(err){
      if(esAbortado(err) || !esAdmin()) return; showToast('No se pudo guardar la ubicación.'); }

    }finally{_releaseForm();}
  });
  document.getElementById('admin-usu-toggle').addEventListener('click', ()=>{
    if(!adminUsuDetalle) return;
    const activar = document.getElementById('admin-usu-toggle').dataset.activo === '1';
    pedirConfirmacion(activar ? 'Reactivar cuenta' : 'Desactivar cuenta',
      '¿Deseas continuar? No se borrará información relacionada.',
      async ()=>{
        try{
          const resp = await apiFetch('/api/admin/usuarios/' + encodeURIComponent(String(adminUsuDetalle.id)) + '/estado', {
            method: 'PATCH', headers: {'Content-Type':'application/json'},
            body: JSON.stringify({activo: activar})
          });
          const data = await resp.json().catch(err=>{ if(esAbortado(err)) throw err; return null; });
          if(!resp.ok || !data || data.estado !== 'ok'){
            showToast('⚠ ' + ((data && data.mensaje) || 'No se pudo actualizar el estado.'));
            return;
          }
          showSuccess(activar ? 'Cuenta reactivada.' : 'Cuenta desactivada.');
          await cargarAdminUsuarios();
          await verDetalleUsuario(adminUsuDetalle.id);
        }catch(err){
      if(esAbortado(err) || !esAdmin()) return; showToast('No se pudo actualizar el estado.'); }
      });
  });

  /* ---------- Panel administrativo: incidencias ---------- */
  let adminIncidencias = [];
  let admIncEstado = 'Todos';
  let admIncTipo = 'Todos';
  let admIncSup = '';
  function formatearFechaHoraInc(iso){
    try{
      const d = new Date(iso);
      if(isNaN(d)) return '—';
      return new Intl.DateTimeFormat('es-PE', {
        timeZone: 'America/Lima',
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit', hour12: false
      }).format(d).replace(',', '');
    }catch(e){ return '—'; }
  }
  async function cargarAdminIncidencias(){
    if(!esAdmin()) return;
    const list = document.getElementById('admin-inc-list');
    const emptyEl = document.getElementById('admin-inc-empty');
    try{
      const resp = await apiFetch('/api/admin/incidencias');
      if(!resp.ok) throw new Error('No se pudieron cargar las incidencias (código ' + resp.status + ')');
      const data = await resp.json();
      adminIncidencias = Array.isArray(data.incidencias) ? data.incidencias : [];
    }catch(err){
      if(esAbortado(err) || !esAdmin()) return;
      console.error('No se pudieron cargar las incidencias del panel.', err);
      adminIncidencias = [];
      if(emptyEl){
        emptyEl.textContent = 'No fue posible cargar las incidencias. Inténtalo nuevamente.';
        emptyEl.classList.add('show');
      }
      if(list) list.innerHTML = '';
      ['adm-inc-total','adm-inc-reg','adm-inc-rev','adm-inc-res'].forEach(id=>{ document.getElementById(id).textContent = '—'; });
      return;
    }
    document.getElementById('adm-inc-total').textContent = adminIncidencias.length;
    document.getElementById('adm-inc-reg').textContent = adminIncidencias.filter(i=>i.estado==='Registrada').length;
    document.getElementById('adm-inc-rev').textContent = adminIncidencias.filter(i=>i.estado==='En revisión').length;
    document.getElementById('adm-inc-res').textContent = adminIncidencias.filter(i=>i.estado==='Resuelta').length;
    const selTipo = document.getElementById('adm-inc-tipo');
    const tipoActual = selTipo.value || 'Todos';
    const tipos = [];
    adminIncidencias.forEach(i=>{ if(i.tipo && tipos.indexOf(i.tipo) < 0) tipos.push(i.tipo); });
    tipos.sort();
    selTipo.innerHTML = '<option value="Todos">Todos los tipos</option>';
    tipos.forEach(t=>{
      const o = document.createElement('option');
      o.value = t; o.textContent = t;
      selTipo.appendChild(o);
    });
    selTipo.value = (tipoActual === 'Todos' || tipos.indexOf(tipoActual) >= 0) ? tipoActual : 'Todos';
    admIncTipo = selTipo.value;
    renderAdminIncidencias();
  }
  function renderAdminIncidencias(){
    if(!esAdmin()) return;
    const list = document.getElementById('admin-inc-list');
    const emptyEl = document.getElementById('admin-inc-empty');
    if(!list) return;
    list.innerHTML = '';
    const q = admIncSup.trim();
    const rows = adminIncidencias.filter(i =>
      (admIncEstado === 'Todos' || i.estado === admIncEstado) &&
      (admIncTipo === 'Todos' || i.tipo === admIncTipo) &&
      (!q || String(i.numero_suministro || '').indexOf(q) > -1)
    );
    if(!rows.length){
      if(emptyEl){
        emptyEl.textContent = adminIncidencias.length
          ? 'Sin resultados para esos filtros. Prueba con otra búsqueda.'
          : 'Sin incidencias registradas.';
        emptyEl.classList.add('show');
      }
      return;
    }
    if(emptyEl) emptyEl.classList.remove('show');
    rows.forEach(i=>{
      const d = document.createElement('div');
      d.hmData=i;
      d.className = 'inc-item'; d.setAttribute('role','listitem');
      const badgeCls = i.estado === 'Resuelta' ? 'Pagado' : (i.estado === 'En revisión' ? 'Pendiente' : 'info');
      const fila = document.createElement('div'); fila.className = 'row';
      fila.appendChild(nodo('span', 'inc-code', 'INCIDENCIA #' + i.id_incidencia));
      fila.appendChild(nodo('span', ('badge ' + badgeCls).trim(), String(i.estado || '').toUpperCase()));
      d.appendChild(fila);
      const linea = document.createElement('div'); linea.className = 'inc-desc';
      linea.appendChild(nodo('b', null, 'Suministro: ' + i.numero_suministro));
      linea.appendChild(document.createTextNode(' · ' + i.tipo));
      d.appendChild(linea);
      d.appendChild(nodo('div', 'inc-desc', i.descripcion));
      d.appendChild(nodo('div', 'inc-meta', 'Ref: ' + (i.referencia || '—') + ' · ' + formatearFechaHoraInc(i.fecha_registro)));
      const box = document.createElement('div'); box.className = 'tbl-actions';
      if(i.tiene_foto){
        const bF = document.createElement('button');
        bF.type = 'button'; bF.className = 'btn-sm detail'; bF.textContent = 'Ver fotografía';
        bF.addEventListener('click', ()=>abrirFotoProtegida(
          '/api/admin/incidencias/' + encodeURIComponent(String(i.id_incidencia)) + '/foto',
          'Incidencia #' + i.id_incidencia + ' · ' + i.tipo
        ));
        box.appendChild(bF);
      } else {
        const sin = document.createElement('span');
        sin.className = 'inc-meta'; sin.textContent = 'Sin fotografía adjunta';
        box.appendChild(sin);
      }
      const sel = document.createElement('select');
      sel.className = 'year-select';
      sel.setAttribute('aria-label', 'Cambiar estado de incidencia ' + i.id_incidencia);
      ['Registrada','En revisión','Resuelta'].forEach(e=>{
        const o = document.createElement('option');
        o.value = e; o.textContent = e;
        if(i.estado === e) o.selected = true;
        sel.appendChild(o);
      });
      sel.addEventListener('change', ()=>cambiarEstadoIncidencia(i.id_incidencia, sel.value, sel));
      box.appendChild(sel);
      d.appendChild(box);
      list.appendChild(d);
    });
    window.HMAdminTable(list);
  }
  async function cambiarEstadoIncidencia(id, estado, sel){
    if(!esAdmin()) return;
    try{
      const resp = await apiFetch('/api/admin/incidencias/' + encodeURIComponent(String(id)) + '/estado', {
        method: 'PATCH',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({estado: estado})
      });
      const data = await resp.json().catch(err=>{ if(esAbortado(err)) throw err; return null; });
      if(!resp.ok || !data || data.estado !== 'ok'){
        showToast('⚠ ' + ((data && data.mensaje) || 'No se pudo actualizar el estado.'));
        await cargarAdminIncidencias();
        return;
      }
      showSuccess('Estado actualizado a ' + data.incidencia.estado + '.');
      await cargarAdminIncidencias();
    }catch(err){
      if(esAbortado(err) || !esAdmin()) return;
      console.error('No se pudo actualizar el estado.', err);
      showToast('No se pudo actualizar el estado. Inténtalo nuevamente.');
      await cargarAdminIncidencias();
    }
  }
  document.getElementById('adm-inc-estado').addEventListener('change', ev=>{
    admIncEstado = ev.target.value;
    renderAdminIncidencias();
  });
  document.getElementById('adm-inc-tipo').addEventListener('change', ev=>{
    admIncTipo = ev.target.value;
    renderAdminIncidencias();
  });
  document.getElementById('adm-inc-sup').addEventListener('input', ev=>{
    admIncSup = ev.target.value;
    renderAdminIncidencias();
  });

  /* ---------- Panel administrativo: recibos ---------- */
  let adminRecibos = [];
  let adminRecEditId = null;
  let admRecEstado = 'Todos';
  let admRecQuery = '';
  async function cargarAdminRecibos(){
    if(!esAdmin()) return;
    const list = document.getElementById('admin-rec-list');
    const emptyEl = document.getElementById('admin-rec-empty');
    try{
      const resp = await apiFetch('/api/admin/recibos');
      if(!resp.ok) throw new Error('No se pudieron cargar los recibos (código ' + resp.status + ')');
      const data = await resp.json();
      adminRecibos = Array.isArray(data.recibos) ? data.recibos : [];
    }catch(err){
      if(esAbortado(err) || !esAdmin()) return;
      console.error('No se pudieron cargar los recibos del panel.', err);
      adminRecibos = [];
      if(emptyEl){
        emptyEl.textContent = 'No fue posible cargar los recibos. Inténtalo nuevamente.';
        emptyEl.classList.add('show');
      }
      if(list) list.innerHTML = '';
      ['adm-rec-total','adm-rec-emi','adm-rec-venc','adm-rec-pag','adm-rec-anu'].forEach(id=>{ document.getElementById(id).textContent = '—'; });
      return;
    }
    document.getElementById('adm-rec-total').textContent = adminRecibos.length;
    document.getElementById('adm-rec-emi').textContent = adminRecibos.filter(r=>r.estado==='Emitido' || r.estado==='Pendiente').length;
    document.getElementById('adm-rec-venc').textContent = adminRecibos.filter(r=>r.estado==='Vencido').length;
    document.getElementById('adm-rec-pag').textContent = adminRecibos.filter(r=>r.estado==='Pagado').length;
    document.getElementById('adm-rec-anu').textContent = adminRecibos.filter(r=>r.estado==='Anulado').length;
    renderAdminRecibos();
  }
  function renderAdminRecibos(){
    if(!esAdmin()) return;
    const list = document.getElementById('admin-rec-list');
    const emptyEl = document.getElementById('admin-rec-empty');
    if(!list) return;
    list.innerHTML = '';
    const q = admRecQuery.trim().toLowerCase();
    const rows = adminRecibos.filter(r =>
      (admRecEstado === 'Todos' || r.estado === admRecEstado) &&
      (!q || String(r.numero_suministro || '').indexOf(q) > -1 ||
        String(r.periodo || '').toLowerCase().indexOf(q) > -1)
    );
    if(!rows.length){
      if(emptyEl){
        emptyEl.textContent = adminRecibos.length
          ? 'Sin resultados para esos filtros. Prueba con otra búsqueda.'
          : 'Sin recibos registrados.';
        emptyEl.classList.add('show');
      }
      return;
    }
    if(emptyEl) emptyEl.classList.remove('show');
    rows.forEach(r=>{
      const d = document.createElement('div');
      d.hmData=r;
      d.className = 'inc-item'; d.setAttribute('role','listitem');
      const badgeCls = r.estado === 'Pagado' ? 'Pagado' : (r.estado === 'Vencido' ? 'Vencido' : (r.estado === 'Anulado' ? 'Anulado' : (r.estado === 'Emitido' ? 'Emitido' : 'Pendiente')));
      const row = document.createElement('div'); row.className = 'row';
      const code = document.createElement('span'); code.className = 'inc-code'; code.textContent = '#' + r.id_recibo + ' · ' + r.periodo;
      const badge = document.createElement('span'); badge.className = ('badge ' + badgeCls).trim(); badge.textContent = String(r.estado || '').toUpperCase();
      row.appendChild(code); row.appendChild(badge);
      const desc = document.createElement('div'); desc.className = 'inc-desc';
      desc.textContent = 'Suministro: ' + r.numero_suministro + ' · ' + fmt(Number(r.monto)) + ' · ' + Number(r.consumo_m3) + ' m³';
      const meta = document.createElement('div'); meta.className = 'inc-meta';
      meta.textContent = 'Emisión ' + formatearFechaCorta(r.fecha_emision) + ' · Vence ' + formatearFechaCorta(r.fecha_vencimiento);
      d.appendChild(row); d.appendChild(desc); d.appendChild(meta);
      const box = document.createElement('div'); box.className = 'tbl-actions';
      if(!r.tiene_pago){
        const bE = document.createElement('button');
        bE.type = 'button'; bE.className = 'btn-sm detail'; bE.textContent = 'Editar';
        bE.addEventListener('click', ()=>editarReciboAdmin(r.id_recibo));
        box.appendChild(bE);
        if(r.estado !== 'Anulado'){
          const bA = document.createElement('button');
          bA.type = 'button'; bA.className = 'btn-sm dangerb'; bA.textContent = 'Anular';
          bA.addEventListener('click', ()=>pedirConfirmacion('Anular recibo', '¿Deseas anular este recibo? Ya no podrá pagarse.', ()=>anularReciboAdmin(r.id_recibo)));
          box.appendChild(bA);
        }
      } else {
        const info = document.createElement('span');
        info.className = 'inc-meta'; info.textContent = 'Con pago registrado';
        box.appendChild(info);
      }
      if(box.children.length) d.appendChild(box);
      list.appendChild(d);
    });
    window.HMAdminTable(list);
  }
  function mostrarFormRecibo(editar){
    document.getElementById('admin-recibo-form-card').hidden = false;
    document.getElementById('admin-recibo-error').classList.remove('show');
    document.getElementById('admin-recibo-form-title').textContent = editar ? 'Editar recibo' : 'Nuevo recibo';
    document.getElementById('adm-rec-suministro').disabled = !!editar;
    const btn = document.getElementById('admin-recibo-submit');
    btn.dataset.busy = '0';
    btn.disabled = false;
    document.getElementById('admin-recibo-submit-text').textContent = editar ? 'Guardar cambios' : 'Publicar recibo';
    actualizarBotonRecibo();
    const foco = editar ? document.getElementById('adm-rec-periodo') : document.getElementById('adm-rec-suministro');
    if(foco) foco.focus();
  }
  function validarCamposRecibo(){
    const suministro = document.getElementById('adm-rec-suministro').value.trim();
    const periodo = document.getElementById('adm-rec-periodo').value.trim();
    const emision = document.getElementById('adm-rec-emision').value;
    const vencimiento = document.getElementById('adm-rec-vencimiento').value;
    const consumo = Number(document.getElementById('adm-rec-consumo').value);
    const monto = Number(document.getElementById('adm-rec-monto').value);
    if(!/^\d{9}$/.test(suministro)) return {ok:false, msg:'El número de suministro debe contener 9 dígitos.'};
    if(!periodo) return {ok:false, msg:'Selecciona un periodo.'};
    if(!emision) return {ok:false, msg:'Selecciona una fecha de emisión.'};
    if(!vencimiento) return {ok:false, msg:'Selecciona una fecha de vencimiento.'};
    if(new Date(vencimiento) < new Date(emision)) return {ok:false, msg:'La fecha de vencimiento debe ser igual o posterior a la fecha de emisión.'};
    if(!Number.isFinite(consumo) || consumo < 0) return {ok:false, msg:'El consumo no puede ser negativo.'};
    if(!Number.isFinite(monto) || monto <= 0) return {ok:false, msg:'El monto debe ser mayor a S/ 0.00.'};
    return {ok:true, msg:''};
  }
  function actualizarBotonRecibo(){
    const btn = document.getElementById('admin-recibo-submit');
    if(!btn || btn.dataset.busy === '1') return;
    const v = validarCamposRecibo();
    btn.disabled = !v.ok;
    const hint = document.getElementById('admin-recibo-hint');
    if(hint) hint.textContent = v.ok ? '' : v.msg;
  }
  ['adm-rec-suministro','adm-rec-periodo','adm-rec-emision','adm-rec-vencimiento','adm-rec-consumo','adm-rec-monto'].forEach(id=>{
    document.getElementById(id).addEventListener('input', actualizarBotonRecibo);
    document.getElementById(id).addEventListener('change', actualizarBotonRecibo);
  });
  function ocultarFormRecibo(){
    document.getElementById('admin-recibo-form-card').hidden = true;
    document.getElementById('admin-recibo-form').reset();
    document.getElementById('adm-rec-suministro').disabled = false;
    adminRecEditId = null;
  }
  document.getElementById('btn-nuevo-recibo').addEventListener('click', ()=>{
    adminRecEditId = null;
    document.getElementById('admin-recibo-form').reset();
    document.getElementById('adm-rec-suministro').disabled = false;
    mostrarFormRecibo(false);
  });
  document.getElementById('admin-recibo-cancel').addEventListener('click', ocultarFormRecibo);
  function editarReciboAdmin(id){
    const r = adminRecibos.find(x=>String(x.id_recibo) === String(id));
    if(!r || r.tiene_pago) return;
    adminRecEditId = r.id_recibo;
    document.getElementById('adm-rec-suministro').value = r.numero_suministro || '';
    document.getElementById('adm-rec-periodo').value = r.periodo || '';
    document.getElementById('adm-rec-emision').value = String(r.fecha_emision || '').slice(0, 10);
    document.getElementById('adm-rec-vencimiento').value = String(r.fecha_vencimiento || '').slice(0, 10);
    document.getElementById('adm-rec-consumo').value = r.consumo_m3;
    document.getElementById('adm-rec-monto').value = r.monto;
    mostrarFormRecibo(true);
  }
  async function anularReciboAdmin(id){
    if(!esAdmin()) return;
    try{
      const resp = await apiFetch('/api/admin/recibos/' + encodeURIComponent(String(id)) + '/anular', {method: 'PATCH'});
      const data = await resp.json().catch(err=>{ if(esAbortado(err)) throw err; return null; });
      if(!resp.ok || !data || data.estado !== 'ok'){
        showToast('⚠ ' + ((data && data.mensaje) || 'No se pudo anular el recibo.'));
        await cargarAdminRecibos();
        return;
      }
      showSuccess('Recibo anulado correctamente.');
      await cargarAdminRecibos();
    }catch(err){
      if(esAbortado(err) || !esAdmin()) return;
      console.error('No se pudo anular el recibo.', err);
      showToast('No se pudo anular el recibo. Inténtalo nuevamente.');
      await cargarAdminRecibos();
    }
  }
  document.getElementById('admin-recibo-form').addEventListener('submit', async ev=>{
    ev.preventDefault();
    const _releaseForm=window.HMShared.ui.beginForm(ev.currentTarget);
    if(!_releaseForm)return;
    try{

    ev.preventDefault();
    const btn = document.getElementById('admin-recibo-submit');
    if(btn.dataset.busy === '1') return;
    const errBox = document.getElementById('admin-recibo-error');
    errBox.classList.remove('show');
    const suministro = document.getElementById('adm-rec-suministro').value.trim();
    const periodo = document.getElementById('adm-rec-periodo').value.trim();
    const emision = document.getElementById('adm-rec-emision').value;
    const vencimiento = document.getElementById('adm-rec-vencimiento').value;
    const consumo = Number(document.getElementById('adm-rec-consumo').value);
    const monto = Number(document.getElementById('adm-rec-monto').value);
    let msg = null;
    if(!/^\d{9}$/.test(suministro)) msg = '⚠ El número de suministro debe contener 9 dígitos.';
    else if(!periodo) msg = '⚠ El periodo es obligatorio.';
    else if(!emision || !vencimiento) msg = '⚠ Indica emisión y vencimiento.';
    else if(new Date(vencimiento) < new Date(emision)) msg = '⚠ El vencimiento debe ser igual o posterior a la emisión.';
    else if(!Number.isFinite(monto) || monto <= 0) msg = '⚠ El monto debe ser mayor a 0.';
    else if(!Number.isFinite(consumo) || consumo < 0) msg = '⚠ El consumo debe ser mayor o igual a 0.';
    if(msg){
      errBox.textContent = msg;
      errBox.classList.add('show');
      return;
    }
    btn.dataset.busy = '1';
    btn.disabled = true;
    document.getElementById('admin-recibo-submit-text').textContent = adminRecEditId ? 'Guardando...' : 'Publicando...';
    try{
      const esEdicion = !!adminRecEditId;
      const url = esEdicion ? '/api/admin/recibos/' + encodeURIComponent(String(adminRecEditId)) : '/api/admin/recibos';
      const cuerpo = esEdicion
        ? {periodo: periodo, fecha_emision: emision, fecha_vencimiento: vencimiento, monto: monto, consumo_m3: consumo}
        : {numero_suministro: suministro, periodo: periodo, fecha_emision: emision, fecha_vencimiento: vencimiento, monto: monto, consumo_m3: consumo};
      const resp = await apiFetch(url, {
        method: esEdicion ? 'PATCH' : 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(cuerpo)
      });
      const data = await resp.json().catch(err=>{ if(esAbortado(err)) throw err; return null; });
      if(!resp.ok || !data || data.estado !== 'ok'){
        errBox.textContent = '⚠ ' + ((data && data.mensaje) || 'No se pudo guardar el recibo.');
        errBox.classList.add('show');
        btn.dataset.busy = '0';
        btn.disabled = false;
        document.getElementById('admin-recibo-submit-text').textContent = esEdicion ? 'Guardar cambios' : 'Publicar recibo';
        return;
      }
      ocultarFormRecibo();
      showSuccess(esEdicion ? 'Recibo actualizado correctamente.' : 'Recibo publicado correctamente.');
      await cargarAdminRecibos();
    }catch(err){
      if(esAbortado(err) || !esAdmin()) return;
      console.error('No se pudo guardar el recibo.', err);
      errBox.textContent = '⚠ No se pudo conectar con el servidor.';
      errBox.classList.add('show');
      btn.dataset.busy = '0';
      btn.disabled = false;
      document.getElementById('admin-recibo-submit-text').textContent = adminRecEditId ? 'Guardar cambios' : 'Publicar recibo';
    }

    }finally{_releaseForm();}
  });
  document.getElementById('adm-rec-estado').addEventListener('change', ev=>{
    admRecEstado = ev.target.value;
    renderAdminRecibos();
  });
  document.getElementById('adm-rec-search').addEventListener('input', ev=>{
    admRecQuery = ev.target.value;
    renderAdminRecibos();
  });

  /* ---------- Panel administrativo: pagos (solo consulta) ---------- */
  let adminPagos = [];
  let admPaySum = '';
  let admPayPer = '';
  let admPayMet = 'Todos';
  async function cargarAdminPagos(){
    if(!esAdmin()) return;
    const list = document.getElementById('admin-pay-list');
    const emptyEl = document.getElementById('admin-pay-empty');
    if(ctrlPagosAdmin) try{ ctrlPagosAdmin.abort(); }catch(e){}
    ctrlPagosAdmin = new AbortController();
    try{
      const qs = new URLSearchParams();
      if(admPaySum.trim()) qs.set('suministro', admPaySum.trim());
      if(admPayPer.trim()) qs.set('periodo', admPayPer.trim());
      if(admPayMet && admPayMet !== 'Todos') qs.set('metodo', admPayMet);
      const url = '/api/admin/pagos' + (qs.toString() ? '?' + qs.toString() : '');
      const resp = await apiFetch(url, { signal: ctrlPagosAdmin.signal });
      if(!resp.ok) throw new Error('No se pudieron cargar los pagos (código ' + resp.status + ')');
      const data = await resp.json();
      adminPagos = Array.isArray(data.pagos) ? data.pagos : [];
    }catch(err){
      if(esAbortado(err) || !esAdmin()) return;
      if(esAbortado(err)) return;
      console.error('No se pudieron cargar los pagos del panel.', err);
      adminPagos = [];
      if(emptyEl){ emptyEl.textContent = 'No fue posible cargar los pagos. Inténtalo nuevamente.'; emptyEl.classList.add('show'); }
      if(list) list.innerHTML = '';
      return;
    }
    const total = adminPagos.reduce((a,p)=>a + (Number(p.monto) || 0), 0);
    document.getElementById('adm-pay-total').textContent = adminPagos.length;
    document.getElementById('adm-pay-monto').textContent = fmt(total);
    try{
      // Comparar el mismo día que muestra la tabla, en America/Lima.
      const hoy = window.HMShared.ui.date(new Date().toISOString());
      const mes = hoy.slice(3);
      document.getElementById('adm-pay-hoy').textContent = adminPagos.filter(p=>window.HMShared.ui.date(p.fecha_pago) === hoy).length;
      document.getElementById('adm-pay-mes').textContent = adminPagos.filter(p=>window.HMShared.ui.date(p.fecha_pago).slice(3) === mes).length;
    }catch(e){}
    const sel = document.getElementById('adm-pay-met');
    const actual = sel.value || 'Todos';
    const mets = [];
    adminPagos.forEach(p=>{ if(p.metodo && mets.indexOf(p.metodo) < 0) mets.push(p.metodo); });
    mets.sort();
    sel.innerHTML = '<option value="Todos">Todos los métodos</option>';
    mets.forEach(m=>{ const o = document.createElement('option'); o.value = m; o.textContent = m; sel.appendChild(o); });
    sel.value = (actual === 'Todos' || mets.indexOf(actual) >= 0) ? actual : 'Todos';
    admPayMet = sel.value;
    renderAdminPagos();
  }
  function renderAdminPagos(){
    if(!esAdmin()) return;
    const list = document.getElementById('admin-pay-list');
    const emptyEl = document.getElementById('admin-pay-empty');
    if(!list) return;
    list.innerHTML = '';
    if(!adminPagos.length){
      if(emptyEl){ emptyEl.textContent = 'Sin pagos registrados.'; emptyEl.classList.add('show'); }
      return;
    }
    if(emptyEl) emptyEl.classList.remove('show');
    adminPagos.forEach(p=>{
      const d = document.createElement('div');
      d.hmData=p;
      d.className = 'inc-item'; d.setAttribute('role','listitem');
      const row = document.createElement('div'); row.className = 'row';
      const code = document.createElement('span'); code.className = 'inc-code'; code.textContent = '#' + p.id_pago + ' · ' + (p.periodo || '');
      const badge = document.createElement('span'); badge.className = 'badge Pagado'; badge.textContent = fmt(Number(p.monto));
      row.appendChild(code); row.appendChild(badge);
      const desc = document.createElement('div'); desc.className = 'inc-desc';
      desc.textContent = 'Suministro: ' + p.numero_suministro + ' · Recibo #' + p.id_recibo + ' · ' + (p.metodo || '—');
      const meta = document.createElement('div'); meta.className = 'inc-meta';
      meta.textContent = 'Código: ' + (p.codigo_operacion || '—') + ' · ' + formatearFechaCorta(p.fecha_pago);
      d.appendChild(row); d.appendChild(desc); d.appendChild(meta);
      list.appendChild(d);
    });
    window.HMAdminTable(list);
  }
  document.getElementById('adm-pay-sum').addEventListener('input', ev=>{ admPaySum = ev.target.value; cargarAdminPagosDebounced(); });
  document.getElementById('adm-pay-per').addEventListener('input', ev=>{ admPayPer = ev.target.value; cargarAdminPagosDebounced(); });
  document.getElementById('adm-pay-met').addEventListener('change', ev=>{ admPayMet = ev.target.value; renderAdminPagos(); });


  /* ---------- Panel administrativo: atención ---------- */
  let adminSolicitudes = [];
  let admAteEstado = 'Todos';
  let admAteCat = 'Todos';
  let admAteSum = '';
  let adminAteSel = null;
  let cacheResumenAte = { ts: 0, todas: null };
  const cargarAdminPagosDebounced = debounce(function(){ cargarAdminPagos(); }, 300);
  const cargarAdminAtencionDebounced = debounce(function(){ cargarAdminAtencion(); }, 300);
  async function cargarAdminAtencion(){
    if(!esAdmin()) return;
    const list = document.getElementById('admin-ate-list');
    const emptyEl = document.getElementById('admin-ate-empty');
    if(ctrlAtencionAdmin) try{ ctrlAtencionAdmin.abort(); }catch(e){}
    ctrlAtencionAdmin = new AbortController();
    try{
      const qs = new URLSearchParams();
      if(admAteEstado && admAteEstado !== 'Todos') qs.set('estado', admAteEstado);
      if(admAteCat && admAteCat !== 'Todos') qs.set('categoria', admAteCat);
      if(admAteSum.trim()) qs.set('suministro', admAteSum.trim());
      const url = '/api/admin/atencion' + (qs.toString() ? '?' + qs.toString() : '');
      const resp = await apiFetch(url, { signal: ctrlAtencionAdmin.signal });
      if(!resp.ok) throw new Error('No se pudieron cargar las solicitudes (código ' + resp.status + ')');
      const data = await resp.json();
      adminSolicitudes = Array.isArray(data.solicitudes) ? data.solicitudes : [];
    }catch(err){
      if(esAbortado(err) || !esAdmin()) return;
      if(esAbortado(err)) return;
      console.error('No se pudieron cargar las solicitudes del panel.', err);
      adminSolicitudes = [];
      if(emptyEl){ emptyEl.textContent = 'No fue posible cargar las solicitudes. Inténtalo nuevamente.'; emptyEl.classList.add('show'); }
      if(list) list.innerHTML = '';
      return;
    }
    // Métricas globales con caché breve (30s): evita una segunda petición
    // por cada tecla manteniendo cifras coherentes sin arquitectura nueva.
    try{
      var ahoraMs = Date.now();
      var todas = (cacheResumenAte.todas && (ahoraMs - cacheResumenAte.ts) < 30000)
        ? cacheResumenAte.todas : null;
      if(!todas){
        const r0 = await apiFetch('/api/admin/atencion', { signal: ctrlAtencionAdmin.signal });
        if(r0.ok){
          const d0 = await r0.json();
          todas = Array.isArray(d0.solicitudes) ? d0.solicitudes : [];
          cacheResumenAte = { ts: ahoraMs, todas: todas };
        }
      }
      if(todas){
        document.getElementById('adm-ate-total').textContent = todas.length;
        document.getElementById('adm-ate-reg').textContent = todas.filter(x=>x.estado === 'Registrada').length;
        document.getElementById('adm-ate-proc').textContent = todas.filter(x=>x.estado === 'En atención').length;
        document.getElementById('adm-ate-res').textContent = todas.filter(x=>x.estado === 'Respondida').length;
        document.getElementById('adm-ate-cer').textContent = todas.filter(x=>x.estado === 'Cerrada').length;
      }
    }catch(e){}
    renderAdminAtencion();
  }
  function renderAdminAtencion(){
    if(!esAdmin()) return;
    const list = document.getElementById('admin-ate-list');
    const emptyEl = document.getElementById('admin-ate-empty');
    if(!list) return;
    list.innerHTML = '';
    if(!adminSolicitudes.length){
      if(emptyEl){ emptyEl.textContent = 'Sin solicitudes registradas.'; emptyEl.classList.add('show'); }
      return;
    }
    if(emptyEl) emptyEl.classList.remove('show');
    adminSolicitudes.forEach(sol=>{
      const d = document.createElement('div');
      d.hmData=sol;
      d.className = 'inc-item'; d.setAttribute('role','listitem');
      const badgeCls = (sol.estado === 'Cerrada' || sol.estado === 'Respondida') ? 'Pagado' : (sol.estado === 'En atención' ? 'Pendiente' : 'info');
      const row = document.createElement('div'); row.className = 'row';
      const code = document.createElement('span'); code.className = 'inc-code'; code.textContent = '#' + sol.id_solicitud + ' · ' + sol.categoria;
      const badge = document.createElement('span'); badge.className = ('badge ' + badgeCls).trim(); badge.textContent = String(sol.estado || '').toUpperCase();
      row.appendChild(code); row.appendChild(badge);
      const t = document.createElement('div'); t.className = 'inc-desc'; t.textContent = 'Suministro: ' + sol.numero_suministro + ' · ' + sol.asunto;
      const desc = document.createElement('div'); desc.className = 'inc-desc'; desc.textContent = sol.descripcion;
      const meta = document.createElement('div'); meta.className = 'inc-meta'; meta.textContent = fmtFechaLarga(sol.fecha_registro);
      d.appendChild(row); d.appendChild(t); d.appendChild(desc); d.appendChild(meta);
      if(sol.respuesta){
        const r = document.createElement('div'); r.className = 'inc-desc'; r.textContent = 'Respuesta: ' + sol.respuesta;
        d.appendChild(r);
      }
      const box = document.createElement('div'); box.className = 'tbl-actions';
      const bR = document.createElement('button');
      bR.type = 'button'; bR.className = 'btn-sm detail'; bR.textContent = 'Responder / Actualizar';
      bR.addEventListener('click', ()=>abrirRespuestaAtencion(sol.id_solicitud));
      box.appendChild(bR);
      d.appendChild(box);
      list.appendChild(d);
    });
    window.HMAdminTable(list);
  }
  function abrirRespuestaAtencion(id){
    const sol = adminSolicitudes.find(x=>String(x.id_solicitud) === String(id));
    if(!sol) return;
    adminAteSel = sol;
    document.getElementById('admin-ate-resp-title').textContent = 'Solicitud #' + sol.id_solicitud + ' · ' + sol.asunto;
    var respBody = document.getElementById('admin-ate-resp-body');
    respBody.innerHTML = '';
    respBody.appendChild(nodo('p', 'hint', 'Suministro: ' + sol.numero_suministro + ' · ' + sol.categoria + ' · ' + sol.estado));
    respBody.appendChild(nodo('p', null, sol.descripcion));
    document.getElementById('adm-ate-estado-new').value = sol.estado;
    document.getElementById('adm-ate-resp-text').value = sol.respuesta || '';
    document.getElementById('admin-ate-resp-card').hidden = false;
  }
  document.getElementById('admin-ate-resp-cancel').addEventListener('click', ()=>{
    document.getElementById('admin-ate-resp-card').hidden = true;
    adminAteSel = null;
  });
  document.getElementById('admin-ate-resp-form').addEventListener('submit', async ev=>{
    ev.preventDefault();
    const _releaseForm=window.HMShared.ui.beginForm(ev.currentTarget);
    if(!_releaseForm)return;
    try{

    ev.preventDefault();
    if(!adminAteSel) return;
    try{
      const resp = await apiFetch('/api/admin/atencion/' + encodeURIComponent(String(adminAteSel.id_solicitud)), {
        method: 'PATCH', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({estado: document.getElementById('adm-ate-estado-new').value, respuesta: document.getElementById('adm-ate-resp-text').value})
      });
      const data = await resp.json().catch(err=>{ if(esAbortado(err)) throw err; return null; });
      if(!resp.ok || !data || data.estado !== 'ok'){
        showToast('⚠ ' + ((data && data.mensaje) || 'No se pudo guardar la respuesta.'));
        return;
      }
      showSuccess('Solicitud actualizada a ' + data.solicitud.estado + '.');
      document.getElementById('admin-ate-resp-card').hidden = true;
      adminAteSel = null;
      cacheResumenAte = { ts: 0, todas: null };
      await cargarAdminAtencion();
    }catch(err){
      if(esAbortado(err) || !esAdmin()) return; showToast('No se pudo guardar la respuesta.'); }

    }finally{_releaseForm();}
  });
  document.getElementById('adm-ate-estado').addEventListener('change', ev=>{ admAteEstado = ev.target.value; cargarAdminAtencion(); });
  document.getElementById('adm-ate-cat').addEventListener('change', ev=>{ admAteCat = ev.target.value; cargarAdminAtencion(); });
  document.getElementById('adm-ate-sum').addEventListener('input', ev=>{ admAteSum = ev.target.value; cargarAdminAtencionDebounced(); });



    const loaders = { admin: cargarDashboardAdmin, 'admin-cuenta': cargarCuentaAdmin,
      'admin-usuarios': cargarAdminUsuarios, 'admin-recibos': cargarAdminRecibos,
      'admin-cortes': cargarAdminCortes, 'admin-incidencias': cargarAdminIncidencias,
      'admin-pagos': cargarAdminPagos, 'admin-atencion': cargarAdminAtencion };
    let loadVersion=0;
    const sectionLoads=new WeakMap();
    return {
      async load(name) {
        if(!esAdmin() || !loaders[name])return;
        const version=++loadVersion;
        const section=document.getElementById('sec-'+name);
        const status=document.getElementById('admin-load-status');
        section?.setAttribute('aria-busy','true');
        if(section)sectionLoads.set(section,version);
        status.textContent='Cargando información…';
        try{await loaders[name]();}
        finally{
          if(!disposed && section && sectionLoads.get(section)===version)section.removeAttribute('aria-busy');
          if(!disposed && version===loadVersion)status.textContent='';
        }
      },
      closeDialogs,
      dispose() {
        disposed = true;
        cargarAdminPagosDebounced.cancel(); cargarAdminAtencionDebounced.cancel();
        if (ctrlPagosAdmin) ctrlPagosAdmin.abort();
        if (ctrlAtencionAdmin) ctrlAtencionAdmin.abort();
        closeDialogs();
        adminCortes = []; adminUsuarios = []; adminRecibos = []; adminIncidencias = [];
        adminPagos = []; adminSolicitudes = [];
        adminUsuDetalle = null; adminAteSel = null; adminEditId = null; adminRecEditId = null;
        cacheResumenAte = { ts: 0, todas: null };
      }
    };
  }
})();
