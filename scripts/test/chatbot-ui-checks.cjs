'use strict';
// Mismo recorrido DOM en Chromium y WebView; sin abrir enlaces externos.
const assert=require('node:assert/strict');
module.exports=async function({client:c,wait,ok}) {
  await c.click('#hb-fab');
  await wait(()=>c.evaluate('document.getElementById("hb-panel").classList.contains("open")'),'chatbot abierto');
  async function ask(text,match) {
    const before=await c.evaluate('document.querySelectorAll("#hb-body .hb-msg.bot").length');
    await c.fill('#hb-input',text);await c.click('#hb-send');
    await wait(()=>c.evaluate('!document.getElementById("hb-typing") && document.querySelectorAll("#hb-body .hb-msg.bot").length>'+before),'respuesta HidroBot');
    const result=await c.evaluate(`(()=>{const n=[...document.querySelectorAll('#hb-body .hb-msg.bot')].at(-1);return {text:n.textContent,source:n.querySelector('a')?.href||null};})()`);
    assert.match(result.text,match);return result;
  }
  const general=await ask('¿Qué es Sedapal?',/alcantarillado/);
  assert.equal(general.source,'https://www.gob.pe/sedapal');
  const personal=await ask('Mi último recibo de Sedapal',/recibo/i);
  assert.equal(personal.source,null,'Consulta personal no reemplazada por orientación general');
  await ask('<script>window.hidroInjected=true</script>',/orientarte/);
  assert.equal(await c.evaluate('Boolean(window.hidroInjected)||document.querySelectorAll("#hb-body script").length>0'),false);
  assert.equal(await c.evaluate('document.querySelectorAll("#hb-body .hb-msg.user")[document.querySelectorAll("#hb-body .hb-msg.user").length-1].textContent.includes("<script>")'),true);
  await c.click('#hb-close');
  await wait(()=>c.evaluate('!document.getElementById("hb-panel").classList.contains("open")'),'chatbot cerrado');
  ok('HidroBot integrado: orientación/fuente oficial, prioridad de recibo personal y texto sin ejecución HTML');
};
