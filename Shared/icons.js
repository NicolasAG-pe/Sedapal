/* Iconos propios de trazo uniforme. Sin fuentes ni recursos remotos. */
(function(global){
  'use strict';
  const paths={
    close:'M6 6l12 12M6 18 18 6',
    home:'M3 10 12 3l9 7v10H3V10M9 20v-7h6v7',
    receipt:'M6 3h9l4 4v14H6V3M14 3v5h5M9 12h7M9 16h7',
    payment:'M3 6h18v13H3V6M3 10h18M7 15h4',
    incident:'M12 3 2 21h20L12 3M12 9v5M12 17h.01',
    cut:'M7 3v5m10-5v5M5 8h14v4H5V8M12 12v9M4 21 20 3',
    user:'M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0M4 21v-2a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v2',
    users:'M14 7a3 3 0 1 1-6 0 3 3 0 0 1 6 0M3 21v-3a5 5 0 0 1 5-5h6a5 5 0 0 1 5 5v3M18 4a3 3 0 0 1 0 6M21 21v-3a5 5 0 0 0-3-4.6',
    bell:'M18 9a6 6 0 0 0-12 0c0 6-3 7-3 7h18s-3-1-3-7M10 20h4',
    help:'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0M9 9a3 3 0 0 1 6 0c0 2-3 2-3 4M12 17h.01',
    support:'M4 13v-1a8 8 0 0 1 16 0v1M3 12h4v6H3v-6M17 12h4v6h-4v-6M19 18v2h-7',
    search:'M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0M15 15l6 6',
    filter:'M3 4h18l-7 8v7l-4 2v-9L3 4',
    edit:'m15 4 5 5M4 20l5-1L21 7l-4-4L5 15l-1 5',
    cancel:'M3 7h18M9 7V4h6v3M6 7l1 14h10l1-14M10 11v6M14 11v6',
    photo:'M3 7h4l2-3h6l2 3h4v13H3V7M16 13a4 4 0 1 1-8 0 4 4 0 0 1 8 0',
    eye:'M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0',
    arrow:'M5 12h14m-5-5 5 5-5 5',
    download:'M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5',
    chart:'M4 20V10m6 10V4m6 16v-8M2 20h20',
    check:'m5 12 4 4L19 6',
    lock:'M5 10h14v11H5V10M8 10V6a4 4 0 0 1 8 0v4',
    clock:'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0M12 7v5l3 2',
    logout:'M9 4H4v16h5M9 12h12m-5-5 5 5-5 5',
    grid:'M3 3h7v7H3V3M14 3h7v7h-7V3M3 14h7v7H3v-7M14 14h7v7h-7v-7',
    water:'M12 3c-2 4-7 8-7 12a7 7 0 0 0 14 0c0-4-5-8-7-12M8 15c0 2 2 4 4 4'
  };
  function icon(name){
    const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
    Object.entries({viewBox:'0 0 24 24',fill:'none',stroke:'currentColor','stroke-width':'1.8','stroke-linecap':'round','stroke-linejoin':'round','aria-hidden':'true',focusable:'false',class:'hm-icon'}).forEach(([k,v])=>svg.setAttribute(k,v));
    const p=document.createElementNS(svg.namespaceURI,'path');p.setAttribute('d',paths[name]||paths.water);svg.append(p);return svg;
  }
  function decorate(root=document){
    root.querySelectorAll('[data-icon]').forEach(el=>{
      const old=el.querySelector('svg');if(old)old.replaceWith(icon(el.dataset.icon));else el.prepend(icon(el.dataset.icon));
    });
    root.querySelectorAll('svg[stroke="currentColor"]').forEach(svg=>{
      svg.setAttribute('stroke-width','1.8');svg.setAttribute('stroke-linecap','round');svg.setAttribute('stroke-linejoin','round');
    });
  }
  global.HMShared=global.HMShared||{};global.HMShared.icons={icon,decorate};decorate();
})(window);
