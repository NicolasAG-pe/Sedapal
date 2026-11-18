/* Transporte opcional. Solo emite identificadores de artículos públicos, nunca el texto del chat. */
(function(root){
  'use strict';
  function createKnowledgeChat({knowledge, request, identifier, enabled=false, now=Date.now}) {
    let id, recent, pending, expiresAt=0;
    function reset(){
      pending?.abort();
      pending=undefined;
      recent=undefined;
      id=undefined;
      expiresAt=0;
    }
    async function reply({topic, followup=false, online=true}){
      if(now() >= expiresAt) reset();
      const expected = followup ? recent : topic;
      const variant = followup ? 'detail' : 'base';
      const fallback = knowledge.get(expected,variant);
      if(!fallback) return {text:'¿Sobre qué tema quieres más información?'};
      recent=expected;
      expiresAt=now()+5*60_000;
      if(!enabled || !online) return fallback;
      try{
        id ||= identifier();
        if(!id) return fallback;
        const controller = new AbortController();
        pending=controller;
        const deadline=setTimeout(()=>controller.abort(),2500);
        try{
          const response=await request({version:1,conversationId:id,topic:followup?'more':expected},controller.signal);
          if(controller.signal.aborted || response?.version!==1 || response.topic!==expected ||
            !['simulated','fallback'].includes(response.mode) || ![variant,'brief'].includes(response.variant)) return fallback;
          // Renderizar desde el catálogo compartido. No se aceptan enlaces o texto del proveedor.
          return knowledge.get(expected,response.variant) || fallback;
        }finally{
          clearTimeout(deadline);
          if(pending===controller) pending=undefined;
        }
      }catch(_){
        return fallback;
      }
    }
    return {reply,reset,hasTopic:()=>Boolean(recent && now()<expiresAt)};
  }
  if(typeof module==='object' && module.exports) module.exports={createKnowledgeChat};
  else root.HMHidroBotChat={createKnowledgeChat};
})(globalThis);
