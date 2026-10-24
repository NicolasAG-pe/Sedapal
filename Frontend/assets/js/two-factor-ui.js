/* Solo estado efímero en memoria/DOM. Nunca Preferences, archivos ni WebStorage. */
(function(global){
  'use strict';
  global.createHMTwoFactorUI=function({session,apiFetch,showLogin,showChallenge,authenticated,showProfile}){
    const el=id=>document.getElementById('two-factor-'+id);
    let pending=null,active=false,busy=false,generation=0,timer;
    function hidePrivate(){
      el('manage').reset();el('confirm').reset();el('confirm').hidden=true;
      el('qr').removeAttribute('src');el('codes-list').textContent='';el('codes').hidden=true;
      el('settings-error').textContent='';el('controls').hidden=true;
    }
    function clear(){
      generation++;pending=null;clearTimeout(timer);busy=false;active=false;
      el('login').reset();el('login').hidden=true;el('login-error').textContent='';hidePrivate();
      el('status').textContent='Consulta el estado de protección de tu cuenta.';el('open').disabled=true;render();
      for(const b of document.querySelectorAll('#two-factor-login button,#two-factor-controls button'))b.disabled=false;
    }
    async function request(path,body,privateRoute){
      const epoch=generation;
      const options={method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)};
      // Un 401 de reautenticación/código no equivale a un JWT caducado: mostrarlo
      // sin cerrar la sesión ni perder el QR; el servidor valida ambos por separado.
      if(privateRoute)options.headers.Authorization='Bearer '+session.token();
      const res=await session.authFetch(path,options);
      const data=await res.json();
      if(epoch!==generation)throw new DOMException('Operación cancelada.','AbortError');
      if(!res.ok)throw new Error(data.mensaje || 'No se pudo verificar el código.');
      return data;
    }
    async function run(errorId,task){
      if(busy)return;busy=true;const epoch=generation;el(errorId).textContent='';
      for(const b of document.querySelectorAll('#two-factor-login button,#two-factor-controls button'))b.disabled=true;
      try{await task();}catch(error){if(error.name!=='AbortError'&&epoch===generation)el(errorId).textContent=error.message;}
      finally{if(epoch===generation){busy=false;for(const b of document.querySelectorAll('#two-factor-login button,#two-factor-controls button'))b.disabled=false;}}
    }
    function render(){
      el('existing').hidden=!active;el('setup').hidden=active;el('recovery').hidden=!active;el('disable').hidden=!active;
    }
    async function load(){
      const epoch=generation;
      try{
        const res=await apiFetch('/api/auth/2fa'),data=await res.json();if(epoch!==generation)return;
        if(!res.ok)throw new Error('No se pudo consultar la verificación en dos pasos.');
        active=data.activo;el('status').textContent=active?'Activada. Códigos de recuperación disponibles: '+data.recuperacion:'Desactivada. Puedes proteger tu cuenta con una aplicación autenticadora.';
        el('open').disabled=!data.disponible;
        if(!data.disponible)el('status').textContent+=' Configuración temporalmente no disponible.';
        render();
      }catch(error){if(error.name!=='AbortError'&&epoch===generation)el('status').textContent='No se pudo consultar la seguridad de la cuenta.';}
    }
    el('open').addEventListener('click',()=>{hidePrivate();render();el('controls').hidden=false;el('password').focus();});
    el('close').addEventListener('click',()=>{if(!busy)hidePrivate();});
    el('manage').addEventListener('submit',event=>{event.preventDefault();run('settings-error',async()=>{
      const password=el('password').value;el('password').value='';
      const data=await request('/api/auth/2fa/setup',{password},true);
      if(typeof data.qr!=='string'||!data.qr.startsWith('data:image/png;base64,'))throw new Error('No se pudo preparar el QR.');
      el('qr').src=data.qr;el('confirm').hidden=false;el('confirm-code').focus();
      clearTimeout(timer);timer=setTimeout(()=>{hidePrivate();el('status').textContent='La configuración caducó. Confirma tu contraseña para iniciar otra.';},Math.max(0,Date.parse(data.vence_en)-Date.now()));
    });});
    async function changed(data){
      await authenticated(data);pending=null;clearTimeout(timer);hidePrivate();
      showProfile();el('controls').hidden=false;
      if(data.codigos_recuperacion){el('codes-list').textContent=data.codigos_recuperacion.join('\n');el('codes').hidden=false;}
      await load();
    }
    el('confirm').addEventListener('submit',event=>{event.preventDefault();run('settings-error',async()=>{
      const codigo=el('confirm-code').value;el('confirm-code').value='';
      await changed(await request('/api/auth/2fa/confirm',{codigo},true));
    });});
    for(const [button,path]of [['disable','disable'],['recovery','recovery']])el(button).addEventListener('click',()=>run('settings-error',async()=>{
      const body={password:el('password').value,codigo:el('existing-code').value};el('password').value='';el('existing-code').value='';
      await changed(await request('/api/auth/2fa/'+path,body,true));
    }));
    el('login').addEventListener('submit',event=>{event.preventDefault();run('login-error',async()=>{
      if(!pending || Date.parse(pending.vence_en)<=Date.now())throw new Error('El desafío venció. Vuelve a iniciar sesión.');
      const codigo=el('login-code').value;el('login-code').value='';
      const data=await request('/api/auth/2fa/login',{desafio:pending.desafio,codigo},false);
      await authenticated(data);pending=null;clearTimeout(timer);el('login').reset();el('login').hidden=true;
    });});
    el('cancel').addEventListener('click',()=>{clear();showLogin();});
    return{clear,load,challenge(data){
      if(typeof data.desafio!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(data.desafio)||!Number.isFinite(Date.parse(data.vence_en)))throw new Error('Desafío inválido.');
      clear();pending={desafio:data.desafio,vence_en:data.vence_en};showChallenge();el('login').hidden=false;el('login-code').focus();
      timer=setTimeout(()=>{pending=null;el('login').reset();el('login-error').textContent='El desafío venció. Vuelve a iniciar sesión.';},Math.max(0,Date.parse(data.vence_en)-Date.now()));
    }};
  };
})(window);
