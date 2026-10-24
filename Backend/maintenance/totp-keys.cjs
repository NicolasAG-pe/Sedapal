'use strict';
// Respaldo/recuperación de CLAVES, sin conectar a PostgreSQL ni servicios remotos.
const fs=require('node:fs'),path=require('node:path');
const {respaldarClaves,restaurarClaves}=require('../totp-crypto');
function readPrivate(file){const fd=fs.openSync(file,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);try{const s=fs.fstatSync(fd);if(!s.isFile()||(s.mode&0o077)||s.size>8192||(process.getuid&&s.uid!==process.getuid()))throw Error();return fs.readFileSync(fd,'utf8');}finally{fs.closeSync(fd);}}
function writePrivate(file,data){const parent=fs.statSync(path.dirname(file));if(!parent.isDirectory()||(parent.mode&0o077)||(process.getuid&&parent.uid!==process.getuid()))throw Error();const fd=fs.openSync(file,fs.constants.O_WRONLY|fs.constants.O_CREAT|fs.constants.O_EXCL|fs.constants.O_NOFOLLOW,0o600);try{fs.writeFileSync(fd,data);}finally{fs.closeSync(fd);}}
function main(args=process.argv.slice(2),env=process.env){
 try{
  const[operation,...rest]=args,opts={};if(rest.length%2)throw Error();for(let i=0;i<rest.length;i+=2){if(!['--recovery-key-file','--backup-file','--output'].includes(rest[i])||opts[rest[i]])throw Error();opts[rest[i]]=rest[i+1];}
  if(!opts['--output']||!opts['--recovery-key-file'])throw Error();
  const raw=readPrivate(opts['--recovery-key-file']).trim(),key=Buffer.from(raw,'base64');if(key.length!==32||key.toString('base64')!==raw)throw Error();
  let data;
  if(operation==='backup'&&!opts['--backup-file'])data=respaldarClaves(env,key);
  else if(operation==='restore'&&opts['--backup-file'])data=JSON.stringify(restaurarClaves(readPrivate(opts['--backup-file']),key));
  else throw Error();
  writePrivate(opts['--output'],data+'\n');return{status:'ok',operation,mode:'0600'};
 }catch(_){throw Error('No se pudo completar el respaldo/recuperación privado de claves TOTP.');}
}
if(require.main===module){try{console.log(JSON.stringify(main()));}catch(_){console.error('Respaldo/recuperación TOTP rechazado; revisar destino, permisos y material privado.');process.exitCode=1;}}
module.exports={main};
