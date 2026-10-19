'use strict';
// Diagnóstico histórico reproducible. Solo git show (local), base nueva y proveedor simulado.
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const path=require('node:path');
const Module=require('node:module');
const {execFileSync}=require('node:child_process');
const {nuevaBase}=require('./email-schema.cjs');
const revision='b2f079a224e8220b55208b279004e42a7edb4c8e';
const read=file=>execFileSync('git',['show',`${revision}:${file}`],{cwd:path.join(__dirname,'../..'),encoding:'utf8'});
async function main(){
    const legacy=new Module(path.join(__dirname,'../email-registration.h03-legacy.cjs'),module);
    legacy.filename=legacy.id;
    legacy.paths=module.paths;
    legacy._compile(read('Backend/email-registration.js'),legacy.filename);
    const {pool}=await nuevaBase('h03_baseline');
    try{
        await pool.query(read('Base-de-Datos/init.sql'));
        const sends=[];let fail=true;
        const adapter={connect:async()=>{
            const client=await pool.connect();
            return {query:async(...args)=>{
                if(args[0]==='COMMIT' && fail){fail=false;throw Object.assign(new Error('fixture commit failure'),{code:'08006'});}
                return client.query(...args);
            },release:()=>client.release()};
        }};
        const service=legacy.exports.crearRegistroCorreo({pool:adapter,secreto:crypto.randomBytes(32).toString('hex'),
            generarClaveHash:()=> 'fixture-hash',enviarCodigo:async m=>{sends.push(m.envioId);}});
        const body={correo:'baseline@example.invalid',numero_suministro:'940000003',password:'FixtureOutbox123'};
        await assert.rejects(service.registrar(body),{code:'08006'});
        assert.equal(sends.length,1);
        assert.equal((await pool.query('SELECT count(*)::int AS n FROM registros_correo_pendientes')).rows[0].n,0);
        await service.registrar(body);
        assert.equal(sends.length,2);assert.notEqual(sends[0],sends[1]);
        assert.equal((await pool.query('SELECT count(*)::int AS n FROM registros_correo_envios')).rows[0].n,1);
        console.log('H03 histórico reproducido: aceptación simulada antes de COMMIT fallido; cero solicitudes y dos identidades al reintentar.');
    }finally{await pool.end();}
}
if(require.main===module)main().catch(()=>{console.error('Falló el diagnóstico histórico aislado.');process.exitCode=1;});
module.exports={main};
