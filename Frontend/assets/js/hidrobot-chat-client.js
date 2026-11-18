/* Transporte opcional. Solo emite identificadores de artículos públicos, nunca el texto del chat. */
(function(root){
  'use strict';
  function createKnowledgeChat({knowledge, request, identifier, enabled=false, version=1, now=Date.now}) {
    let id, recent, remoteTopic, pending, expiresAt=0;
    function reset(){
      pending?.abort();
      pending=undefined;
      recent=undefined;
      remoteTopic=undefined;
      id=undefined;
      expiresAt=0;
    }
    async function reply({topic, followup=false, style=followup?'detail':'standard', online=true}){
      if(now() >= expiresAt) reset();
      const expected = followup ? recent : topic;
      const variant = ['simple','summary'].includes(style)?'brief':followup || style==='detail'?'detail':'base';
      const fallback = knowledge.get(expected,variant);
      if(!fallback) return {text:'¿Sobre qué tema quieres más información?'};
      recent=expected;
      expiresAt=now()+5*60_000;
      if(!enabled || !online) {
        remoteTopic=undefined;
        return fallback;
      }
      try{
        id ||= identifier();
        if(!id) return fallback;
        const controller = new AbortController();
        pending?.abort();
        pending=controller;
        const deadline=setTimeout(()=>controller.abort(),version===2?9500:2500);
        try{
          const continuation=followup && (version===1 || remoteTopic===expected);
          const body={version,conversationId:id,topic:continuation?'more':expected};
          if(version===2) body.style=style;
          const response=await request(body,controller.signal);
          if(controller.signal.aborted) return fallback;
          remoteTopic=undefined;
          if(response?.version!==version || response.topic!==expected) return fallback;
          if(version===2 && ['generated','generated-simulated'].includes(response.mode)){
            const answer=knowledge.generated(expected,{text:response.text,evidence:response.evidence},style);
            if(!answer) return fallback;
            remoteTopic=expected;
            return {text:answer.text,source:fallback.source,mode:response.mode};
          }
          if(!['simulated','fallback'].includes(response.mode) || ![variant,'brief'].includes(response.variant)) return fallback;
          remoteTopic=expected;
          return knowledge.get(expected,response.variant) || fallback;
        }catch(_){
          if(pending===controller) remoteTopic=undefined;
          return fallback;
        }finally{
          clearTimeout(deadline);
          if(pending===controller) pending=undefined;
        }
      }catch(_){
        remoteTopic=undefined;
        return fallback;
      }
    }
    return {reply,reset,hasTopic:()=>Boolean(recent && now()<expiresAt)};
  }
  if(typeof module==='object' && module.exports) module.exports={createKnowledgeChat};
  else root.HMHidroBotChat={createKnowledgeChat};
})(globalThis);
