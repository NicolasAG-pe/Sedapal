'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const databasePattern=/^hm_(?:email_)?yape_pilot_[a-f0-9]{12,32}$/;
const uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(v);
function privateFile(file,max=8192){
 if(!path.isAbsolute(file||''))throw Error('Configuración privada de piloto requerida.');
 const fd=fs.openSync(file,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);
 try{const s=fs.fstatSync(fd);if(!s.isFile()||s.size>max||(s.mode&0o077)||s.uid!==process.getuid())throw Error('Archivo privado incompatible.');return fs.readFileSync(fd);}finally{fs.closeSync(fd);}
}
function loadPilot(env=process.env){
 if(env.YAPE_PILOT_ENABLED!=='1')return null;
 if(!['test','development'].includes(env.NODE_ENV)||env.DATABASE_URL||!['127.0.0.1','localhost'].includes(env.DB_HOST)||!databasePattern.test(env.POSTGRES_DB||''))throw Error('El piloto exige una base local aislada.');
 const p=JSON.parse(privateFile(env.YAPE_PILOT_CONFIG_FILE));
 if(p.version!==1||!uuid(p.id)||!/^\d+$/.test(String(p.user_id))||!/^\d+$/.test(String(p.admin_id))||String(p.user_id)===String(p.admin_id)||!/^\d+$/.test(String(p.receipt_id))||typeof p.synthetic!=='boolean'||!/^\d+\.\d{2}$/.test(p.max_amount)||Number(p.max_amount)<=0||Number(p.max_amount)>5||!/^\d{4}-.*Z$/.test(p.starts_at)||!/^\d{4}-.*Z$/.test(p.expires_at)||!Number.isFinite(Date.parse(p.starts_at))||!Number.isFinite(Date.parse(p.expires_at))||Date.parse(p.expires_at)-Date.parse(p.starts_at)>4*3600000||Date.parse(p.expires_at)<=Date.parse(p.starts_at)||!/^[a-f0-9]{64}$/.test(p.qr_hash||''))throw Error('Manifiesto de piloto inválido.');
 return p;
}
async function guardPilot(c,p,user,admin=false,{active=true,receipt}={}){
 const{rows:[r]}=await c.query(`SELECT current_database() AS db,p.*,r.monto AS recibo_monto,r.estado AS recibo_estado,s.id_usuario AS propietario FROM control_piloto_yape p JOIN recibos r ON r.id_recibo=p.id_recibo JOIN suministros s ON s.id_suministro=r.id_suministro WHERE singleton=true AND piloto_id=$1 FOR SHARE OF p`,[p.id]);
 if(!r||!databasePattern.test(r.db)||String(r.id_usuario)!==String(p.user_id)||String(r.id_admin)!==String(p.admin_id)||String(r.id_recibo)!==String(p.receipt_id)||r.qr_hash!==p.qr_hash||r.ensayo_sintetico!==p.synthetic||r.monto_maximo!==p.max_amount||r.inicio_en.toISOString()!==p.starts_at||r.vence_en.toISOString()!==p.expires_at||String(user.id_usuario)!==String(admin?p.admin_id:p.user_id)||(receipt&&String(receipt)!==String(p.receipt_id)))throw Error('El piloto no corresponde a esta cuenta o recibo.');
 if(r.recibo_monto!==p.max_amount||String(r.propietario)!==String(p.user_id)||['Anulado','Pagado'].includes(r.recibo_estado))throw Error('Recibo del piloto cambiado.');
 const{rows:[actor]}=await c.query('SELECT rol,activo FROM usuarios WHERE id_usuario=$1',[user.id_usuario]);if(!actor?.activo||actor.rol!==(admin?'admin':'usuario'))throw Error('Cuenta de piloto no habilitada para ese rol.');
 if(active&&(!r.habilitado||Date.now()<Date.parse(p.starts_at)||Date.now()>=Date.parse(p.expires_at)))throw Error('Ventana de piloto cerrada.');
 return r;
}
const fingerprint=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
module.exports={loadPilot,guardPilot,privateFile,fingerprint,databasePattern};
