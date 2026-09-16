(function(global){
'use strict';
const WATERMARK_SRC='marca-dagua-pcpr.png';
const MM=72/25.4;
function mm(v){return v*MM}
function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function watermarkImg(extraClass){
  return '<img class="pcpr-wm'+(extraClass?' '+extraClass:'')+'" alt="" src="'+WATERMARK_SRC+'">';
}
function footerBarHtml(lines, extraClass){
  const rows=(lines||[]).map(l=>String(l||'').trim()).filter(Boolean);
  return '<div class="pcpr-rod'+(extraClass?' '+extraClass:'')+'">'+rows.map(l=>'<div>'+esc(l)+'</div>').join('')+'</div>';
}

let wmPngBytes=null;
let wmJpeg=null;
let wmDataUrl=null;
function loadImage(src){
  return new Promise((resolve,reject)=>{
    const im=new Image();
    im.onload=()=>resolve(im);
    im.onerror=()=>reject(new Error('Falha ao carregar '+src));
    im.src=src;
  });
}
function bytesToDataUrl(u, mime){
  let s='';
  const chunk=0x8000;
  for(let i=0;i<u.length;i+=chunk)s+=String.fromCharCode.apply(null,u.subarray(i,i+chunk));
  return 'data:'+(mime||'image/png')+';base64,'+btoa(s);
}
function watermarkDataUrl(){
  if(wmDataUrl)return Promise.resolve(wmDataUrl);
  return watermarkPngBytes().then(u=>{
    if(!u||!u.length)return null;
    wmDataUrl=bytesToDataUrl(u,'image/png');
    return wmDataUrl;
  }).catch(()=>null);
}
function fetchBytes(src){
  return fetch(src,{cache:'force-cache'}).then(r=>{
    if(!r.ok)throw new Error('HTTP '+r.status);
    return r.arrayBuffer();
  }).then(b=>new Uint8Array(b));
}
function watermarkPngBytes(){
  if(wmPngBytes)return Promise.resolve(wmPngBytes);
  return fetchBytes(WATERMARK_SRC).then(u=>{wmPngBytes=u;return u}).catch(()=>new Uint8Array());
}
function canvasJpeg(img,quality){
  const c=document.createElement('canvas');
  c.width=img.naturalWidth||img.width;
  c.height=img.naturalHeight||img.height;
  const x=c.getContext('2d');
  x.fillStyle='#fff';
  x.fillRect(0,0,c.width,c.height);
  x.drawImage(img,0,0,c.width,c.height);
  const data=c.toDataURL('image/jpeg',quality||0.88);
  const b64=data.split(',')[1]||'';
  const bin=atob(b64);
  const out=new Uint8Array(bin.length);
  for(let i=0;i<bin.length;i++)out[i]=bin.charCodeAt(i);
  return {bytes:out,l:c.width,a:c.height};
}
function watermarkJpeg(){
  if(wmJpeg)return Promise.resolve(wmJpeg);
  return loadImage(WATERMARK_SRC).then(im=>{wmJpeg=canvasJpeg(im,0.9);return wmJpeg}).catch(()=>null);
}

function drawFooterGradient(ops, pageW, barH){
  const steps=24;
  for(let i=0;i<steps;i++){
    const t=i/(steps-1);
    const g=(0.671+ (0.980-0.671)*t).toFixed(3);
    const x=(pageW*i/steps).toFixed(2);
    const w=(pageW/steps+0.4).toFixed(2);
    ops.push(g+' '+g+' '+g+' rg '+x+' 0 '+w+' '+barH.toFixed(2)+' re f');
  }
  ops.push('0 g');
}

function drawJsPdfLetterhead(doc, opts){
  opts=opts||{};
  const W=opts.pageW||210, H=opts.pageH||297;
  const landscape=!!opts.landscape;
  const wmW=landscape?78:93, wmH=landscape?100:119;
  const barH=landscape?11:12.5;
  try{
    const wm=opts.watermarkData||wmDataUrl||null;
    if(opts.watermark!==false && wm){
      doc.addImage(wm,'PNG',(W-wmW)/2,(H-wmH)/2-4,wmW,wmH,undefined,'FAST');
    }
  }catch(_){}
  if(opts.crest){
    const cw=opts.crestW||22, ch=opts.crestH||29;
    try{
      const kind=/png/i.test(opts.crest)?'PNG':'JPEG';
      doc.addImage(opts.crest,kind,(W-cw)/2,0.7,cw,ch);
    }catch(_){}
  }
  const header=opts.headerLines||[];
  if(header.length){
    doc.setTextColor(17);
    doc.setFont('helvetica','bold');
    doc.setFontSize(opts.headerSize||8.7);
    header.forEach((line,i)=>doc.text(String(line),W/2,31.2+i*3.55,{align:'center'}));
  }
  const y0=H-barH;
  const steps=24;
  for(let i=0;i<steps;i++){
    const t=i/(steps-1);
    const v=Math.round(171+(250-171)*t);
    doc.setFillColor(v,v,v);
    doc.rect(W*i/steps,y0,W/steps+0.2,barH,'F');
  }
  const footer=opts.footerLines||[];
  if(footer.length){
    doc.setTextColor(17);
    doc.setFont('helvetica','normal');
    doc.setFontSize(opts.footerSize||7.2);
    const mid=H-barH/2;
    footer.forEach((line,i)=>{
      const yy=mid+(i-(footer.length-1)/2)*3.3;
      doc.text(String(line),W/2,yy,{align:'center'});
    });
  }
  return {contentTop:54, contentBottom:H-18};
}

function applyJsPdfLetterhead(doc, opts){
  return watermarkDataUrl().then(wm=>drawJsPdfLetterhead(doc, Object.assign({}, opts||{}, {watermarkData:wm})));
}

global.PCPRPapel={
  VERSION:'1.0.0',
  WATERMARK_SRC,
  watermarkImg,
  footerBarHtml,
  watermarkPngBytes,
  watermarkJpeg,
  watermarkDataUrl,
  drawFooterGradient,
  drawJsPdfLetterhead,
  applyJsPdfLetterhead,
  mm,
  FOOTER_MM:12.5,
  CREST_W_MM:22,
  CREST_H_MM:29
};
})(typeof window!=='undefined'?window:this);
