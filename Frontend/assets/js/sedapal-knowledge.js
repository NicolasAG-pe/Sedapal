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
  const topics = [
    {
      id:'read-receipt',
      matches:t=> /\b(?:explicame|explica|entender|leer|interpretar|que significa|que es)\b.{0,75}\b(?:recibo|recivo|factura|boleta|vencimiento|cargo fijo|alcantarillado)\b/.test(t)
        && !/\b(?:cuanto|cuando|a que hora)\b/.test(t),
      text:'En el recibo, revisa el periodo, el consumo registrado en m³, el importe y la fecha límite de pago. El consumo y el importe se expresan en unidades distintas. En Hidro-Mejora puedes abrir el detalle para ver los valores registrados.',
      brief:'Revisa cuatro campos del recibo: periodo, consumo en m³, importe y fecha de vencimiento.',
      detail:'El periodo indica a qué facturación corresponde el recibo. La fecha de vencimiento indica hasta cuándo se puede pagar dentro del plazo. Para fechas e importes concretos, consulta el detalle del recibo.',
      url:billing
    },
    {
      id:'saving',
      matches:t=> /\b(?:ahorrar|ahorro|cuidar|cuidado|desperdiciar|reducir|gastar menos)\b.*\b(?:agua|consumo)\b|\bconsejos\b.*\b(?:consumo|agua)\b/.test(t),
      text:'Para cuidar el agua, cierra el caño al cepillarte, toma duchas cortas y revisa posibles fugas en caños e inodoros. En Inicio puedes comparar tu consumo para detectar cambios.',
      brief:'Cierra el caño cuando no lo uses, acorta las duchas y revisa fugas.',
      detail:'Presta atención a goteos y fugas en caños, inodoros y cisternas. Compara lecturas o consumos de periodos distintos para notar cambios antes de hacer una estimación.',
      url:tips
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
  function match(message){
    const text = String(message || '').slice(0,500).toLowerCase().normalize('NFD')
      .replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').trim();
    if (/<\/?[a-z][^>]*>/i.test(text)) return undefined;
    return topics.find(topic=>topic.matches(text))?.id;
  }
  function get(id,variant='base'){
    const topic=topics.find(item=>item.id===id);
    return topic ? {text:(variant==='detail' ? topic.detail : variant==='brief' ? topic.brief : null) || topic.text,source:topic.url} : null;
  }
  function answer(message){ return get(match(message)); }
  const api=Object.freeze({match,get,answer});
  if(typeof module==='object' && module.exports) module.exports=api;
  else root.HMSedapalKnowledge=api;
})(typeof window === 'undefined' ? globalThis : window);
