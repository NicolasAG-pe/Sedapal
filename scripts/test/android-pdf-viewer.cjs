'use strict';
const{PNG}=require('../../Backend/node_modules/pngjs');
// Google Viewer puede demorar la extracción accesible del texto hasta una segunda
// apertura. Verificar página/archivo y píxeles renderizados; no confundir arranque
// negro ni la disponibilidad de extracción con el contenido visual del PDF.
module.exports=async function({android,until,fileName,capture}){
 await until(()=>{try{
  android('shell','uiautomator','dump','/sdcard/hm-pdf-content.xml');
  const xml=android('shell','cat','/sdcard/hm-pdf-content.xml');
  if(!xml.includes('com.google.android.apps.docs')||!xml.includes(fileName)||(!/content-desc="(?:page|página) 1(?:[^\"]*)"/i.test(xml)&&!xml.includes('HIDRO-MEJORA')))return false;
  const image=PNG.sync.read(capture());let navy=0,paper=0;
  for(let y=Math.floor(image.height*.15);y<image.height*.9;y++)for(let x=10;x<image.width-10;x++){
   const i=(y*image.width+x)*4,r=image.data[i],g=image.data[i+1],b=image.data[i+2];
   if(r>248&&g>248&&b>248)paper++;
   if(Math.abs(r-16)<18&&Math.abs(g-62)<18&&Math.abs(b-96)<18)navy++;
  }
  return paper>image.width*image.height*.15&&navy>50;
 }catch(_){return false;}},'página PDF renderizada en el visor Android');
};
