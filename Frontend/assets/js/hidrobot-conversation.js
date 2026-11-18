/* Consultas locales sobre datos ya autorizados. El motor devuelve texto y acciones de lectura. */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.HMHidroBot = api;
})(globalThis, function () {
  'use strict';

  const months = 'enero febrero marzo abril mayo junio julio agosto septiembre octubre noviembre diciembre'.split(' ');
  const categories = {
    receipt: ['recibo', 'factura', 'boleta', 'consumo', 'consumi', 'consumimos', 'consumido', 'consumir', 'cubicos', 'metros', 'm3', 'saldo', 'deuda', 'vencimiento', 'vence', 'vencen', 'vencido'],
    payments: ['pago', 'abono', 'operacion', 'transaccion'],
    cuts: ['corte', 'interrupcion', 'mantenimiento', 'suspension', 'restriccion'],
    incidents: ['incidencia', 'incidente', 'reporte', 'averia', 'falla', 'reportado']
  };
  const aliases = {
    recibos:'recibo', facturas:'factura', boletas:'boleta', consumos:'consumo', consumia:'consumi',
    pagos:'pago', abonos:'abono', operaciones:'operacion', transacciones:'transaccion',
    cortes:'corte', interrupciones:'interrupcion', incidencias:'incidencia', reportes:'reporte',
    incidentes:'incidente', averias:'averia', fallas:'falla', setiembre:'septiembre',
    recivo:'recibo', recivos:'recibo', voleta:'boleta', cosnuno:'consumo', cosnumo:'consumo', consmo:'consumo', concumo:'consumo',
    pague:'pagado', pagados:'pagado', pagadas:'pagado', coste:'precio', pendientes:'pendiente', vencidos:'vencido'
  };
  const known = new Set([...Object.values(categories).flat(), ...months, 'pendiente', 'pagado', 'promedio', 'comparar']);
  const temporalWords = new Set(['pasado','pasada','presente','actual','previo','anterior','siguiente','proximo']);
  function normalize(text) {
    return String(text || '').slice(0, 500).toLowerCase().replace(/m³/g, 'm3')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }

  function oneEdit(a, b) {
    if (Math.abs(a.length - b.length) > 1) return false;
    if (a.length > b.length) return oneEdit(b, a);
    let i = 0;
    while (i < a.length && a[i] === b[i]) i++;
    if (a.length !== b.length) return a.slice(i) === b.slice(i + 1);
    return a.slice(i + 1) === b.slice(i + 1) ||
      (a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2));
  }
  function token(word) {
    if (Object.hasOwn(aliases, word)) return aliases[word];
    if (known.has(word) || temporalWords.has(word) || !/^[a-z]{5,}$/.test(word)) return word;
    // Un único candidato a distancia de edición 1. Los verbos y nombres cortos se dejan intactos.
    const matches = [...known].filter(candidate => candidate.length >= 5 && candidate[0] === word[0] && oneEdit(word, candidate));
    return matches.length === 1 ? matches[0] : word;
  }

  function extract(message, remembered) {
    const raw = normalize(message);
    if (/<\/?[a-z][^>]*>/i.test(raw)) return {kind:'clarify'};
    const words = (raw.match(/[a-z0-9]+/g) || []).map(token);
    const text = words.join(' ');
    const has = (...terms) => terms.some(term => words.includes(term));
    const like = expression => expression.test(text);
    const emergency = like(/\b(?:no (?:tengo|hay|sale) agua|sin agua|falta (?:de )?agua|baja presion|poca presion|fuga|aniego|tuberia rota|rotura de tuberia)\b/);
    const general = like(/\b(?:que es|a que se dedica|donde atiende|telefono|contacto|canales|oficina virtual|oficinas|nueva conexion|ahorrar agua|aquanet|reclamo)\b/);
    if (emergency) return {kind:'fallback'};
    if (general && !like(/\b(?:mi|mis|debo|consumi|comparar)\b/)) return {kind:'fallback'};
    if (like(/\b(?:reportar|registrar|crear|abrir formulario)\b/) && has('incidencia','incidente','reporte','falla'))
      return {kind:'fallback'};
    if (like(/\b(?:quiero pagar|como pago|como pagar|donde pago|pagar mi|pagar el|cancelar mi|descargar|duplicado|copia|pdf)\b/))
      return {kind:'fallback'};
    if (like(/\b(?:mi perfil|mis datos|mi cuenta|ajustes de cuenta|cambiar mis datos)\b/))
      return {kind:'navigate', section:'perfil'};
    if (like(/\b(?:atencion al cliente|mesa de ayuda|necesito ayuda|soporte)\b/)) return {kind:'fallback'};

    const usage = has('consumo','consumi','consumimos','consumido','consumir','cubicos','m3') ||
      like(/\b(?:cuanto|cuanta|cuantos) (?:\w+ ){0,4}(?:(?:use|usamos|gaste|gastamos) (?:de )?agua|agua (?:use|usamos|gaste|gastamos))\b/);
    const amount = like(/\b(?:cuanto (?:me )?(?:costo|cuesta|sale|salio|vino|llego)|cuanto (?:es|fue) (?:mi|el|del) (?:recibo|factura|boleta)|importe|monto|precio)\b/);
    const due = has('vence','vencen','vencimiento','caduca') ||
      like(/\b(?:hasta cuando puedo pagar|fecha (?:limite|de pago)|que dia (?:se )?vence)\b/);
    const detail = like(/\b(?:muestramelo|ensenamelo|muestra(?:me)?(?: el)? detalle|abrelo|ver detalle|donde lo veo)\b/);
    const pending = has('pendiente','vencido','deuda','saldo','debo','adeudo') || like(/\b(?:sin pagar|me falta pagar|me toca pagar)\b/);
    const paid = has('pagado','abonado','cancelado') || like(/\bya (?:lo |los )?pague\b/);
    const average = has('promedio','media');
    const compare = has('comparar','compara','comparacion','diferencia','versus','vs') ||
      (usage && like(/\b(?:mas|menos) que\b/));
    const times = [];
    for (const match of text.matchAll(/\b(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)(?: (?:de |del )?(\d{4}))?\b/g)) {
      times.push({month:months.indexOf(match[1])+1,year:match[2]});
    }
    for (const match of raw.matchAll(/\b(\d{4})-(0[1-9]|1[0-2])\b/g)) times.push({month:Number(match[2]),year:match[1]});
    if (like(/\b(?:este mes|mes en curso)\b/)) times.push({relative:0});
    if (like(/\b(?:mes (?:pasado|anterior)|hace un mes)\b/)) times.push({relative:-1});
    if (like(/\bhace (?:dos|2) meses\b/)) times.push({relative:-2});

    const groups = Object.entries(categories).filter(([,terms]) => has(...terms)).map(([group]) => group);
    if (usage || (times.length && (amount || due || average || compare))) groups.push('receipt');
    const topics = [...new Set(groups)];
    // «Recibos pagados» y «hasta cuándo puedo pagar un recibo» pertenecen a facturación.
    if ((paid || due || pending) && topics.includes('receipt') && topics.includes('payments')) topics.splice(topics.indexOf('payments'),1);
    if (topics.length > 1) return {kind:'clarify'};
    const topic = topics[0];
    if (topic === 'cuts' || (!topic && like(/\b(?:cuando (?:vuelve|regresa) el agua|cuando (?:termina|acaba) el corte)\b/)))
      return {kind:'cuts', ending:like(/\b(?:cuando|hasta|hora|termina|acaba|regresa|vuelve)\b/)};
    if (topic === 'incidents') return {kind:'incidents', code:raw.match(/\b(?:inc|i)-?(\d+)\b/i)?.[1]};
    if (topic === 'payments' && !paid && !pending && !due) return {kind:'payments', code:has('codigo'), latest:has('ultimo','reciente')};
    if (topic === 'payments' && paid && !pending) return {kind:'payments', latest:true, code:false};
    if (pending && paid) return {kind:'clarify'};
    if (topic === 'receipt' || usage || average || compare || pending || paid || due ||
        (remembered && (amount || detail || like(/\b(?:y su (?:monto|importe|fecha)|y cuando vence)\b/)))) {
      const byReference = Boolean(remembered && !times.length && (amount || detail || due) && !usage
        && !has('recibo','factura','boleta','proximo','siguiente'));
      if (average && times.length) return {kind:'clarify'};
      if (pending && !usage && !due && !amount) return {kind:'pending'};
      if (paid && !usage && !due && !amount) return {kind:'paid'};
      if (due && !byReference && !times.length && !like(/\b(?:ultimo|reciente)\b/)) return {kind:'next_due',future:has('proximo','siguiente')};
      if (!byReference && !times.length && !usage && !amount && !detail && !due && !average && !compare &&
          !has('ultimo','ultima','reciente','actual','este')) return {kind:'navigate',section:'historial'};
      return {kind:compare ? 'compare' : average ? 'average' : usage ? 'consumption' : amount ? 'amount' : due ? 'due' : detail ? 'detail' : 'receipt', times, byReference};
    }
    if (amount || detail || like(/\b(?:cuanto|estado|actual|el mismo)\b/) && words.length <= 4) return {kind:'clarify'};
    return {kind:'fallback'};
  }

  const valid = value => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));
  const number = value => Number(value).toString();
  const money = value => 'S/ ' + (Math.round(Number(value) * 100) / 100).toFixed(2);
  const moneyTotal = rows => money(rows.reduce((sum, row) => sum + Math.round(Number(row.monto) * 100), 0) / 100);
  const consumption = row => row.hayConsumo !== false && valid(row.consumoM3);
  const hasAmount = row => row.hayMonto !== false && valid(row.monto);
  const pendingReceipt = row => ['Emitido','Pendiente','Vencido'].includes(row.estado);
  const isoMonth = value => /^(\d{4})-(0[1-9]|1[0-2])(?=-\d{2})/.exec(value || '');
  const go = (section,label) => ({kind:'section',section,label});
  const receiptsAction = go('historial','Ver recibos');
  const usageAction = go('inicio','Ver gráfico de consumo');
  const topicsClarification = () => ({
    text:'¿Te refieres a un recibo, al consumo, a un pago, a un corte o a una incidencia?',
    actions:[
      {kind:'ask',message:'Último recibo',label:'Último recibo'},
      {kind:'ask',message:'Consultar consumo',label:'Consumo'},
      {kind:'ask',message:'Mis incidentes',label:'Incidencias'}
    ]
  });
  function result(text, ...actions) { return {text,actions}; }

  function selectMonth(rows, spec, now) {
    if (spec.relative !== undefined) {
      const p = new Intl.DateTimeFormat('es-PE',{year:'numeric',month:'numeric',timeZone:'America/Lima'}).formatToParts(now);
      const month = Number(p.find(x=>x.type==='month').value);
      const year = Number(p.find(x=>x.type==='year').value);
      const date = new Date(Date.UTC(year,month-1+spec.relative,1));
      spec = {month:date.getUTCMonth()+1,year:String(date.getUTCFullYear())};
    }
    return rows.filter(row => {
      const period=normalize(row.periodo || row.etiqueta);
      const year=period.match(/\b\d{4}\b/)?.[0];
      const numeric=period.match(/\b(\d{4})-(0[1-9]|1[0-2])\b/);
      const month=(period.match(/[a-z]+/g)||[]).map(token).find(word=>months.includes(word));
      const issued=isoMonth(row.fechaEmisionISO);
      const actualMonth=numeric ? Number(numeric[2]) : month ? months.indexOf(month)+1 : Number(issued?.[2]);
      const actualYear=year || issued?.[1];
      return actualMonth===spec.month && (!spec.year || actualYear===spec.year);
    });
  }

  function createConversation({clock=()=>Date.now(), ttl=5*60*1000}={}) {
    let owner, remembered, expires;
    function reset() { owner=undefined; remembered=undefined; expires=0; }

    function answer(message, data, session) {
      if (session == null) { reset(); return null; }
      if (owner !== session || clock() >= expires) { reset(); owner=session; }
      const intent = extract(message,remembered);
      if (!['fallback','clarify','receipt','amount','consumption','due','detail','next_due'].includes(intent.kind)) remembered=undefined;
      if (intent.kind === 'fallback') return null;
      if (intent.kind === 'clarify') return topicsClarification();
      if (intent.kind === 'navigate') return intent.section === 'perfil'
        ? result('En Mi cuenta puedes consultar los datos de tu perfil.',go('perfil','Ir a Mi cuenta'))
        : result('En Recibos puedes ver estados, detalles y descargar el PDF.',receiptsAction);

      const unavailable = (domain, label, action) => data.online === false || data.errors?.[domain]
        ? result('No pude verificar '+label+' en este momento. Vuelve a intentarlo cuando se restablezca la conexión.',action) : null;
      if (intent.kind === 'incidents') {
        const action=go('incidencias','Ver incidencias');
        const failure=unavailable('incidents','tus incidencias',action);
        if (failure) return failure;
        const list=data.incidents;
        const match=intent.code ? list.find(i=>String(i.id)===intent.code || /\d+$/.exec(i.code||'')?.[0]===intent.code) : list[0];
        if (!match) return result(list.length ? 'No encontré ese número de incidencia en tu suministro.' : 'No hay incidencias registradas para tu suministro.',action);
        const heading=intent.code ? 'Incidencia' : 'La más reciente de '+list.length;
        return result(heading+' · '+[match.code,match.tipo,match.estado].filter(Boolean).join(' · ')+'.',action);
      }
      if (intent.kind === 'cuts') {
        const action=go('cortes','Ver cortes');
        const failure=unavailable('cuts','los cortes de tu suministro',action);
        if (failure) return failure;
        const list=data.cuts.filter(c=>['Programado','En proceso','Activo'].includes(c.estado));
        if (!list.length) return result('No hay cortes activos o programados para tu suministro en los avisos disponibles.',action);
        if (intent.ending) {
          const active=list.filter(c=>c.estado!=='Programado');
          const target=(active.length ? active : list).filter(c=>Number.isFinite(Date.parse(c.fechaFinISO)))
            .sort((a,b)=>Date.parse(a.fechaFinISO)-Date.parse(b.fechaFinISO))[0];
          return result(target
            ? 'El próximo fin previsto es el '+new Intl.DateTimeFormat('es-PE',{dateStyle:'short',timeStyle:'short',timeZone:'America/Lima'}).format(new Date(target.fechaFinISO))+'.'
            : 'El aviso disponible no indica cuándo termina el corte.',action);
        }
        const summary=list.slice(0,2).map(c=>[c.estado,c.fecha].filter(Boolean).join(' · ')).join('; ');
        return result('Avisos para tu suministro ('+list.length+'): '+summary+'.',action);
      }
      if (intent.kind === 'payments') {
        const action=go('pagos','Ver historial de pagos');
        const failure=unavailable('payments','tus pagos',action);
        if (failure) return failure;
        const rows=data.payments;
        if (!rows.length) return result('Aún no hay pagos registrados para tu suministro.',action);
        const recent=rows[0];
        if (intent.code) return result(recent.codigo && recent.codigo!=='—' ? 'El código del pago más reciente es '+recent.codigo+'.' : 'El pago más reciente no tiene un código registrado.',action);
        if (intent.latest) return result('Pago más reciente: '+[valid(recent.monto)?money(recent.monto):null,recent.periodo,recent.fecha].filter(Boolean).join(' · ')+'.',action);
        return result(rows.length===1 ? 'Hay un pago registrado.' : 'Hay '+rows.length+' pagos registrados.',action);
      }

      const failure=unavailable('receipts','los recibos y consumos de tu suministro',receiptsAction);
      if (failure) return failure;
      const rows=data.receipts.filter(r=>r.estado!=='Anulado');
      if (intent.kind==='pending' || intent.kind==='paid') {
        const isPending=intent.kind==='pending';
        const selected=rows.filter(isPending ? pendingReceipt : r=>r.estado==='Pagado');
        if (!selected.length) return result(isPending ? 'No tienes recibos pendientes o vencidos.' : 'No figuran recibos pagados.',receiptsAction);
        const label=isPending
          ? (selected.length===1 ? 'recibo por pagar' : 'recibos por pagar')
          : (selected.length===1 ? 'recibo pagado' : 'recibos pagados');
        const total=selected.every(hasAmount) ? ' por '+moneyTotal(selected) : '. Faltan importes para calcular el total';
        return result('Tienes '+selected.length+' '+label+total+'.',receiptsAction);
      }
      if (intent.kind==='average') {
        const recent=rows.slice(0,6);
        if (!recent.length || !recent.every(consumption))
          return result('Faltan datos de consumo para calcular el promedio reciente.',usageAction);
        const mean=recent.reduce((sum,r)=>sum+Number(r.consumoM3),0)/recent.length;
        return result('El promedio de '+recent.length+(recent.length===1 ? ' recibo vigente es ' : ' recibos vigentes es ')+number(Number(mean.toFixed(2)))+' m³.',usageAction);
      }
      if (intent.kind==='next_due') {
        const due=rows.filter(r=>pendingReceipt(r)&&isoMonth(r.fechaVencimientoISO)).slice()
          .sort((a,b)=>a.fechaVencimientoISO.localeCompare(b.fechaVencimientoISO));
        if (!due.length) return result('No hay fechas de vencimiento disponibles en tus recibos por pagar.',receiptsAction);
        const parts = new Intl.DateTimeFormat('en-CA',{
          year:'numeric', month:'2-digit', day:'2-digit', timeZone:'America/Lima'
        }).formatToParts(new Date(clock()));
        const fields = Object.fromEntries(parts.map(({type,value})=>[type,value]));
        const today = fields.year+'-'+fields.month+'-'+fields.day;
        const next = intent.future ? due.find(row=>row.fechaVencimientoISO.slice(0,10)>=today) : due[0];
        if (!next) return result('Las fechas registradas de tus recibos por pagar ya pasaron.',receiptsAction);
        remember(next);
        const label = intent.future ? 'El próximo vencimiento es ' : 'La primera fecha de vencimiento pendiente es ';
        return result(label+next.vencimiento+' ('+next.etiqueta+').',detailAction(next),receiptsAction);
      }
      const times=intent.times || [];
      const requested=times.map(spec=>selectMonth(rows,spec,new Date(clock())));
      if (requested.some(matches=>matches.length!==1))
        return result(requested.some(matches=>matches.length>1)
          ? 'Hay más de un recibo para ese mes. Dime el mes y el año, o elige el recibo en el historial.'
          : 'No encontré un recibo vigente para ese periodo.',receiptsAction);
      if (intent.kind==='compare') {
        if (requested.length===1 || requested.length>2)
          return result('¿Qué dos periodos quieres comparar? Puedes indicar mes y año.',usageAction);
        const [first,second]=requested.length ? requested.map(matches=>matches[0]) : rows;
        if (!first || !second || first.id_recibo===second.id_recibo || !consumption(first) || !consumption(second))
          return result('Necesito dos recibos vigentes distintos con datos de consumo para hacer la comparación.',usageAction);
        const delta=number(Number(Math.abs(Number(first.consumoM3)-Number(second.consumoM3)).toFixed(4)));
        return result(first.etiqueta+': '+number(first.consumoM3)+' m³. '+second.etiqueta+': '+number(second.consumoM3)+' m³. Diferencia: '+delta+' m³.',usageAction);
      }
      if (requested.length>1) return result('¿Cuál de esos periodos quieres consultar?',receiptsAction);
      const row=intent.byReference ? rows.find(r=>String(r.id_recibo)===remembered) : (requested[0]?.[0] || rows[0]);
      if (!row) {
        if (intent.byReference) { remembered=undefined; return result('Ese recibo ya no está vigente. Puedes consultar el historial o elegir otro periodo.',receiptsAction); }
        return result(intent.kind==='consumption' ? 'Aún no hay información de consumo disponible para tu suministro.' : 'Aún no hay recibos vigentes para tu suministro.',receiptsAction);
      }
      remember(row);
      const detail=detailAction(row);
      if (intent.kind==='consumption') return result(consumption(row)
        ? (requested.length ? 'El consumo registrado fue de ' : 'Tu último consumo registrado es de ')+number(row.consumoM3)+' m³ ('+row.etiqueta+').'
        : 'No hay consumo registrado para '+row.etiqueta+'.',usageAction,detail);
      if (intent.kind==='amount') return result(hasAmount(row) ? 'El importe de '+row.etiqueta+' es '+money(row.monto)+'.' : 'El importe de '+row.etiqueta+' no está disponible.',detail);
      if (intent.kind==='due') return result(isoMonth(row.fechaVencimientoISO) ? 'El recibo de '+row.etiqueta+' tiene fecha de vencimiento '+row.vencimiento+'.' : 'No hay fecha de vencimiento disponible para '+row.etiqueta+'.',detail);
      if (intent.kind==='detail') return result('Puedes abrir el recibo de '+row.etiqueta+'.',detail);
      return result([row.etiqueta, hasAmount(row)?money(row.monto):'importe no disponible', row.estado, consumption(row)?number(row.consumoM3)+' m³':null].filter(Boolean).join(' · ')+'.',detail,receiptsAction);
    }

    function remember(row) { remembered=String(row.id_recibo); expires=clock()+ttl; }
    function detailAction(row) { return {kind:'receipt',id:String(row.id_recibo),label:'Ver detalle del recibo'}; }
    return {answer,reset};
  }

  return {createConversation};
});
