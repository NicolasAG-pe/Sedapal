/* Orientación pública compartida por la aplicación y el servicio de conversación.
 * Fuentes: https://www.gob.pe/sedapal
 * https://www.gob.pe/12786-llamar-a-sedapal-aquafono
 * https://www.gob.pe/institucion/sedapal/contacto-y-numeros-de-emergencias
 */
(function(root){
  'use strict';
  const official = 'https://www.gob.pe/sedapal';
  const contact = 'https://www.gob.pe/institucion/sedapal/contacto-y-numeros-de-emergencias';
  const billing = 'https://www.gob.pe/institucion/vivienda/noticias/1183077-cuidemos-el-agua-sedapal-te-ensena-a-leer-el-consumo-de-agua-potable-en-tu-recibo';
  const tips = 'https://www.gob.pe/institucion/sedapal/noticias/1178111-sedapal-te-guia-hacia-un-consumo-responsable-y-sostenible-del-agua';
  const styles = Object.freeze(['standard','detail','simple','summary']);
  const variants = ['base','detail','brief'];
  const topics = [
    {
      id:'read-receipt',
      matches:t=> /\b(?:explicame|explica|entender|leer|interpretar|que significa|que es)\b.{0,75}\b(?:recibo|recivo|recibbo|factura|boleta|vencimiento|cargo fijo|alcantarillado)\b/.test(t)
        && !/\b(?:cuanto|cuando|a que hora)\b/.test(t),
      text:'En el recibo, revisa el periodo, el consumo registrado en m³, el importe y la fecha límite de pago. El consumo y el importe se expresan en unidades distintas. En Hidro-Mejora puedes abrir el detalle para ver los valores registrados.',
      brief:'Revisa cuatro campos del recibo: periodo, consumo en m³, importe y fecha de vencimiento.',
      detail:'El periodo indica a qué facturación corresponde el recibo. La fecha de vencimiento indica hasta cuándo se puede pagar dentro del plazo. Para fechas e importes concretos, consulta el detalle del recibo.',
      url:billing
    },
    {
      id:'saving',
      matches:t=> /\b(?:ahorrar|ahorar|ahorro|cuidar|cuidado|desperdiciar|reducir|gastar menos|consejos)\b.*\b(?:agua|consumo|cosnumo)\b/.test(t),
      text:'Para cuidar el agua, cierra el caño al cepillarte, toma duchas cortas y revisa posibles fugas en caños e inodoros. En Inicio puedes comparar tu consumo para detectar cambios.',
      brief:'Cierra el caño cuando no lo uses, acorta las duchas y revisa fugas.',
      detail:'Presta atención a goteos y fugas en caños, inodoros y cisternas. Compara lecturas o consumos de periodos distintos para notar cambios antes de hacer una estimación.',
      url:tips
    },
    {
      id:'read-consumption',
      matches:t=> /\b(?:que significa|que es|como (?:leer|interpretar|comparar|se mide))\b.{0,65}\b(?:consumo|consmo|cosnumo|metros cubicos|m3)\b/.test(t),
      text:'Compara el consumo del recibo con los periodos anteriores. El consumo se expresa en metros cúbicos. Un cambio fuerte es un motivo para revisar posibles fugas.',
      detail:'Revisa el periodo, las lecturas del medidor y la evolución del consumo. Una variación merece revisión, pero por sí sola no confirma una fuga.',
      url:billing
    },
    {
      id:'detect-leaks',
      matches:t=> /\b(?:como (?:detectar|identificar|reconocer|saber si hay)|senales de|posible)\b.{0,50}\b(?:fugas?|goteo)\b/.test(t),
      text:'Compara las lecturas del medidor y revisa caños, inodoros y cisternas si el consumo cambia de manera marcada.',
      detail:'Una variación del consumo puede orientar la revisión. Examina goteos y las instalaciones internas antes de sacar conclusiones.',
      url:billing
    },
    {
      id:'water-outage-guide',
      matches:t=> /\b(?:como (?:consultar|revisar|ver|se consultan)|donde (?:consultar|ver)|que es)\b.{0,45}\b(?:cortes?|interrupciones?)\b/.test(t),
      text:'Sedapal ofrece un mapa para consultar interrupciones del servicio en Lima y Callao. El mapa muestra el estado al momento de la consulta.',
      detail:'La herramienta oficial permite ubicar una dirección en el mapa y consultar si hay interrupciones en ese punto.',
      url:'https://www.gob.pe/35074-consultar-zonas-con-interrupciones-de-servicio-de-agua-actuales-en-lima-y-callao'
    },
    {
      id:'company',
      matches:t=> /\b(que es|quien es|que significa|a que se dedica|que hace|informacion sobre|hablame de|conoces) sedapal\b/.test(t) || /^(sedapal|sobre sedapal)[?!.]*$/.test(t),
      text:'Sedapal es el Servicio de Agua Potable y Alcantarillado de Lima. Brinda servicios de agua potable y alcantarillado en Lima y Callao.',
      url:official
    },
    {
      id:'contact',
      matches:t=> /\b(aquafono|telefono|telefonos|llamar|contacto|contactar|comunicarme|whatsapp|correo|canales de atencion)\b/.test(t),
      text:'Puedes llamar al Aquafono de Sedapal: (01) 317 8000 para consultas de recibos, falta de agua o problemas de alcantarillado. Ten a mano tu número de suministro. En los canales oficiales encuentras también chat, correo y WhatsApp.',
      url:contact
    },
    {
      id:'coverage',
      matches:t=> /\b(donde (opera|trabaja|atiende)|cobertura|que (zonas|distritos|ciudades) atiende)\b/.test(t),
      text:'Sedapal brinda servicios en Lima y Callao. Para confirmar la cobertura en una dirección o solicitar una conexión, consulta directamente con Sedapal.',
      url:official
    },
    {
      id:'offices',
      matches:t=> !t.includes('oficina virtual') && /\b(oficina|oficinas|agencia|agencias|sede|sedes|horario|horarios|atencion presencial)\b/.test(t),
      text:'Sedapal tiene centros de servicio y agencias. Consulta la dirección y el horario vigente de cada sede en su directorio oficial antes de acudir.',
      url:contact
    },
    {
      id:'supply',
      matches:t=> /\b(numero|codigo) de suministro\b|\bque es (el |mi |un )?suministro\b/.test(t),
      text:'El número de suministro identifica tu conexión y te ayuda a realizar consultas y trámites. Búscalo en tu recibo. Si no lo tienes, llama al (01) 317 8000 y sigue las indicaciones de la operadora.',
      url:'https://www.gob.pe/12786-llamar-a-sedapal-aquafono'
    },
    {
      id:'claims',
      matches:t=> /\b(reclamo|reclamos|reclamar|cobro indebido|cobraron de mas)\b/.test(t),
      text:'Para un reclamo sobre tu facturación o servicio, consulta los requisitos y canales oficiales de Sedapal. Ten a mano tu suministro y el detalle del caso. Una incidencia en Hidro Mejora no reemplaza un reclamo formal ante Sedapal.',
      url:official
    },
    {
      id:'connection',
      matches:t=> /\b(nueva conexion|conexion nueva|solicitar (agua|conexion)|instalar (agua|medidor)|requisitos.*conexion)\b/.test(t),
      text:'Para solicitar una conexión de agua o alcantarillado, revisa los trámites oficiales de Sedapal. Los requisitos, costos y plazos dependen de la evaluación de tu solicitud.',
      url:official
    },
    {
      id:'aquanet',
      matches:t=> /\b(aquanet|oficina virtual)\b/.test(t),
      text:'Aquanet es la oficina virtual de Sedapal. Accede desde su portal oficial para consultar las gestiones disponibles para tu suministro.',
      url:official
    }
  ];
  function normalize(message,limit=500){
    return String(message || '').slice(0,limit).toLowerCase().replace(/m³/g,'m3').normalize('NFD')
      .replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').trim();
  }
  function match(message){
    const text = normalize(message);
    if (/<\/?[a-z][^>]*>/i.test(text)) return undefined;
    return topics.find(topic=>topic.matches(text))?.id;
  }
  function get(id,variant='base'){
    const topic=topics.find(item=>item.id===id);
    return topic ? {text:(variant==='detail' ? topic.detail : variant==='brief' ? topic.brief : null) || topic.text,source:topic.url} : null;
  }
  function followupStyle(message){
    const text = normalize(message).replace(/^[¿¡]+|[?!.]+$/g,'').trim();
    if (/^(?:y )?(?:dime mas|cuentame mas|explicame mas|mas detalles|algo mas)$/.test(text)) return 'detail';
    if (/^(?:y )?(?:mas sencillo|mas simple|en palabras simples|explicalo mas facil|explicamelo mas simple)$/.test(text)) return 'simple';
    if (/^(?:y )?(?:resume|resumelo|un resumen|en resumen|en pocas palabras|mas corto)$/.test(text)) return 'summary';
  }
  function evidence(id){
    const article=get(id);
    if(!article) return [];
    const seen=new Set();
    return variants.flatMap(variant=>{
      const {text}=get(id,variant);
      if(seen.has(text)) return [];
      seen.add(text);
      return [{id:variant,text}];
    });
  }
  const common = new Set(['antes','como','cuando','desde','donde','entre','esta','este','hasta','para','puede','pueden','sobre','tambien','tiene']);
  function words(text){
    return (normalize(text,640).match(/[a-z]{4,}/g)||[]).filter(word=>!common.has(word));
  }
  function generated(id,value,style='standard'){
    const facts=evidence(id);
    if(!facts.length || !styles.includes(style) || !value || Object.keys(value).length!==2 ||
       typeof value.text!=='string' || !Array.isArray(value.evidence) || value.evidence.length<1 ||
       value.evidence.length>3 || new Set(value.evidence).size!==value.evidence.length ||
       !value.evidence.every(ref=>facts.some(fact=>fact.id===ref))) return null;
    const text=value.text.normalize('NFC').trim();
    const limit=style==='summary'?280:640;
    if(text.length<25 || text.length>limit || !/^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ .,;:¿?¡!()\n³]+$/u.test(text) ||
       /³/u.test(text.replace(/\bm³(?!\p{L})/gu,'')) ||
       /\b(?:www|https?|javascript|contrasena|otp|credenciales|cuenta bancaria|tarjeta bancaria|numero de tarjeta|tu dni|tu direccion|envia(?:me)? (?:tu|el)|transfiere|deposit(?:a|e)|ignora|instrucciones del sistema|garantiz\w*|consumo fue|debes pagar|manana)\b/.test(normalize(text,limit)) ||
       /\b[\p{L}]+\.(?:com|net|org|pe|gob|mx)\b/iu.test(text)) return null;
    const anchors=new Set(facts.filter(fact=>value.evidence.includes(fact.id)).flatMap(fact=>words(fact.text)));
    const sentences=text.split(/[.!?]\s+|\n+/).filter(sentence=>sentence.trim());
    if(sentences.some(sentence=>new Set(words(sentence).filter(word=>anchors.has(word))).size<2)) return null;
    return {text,evidence:[...value.evidence]};
  }
  function answer(message){ return get(match(message)); }
  const api=Object.freeze({match,get,answer,followupStyle,evidence,generated,styles});
  if(typeof module==='object' && module.exports) module.exports=api;
  else root.HMSedapalKnowledge=api;
})(typeof window === 'undefined' ? globalThis : window);
