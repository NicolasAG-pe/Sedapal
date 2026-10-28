'use strict';
// Verificación estática/de runtime: no ejecuta Gradle, firma, adb install ni servicios.
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {execFileSync}=require('node:child_process');
const {buildWeb}=require('../build-web');
const {verifyClientRuntime}=require('../verify-client-runtime');
const root=path.resolve(__dirname,'../..');
const old=file=>execFileSync('git',['show','v1.0.0:'+file],{cwd:root,encoding:'utf8'});
const current=file=>fs.readFileSync(path.join(root,file),'utf8');
const field=(source,name)=>source.match(new RegExp('\\b'+name+'\\s+(?:"([^"]+)"|(\\d+))'))?.slice(1).find(Boolean);
test('Candidato conserva identidad/certificado y solo añade el manifiesto FCM aprobado',()=>{
 const file='android/app/build.gradle',previous=old(file),next=current(file);
 assert.ok(Number(field(next,'versionCode'))>Number(field(previous,'versionCode')));
 const a=field(next,'versionName').split('.').map(Number),b=field(previous,'versionName').split('.').map(Number);
 assert.equal(a.length,3);assert.ok(a.every(Number.isInteger));
 const different=a.findIndex((v,i)=>v!==b[i]);assert.ok(different>=0 && a[different]>b[different]);
 for(const name of ['applicationId','namespace'])assert.equal(field(next,name),field(previous,name));
 assert.equal(current('android/release-certificate.sha256').trim(),old('android/release-certificate.sha256').trim());
 // PR #17 añadió únicamente permiso voluntario y metadatos FCM. No aceptar
 // otros permisos, componentes exportados ni cambios de respaldo por esta excepción.
 const manifest=current('android/app/src/main/AndroidManifest.xml');
 const additions=new Set([
  '<meta-data android:name="firebase_messaging_auto_init_enabled" android:value="false" />',
  '<meta-data android:name="com.google.firebase.messaging.default_notification_icon" android:resource="@drawable/hm_notification" />',
  '<meta-data android:name="com.google.firebase.messaging.default_notification_channel_id" android:value="hm_updates" />',
  '<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />'
 ]);
 for(const line of additions)assert.equal(manifest.split('\n').filter(value=>value.trim()===line).length,1,'Adición FCM exacta y única: '+line);
 assert.equal(manifest.split('\n').filter(line=>!additions.has(line.trim())).join('\n'),old('android/app/src/main/AndroidManifest.xml'));
 assert.equal(current('android/variables.gradle'),old('android/variables.gradle'));
});
test('Capacitor conserva contenido empaquetado, esquema seguro y sin servidor remoto/OTA',()=>{
 const script=`process.env.API_BASE_URL='https://api.example.invalid';const c=require('./capacitor.config');process.stdout.write(JSON.stringify(c));`;
 const c=JSON.parse(execFileSync(process.execPath,['-e',script],{cwd:root,encoding:'utf8'}));
 assert.equal(c.appId,'pe.edu.hidromejora.app');assert.equal(c.server.androidScheme,'https');assert.equal(c.server.url,undefined);
 assert.equal(c.webDir,'artifacts/android/web-runtime');assert.equal(c.server.cleartext,undefined);
 assert.match(current('scripts/build-android-release.cjs'),/https:\/\/hidro-mejora-api\.onrender\.com/);
 assert.match(current('android/app/build.gradle'),/debuggable false/);
});
test('Runtime candidato contiene OTP/rutas propias, recursos cliente y ningún secreto del servidor',()=>{
 const out=fs.mkdtempSync(path.join(os.tmpdir(),'hidro-candidate-'));
 buildWeb('android',{API_BASE_URL:'https://api.example.invalid'},out);
 const r=verifyClientRuntime(out);assert.equal(r.administrativeCode,false);
 const html=fs.readFileSync(path.join(out,'index.html'),'utf8');
 assert.ok(html.includes('/api/auth/otp/register'));assert.ok(html.includes('btn-check-email'));assert.ok(html.includes('verify-email-form'));
 for(const value of ['RESEND_API_KEY','EMAIL_OTP_SECRET','EMAIL_OUTBOX_KEY','AUTH_TOKEN_SECRET','postgres://'])assert.equal(html.includes(value),false);
 assert.equal(fs.existsSync(path.join(out,'admin.js')),false);
});
