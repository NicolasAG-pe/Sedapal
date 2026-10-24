'use strict';
// Exclusivamente laboratorio hm_fixture/loopback; no lee .env ni destinos productivos.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const{nuevaBase,sql}=require('../../Backend/test/email-schema.cjs'),{Pool}=require('../../Backend/node_modules/pg');
const{crearCifradoTotp,respaldarClaves,restaurarClaves}=require('../../Backend/totp-crypto');
const{rotarClaveTotp}=require('../../Backend/maintenance/two-factor.cjs');
const hash=x=>crypto.createHash('sha256').update(typeof x==='string'||Buffer.isBuffer(x)?x:JSON.stringify(x)).digest('hex');
const dir=process.env.HIDRO_TOTP_LAB_DIR;if(!dir||(fs.statSync(dir).mode&0o077))throw Error('Directorio privado de laboratorio obligatorio.');
let stage='start';
const file=n=>path.join(dir,n),write=(n,data)=>fs.writeFileSync(file(n),typeof data==='string'?data:JSON.stringify(data),{mode:0o600,flag:'wx'});
async function snapshot(db){
 const tables=(await db.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).rows.map(r=>r.tablename),state={};
 for(const t of tables){assert.match(t,/^[a-z_][a-z0-9_]*$/);const rows=(await db.query(`SELECT to_jsonb(t) r FROM public.${t} t ORDER BY to_jsonb(t)::text`)).rows;state[t]={count:rows.length,sha256:hash(rows)};}
 // pg_dump/reparse puede distribuir el cast varchar[]→text[] sobre sus literales.
 const canonical=d=>d.replace(/\(('(?:''|[^'])*')::character varying\)::text/g,'$1').replace(/('(?:''|[^'])*')::character varying/g,'$1').replace(/\(ARRAY\[(.*?)\]\)::text\[\]/g,'ARRAY[$1]');
 state.constraints=hash((await db.query("SELECT conname,conrelid::regclass::text relation,contype,convalidated,condeferrable,condeferred,pg_get_constraintdef(oid) d FROM pg_constraint WHERE connamespace='public'::regnamespace ORDER BY conname,relation")).rows.map(r=>({...r,d:canonical(r.d)})));
 state.sequences=(await db.query("SELECT sequencename,last_value FROM pg_sequences WHERE schemaname='public' ORDER BY sequencename")).rows;
 return state;
}
(async()=>{
 if(process.argv[2]==='prepare'){
  const source=await nuevaBase('totp_source'),target=await nuevaBase('totp_target');await target.pool.end();const db=source.pool;
  try{
   await db.query(sql('init.sql'));await db.query("INSERT INTO usuarios(correo,clave_hash) VALUES ('restore-only@example.invalid','fixture-hash');INSERT INTO suministros(id_usuario,numero_suministro) VALUES (1,'987000001')");
   await db.query("INSERT INTO recibos(id_suministro,periodo,fecha_emision,fecha_vencimiento,monto,consumo_m3,estado) VALUES (1,'fixture',CURRENT_DATE,CURRENT_DATE,10,1,'Pagado');INSERT INTO pagos(id_recibo,monto,metodo) VALUES (1,10,'fixture')");
   const photo=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jr1sAAAAASUVORK5CYII=','base64');
   await db.query("INSERT INTO incidencias(id_suministro,tipo,descripcion,foto,foto_mime) VALUES (1,'fixture','Foto sintética',$1,'image/png')",[photo]);
   const old={TOTP_ENCRYPTION_KEY:crypto.randomBytes(32).toString('base64')},secret=new(require('../../Backend/node_modules/otpauth').Secret)({size:20}).base32;
   await db.query('INSERT INTO usuario_2fa(id_usuario,activo,secreto,version,ultimo_paso) VALUES (1,TRUE,$1,3,12345)',[crearCifradoTotp(old).encrypt(secret,1)]);
   await db.query("INSERT INTO usuario_2fa_recuperacion(id_usuario,codigo_hash,usado_en) VALUES (1,$1,clock_timestamp()),(1,$2,NULL)",[hash('synthetic-used-recovery'),hash('synthetic-unused-recovery')]);
   const next={TOTP_ENCRYPTION_KEY:crypto.randomBytes(32).toString('base64'),TOTP_PREVIOUS_ENCRYPTION_KEYS:JSON.stringify([old.TOTP_ENCRYPTION_KEY])};
   await rotarClaveTotp({pool:db,env:next,expectedDatabase:source.connection.database,dryRun:false});
   const kek=crypto.randomBytes(32);write('recovery.key',kek.toString('base64'));write('keys.enc',respaldarClaves(next,kek));
   write('manifest.json',{source:source.connection.database,target:target.connection.database,state:await snapshot(db),secretSha256:hash(secret),photoSha256:hash(photo)});
   console.log(JSON.stringify({prepared:true,source:source.connection.database,target:target.connection.database}));
  }finally{await db.end();}
 }else if(process.argv[2]==='verify'){
  const m=JSON.parse(fs.readFileSync(file('manifest.json'),'utf8'));assert.match(m.target,/^hm_email_totp_target_[a-f0-9]+$/);
  const db=new Pool({host:'127.0.0.1',port:Number(process.env.HIDRO_EMAIL_TEST_DB_PORT),database:m.target,user:'hm_fixture',password:'fixture-only-not-production'});
  try{
   stage='snapshot';const actual=await snapshot(db);const diffs=Object.keys(m.state).filter(k=>JSON.stringify(actual[k])!==JSON.stringify(m.state[k]));if(diffs.length)throw Error('snapshot:'+diffs.join(','));
   stage='keys';const env=restaurarClaves(fs.readFileSync(file('keys.enc'),'utf8'),Buffer.from(fs.readFileSync(file('recovery.key'),'utf8'),'base64'));
   stage='secret';const row=(await db.query('SELECT secreto,version,ultimo_paso FROM usuario_2fa WHERE id_usuario=1')).rows[0];assert.equal(hash(crearCifradoTotp(env).decrypt(row.secreto,1)),m.secretSha256);assert.equal(row.version,3);assert.equal(row.ultimo_paso,'12345');
   stage='photo';assert.equal(hash((await db.query('SELECT foto FROM incidencias WHERE id_incidencia=1')).rows[0].foto),m.photoSha256);
   write('result.json',{status:'passed',tables:Object.keys(m.state).filter(k=>!['constraints','sequences'].includes(k)).length,sequences:m.state.sequences.length,photoPreserved:true,keysRecovered:true,allTableDigestsEqual:true});
   console.log('OK: restauración aislada, fotografías, restricciones, secuencias, estado MFA y recuperación de claves.');
  }finally{await db.end();}
 }else throw Error('Modo de laboratorio inválido.');
})().catch(error=>{console.error('Falló el laboratorio de restauración TOTP; etapa='+stage+'; '+(error.message.startsWith('snapshot:')?error.message:'sin detalles privados.'));process.exitCode=1;});
