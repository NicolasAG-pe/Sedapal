'use strict';
// PKG-T05: Firefox local, frontend real y API sintética. No usa BD ni proveedor.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { spawn } = require('node:child_process');
const staticOrigin = process.env.HIDRO_PKG01_STATIC_ORIGIN;
assert.match(staticOrigin || '', /^http:\/\/(?:127\.0\.0\.1|172\.(?:1[6-9]|2[0-9]|3[01])\.\d+\.\d+):\d+$/);
const browserPath = process.env.HIDRO_TEST_FIREFOX || '/usr/bin/firefox-esr';
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'hidro-pkg01-firefox-'));
const errors = [], requests = [], checks = [];
let available = true, browser, resolveReport;
const report = new Promise(resolve => { resolveReport = resolve; });
const observer = `window.addEventListener('error',e=>parent.pkgErrors.push(e.message||'resource: '+(e.target.src||e.target.href)),true);window.addEventListener('unhandledrejection',e=>parent.pkgErrors.push(String(e.reason)));const original=console.error;console.error=(...args)=>{parent.pkgErrors.push(args.map(String).join(' '));original.apply(console,args)};`;
const driver = `<!doctype html><meta charset="utf-8"><script>window.pkgErrors=[];</script><iframe id="app" src="/"></iframe><script>
const ok=(condition,label)=>{if(!condition)throw Error(label);return label};
const wait=async(fn,label)=>{const end=Date.now()+10000;while(!fn()){if(Date.now()>end)throw Error(label);await new Promise(r=>setTimeout(r,25));}};
(async()=>{const checks=[];try{
const f=document.getElementById('app');await new Promise(r=>f.onload=r);const w=f.contentWindow,d=w.document;
checks.push(ok(typeof w.createHMTwoFactorUI==='function' && typeof w.createHMPasswordRecovery==='function' && typeof w.createHMIncidentTimeline==='function','tres módulos cargados en frontend real'));
d.getElementById('forgot-link').click();await wait(()=>!d.getElementById('password-recovery').hidden && !d.getElementById('password-recovery').hasAttribute('aria-busy'),'abrir recuperación');
d.getElementById('recovery-email').value='fixture@example.invalid';d.getElementById('recovery-request').requestSubmit();await wait(()=>!d.getElementById('recovery-verify').hidden && !d.getElementById('password-recovery').hasAttribute('aria-busy'),'solicitar código sintético');
d.getElementById('recovery-code').value='12345678';d.getElementById('recovery-verify').requestSubmit();await wait(()=>!d.getElementById('recovery-complete').hidden && !d.getElementById('password-recovery').hasAttribute('aria-busy'),'validar código sintético');
d.getElementById('recovery-password').value=d.getElementById('recovery-confirm').value='SyntheticFixture42';d.getElementById('recovery-complete').requestSubmit();await wait(()=>d.getElementById('password-recovery').hidden,'completar recuperación');checks.push('recuperación completa con API sintética, sin sesión');
await fetch('/__pkg01-mode?available=0');d.getElementById('forgot-link').click();await wait(()=>d.getElementById('recovery-error').textContent.includes('no está disponible'),'capacidad cerrada');d.getElementById('recovery-back').click();checks.push('recuperación deshabilitada conserva aviso y regreso');
const area=d.createElement('div');d.body.append(area);let active=true;
const timeline=w.createHMIncidentTimeline({container:area,apiFetch:p=>w.fetch(p),path:id=>'/api/fixture/incidents/'+id,isActive:()=>active,openDialog:m=>m.classList.add('open'),closeDialog:m=>m.classList.remove('open')});
timeline.open('1');await wait(()=>area.querySelector('.incident-event-comment')?.textContent==='Seguimiento sintético','seguimiento visible');checks.push('seguimiento real con evento sintético');
area.querySelector('#incident-history-refresh').click();await wait(()=>!timeline.modal.hasAttribute('aria-busy'),'actualizar seguimiento');area.querySelector('#incident-history-close').click();checks.push(ok(!timeline.modal.classList.contains('open'),'cerrar seguimiento'));
active=false;timeline.open('1');checks.push(ok(!timeline.modal.classList.contains('open'),'seguimiento sin sesión no abre'));timeline.destroy();
checks.push(ok(pkgErrors.length===0,'sin errores de consola, recursos o promesas'));await fetch('/__pkg01-report',{method:'POST',body:JSON.stringify({ok:true,checks,errors:pkgErrors})});
}catch(e){await fetch('/__pkg01-report',{method:'POST',body:JSON.stringify({ok:false,checks,error:e.stack,errors:pkgErrors})});}})();</script>`;
function json(res, value) { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(value)); }
const server = http.createServer(async (req, res) => {
    try {
        const url = new URL(req.url, 'http://127.0.0.1');
        if (url.pathname === '/__pkg01-driver') { res.setHeader('Content-Type', 'text/html'); return res.end(driver); }
        if (url.pathname === '/__pkg01-observer.js') { res.setHeader('Content-Type', 'text/javascript'); return res.end(observer); }
        if (url.pathname === '/__pkg01-mode') { available = false; return json(res, {}); }
        if (url.pathname === '/__pkg01-report') {
            const chunks = []; for await (const b of req) chunks.push(b);
            resolveReport(JSON.parse(Buffer.concat(chunks))); return json(res, {});
        }
        if (url.pathname.startsWith('/api/auth/password-recovery/')) {
            requests.push(url.pathname);
            const step = url.pathname.split('/').at(-1);
            // Cuerpos y contraseña son fixtures; no se registran.
            req.resume();
            return json(res, step === 'capabilities' ? { disponible: available }
                : step === 'verify' ? { permiso: 's'.repeat(43) }
                    : { estado: 'ok', mensaje: 'Operación sintética completada.' });
        }
        if (url.pathname.startsWith('/api/fixture/incidents/')) {
            requests.push(url.pathname);
            return json(res, { incidencia: { id_incidencia: '1', estado_actual: 'Registrada', historial_completo: true },
                eventos: [{ id: '1', tipo: 'registro', estado_nuevo: 'Registrada', fecha: '2026-11-04T12:00:00Z', comentario_publico: 'Seguimiento sintético' }], siguiente: null });
        }
        if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/socket.io/')) throw Error('Ruta API no prevista: ' + url.pathname);
        const r = await fetch(staticOrigin + url.pathname);
        const data = Buffer.from(await r.arrayBuffer());
        if (!r.ok) errors.push('HTTP ' + r.status + ' ' + url.pathname);
        res.statusCode = r.status;
        res.setHeader('Content-Type', r.headers.get('content-type') || 'application/octet-stream');
        res.setHeader('Content-Security-Policy', "default-src 'self' data: blob:; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data: blob:");
        return res.end(url.pathname === '/' ? data.toString().replace('<head>', '<head><script src="/__pkg01-observer.js"></script>') : data);
    } catch (error) { errors.push(error.message); res.writeHead(500); res.end('Fixture error'); }
});
server.on('connect', (req, socket) => socket.destroy());
(async () => {
    let timer;
    try {
        // HTTP/MIME se comprueba directamente contra Nginx, no contra un stub de MIME.
        for (const name of ['two-factor-ui.js', 'password-recovery-ui.js', 'incident-timeline.js']) {
            const r = await fetch(staticOrigin + '/shared/' + name);
            assert.equal(r.status, 200); assert.match(r.headers.get('content-type'), /(?:text|application)\/javascript/);
            assert.equal(await r.text(), fs.readFileSync(path.join(__dirname, '../../Shared', name), 'utf8'));
            checks.push('HTTP 200 y MIME JavaScript real: ' + name);
        }
        await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
        const port = server.address().port;
        // Perfil exclusivo; proxy rechaza conexiones externas y CSP limita la aplicación al origen fixture.
        fs.writeFileSync(path.join(profile, 'user.js'), `user_pref("network.proxy.type",1);user_pref("network.proxy.http","127.0.0.1");user_pref("network.proxy.http_port",${port});user_pref("network.proxy.ssl","127.0.0.1");user_pref("network.proxy.ssl_port",${port});user_pref("network.proxy.no_proxies_on","127.0.0.1,localhost");user_pref("network.captive-portal-service.enabled",false);user_pref("network.connectivity-service.enabled",false);user_pref("browser.shell.checkDefaultBrowser",false);`);
        browser = spawn(browserPath, ['--headless', '--no-remote', '--profile', profile, `http://127.0.0.1:${port}/__pkg01-driver`], { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, MOZ_HEADLESS: '1' } });
        browser.on('error', error => resolveReport({ ok: false, error: error.message }));
        const result = await Promise.race([report, new Promise((_, reject) => { timer = setTimeout(() => reject(Error('Tiempo agotado de Firefox (45s)')), 45000); })]);
        assert.equal(result.ok, true, JSON.stringify(result));
        assert.deepEqual(errors, []); assert.deepEqual(result.errors, []);
        for (const step of ['request', 'verify', 'complete']) assert.ok(requests.includes('/api/auth/password-recovery/' + step));
        assert.ok(requests.filter(p => p === '/api/fixture/incidents/1').length >= 2);
        console.log(JSON.stringify({ ok: true, checks: [...checks, ...result.checks], errors: [], syntheticRequests: requests.length }, null, 2));
    } finally {
        clearTimeout(timer);
        if (browser && browser.exitCode === null) { const exited = new Promise(resolve => browser.once('exit', resolve)); browser.kill('SIGTERM'); await exited; }
        server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
        // Únicamente el perfil creado en esta ejecución.
        fs.rmSync(profile, { recursive: true, force: true });
    }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
