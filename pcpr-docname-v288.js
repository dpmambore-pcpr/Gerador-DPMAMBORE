(function(global){
'use strict';
const VERSION='2.8.8';
const cfg=(global.PCPR_DOCNAME_CONFIG&&typeof global.PCPR_DOCNAME_CONFIG==='object')?global.PCPR_DOCNAME_CONFIG:{};
const actionSelectors=Array.isArray(cfg.actionSelectors)?cfg.actionSelectors.filter(Boolean):[];
const actionSelector=actionSelectors.join(',');
const cloudSelectors=Array.isArray(cfg.cloudSelectors)?cfg.cloudSelectors.filter(Boolean):[];
const cloudSelector=cloudSelectors.join(',');
let input=null,msg=null,armed=null,originalTitle=document.title;

function clean(v){return String(v??'').trim()}
function stripKnownExtension(v){return clean(v).replace(/\.(?:pdf|odt|docx?|zip|png|jpe?g|html?)$/i,'')}
function safeBase(v){
  return stripKnownExtension(v)
    .replace(/[\\/:*?"<>|]+/g,' - ')
    .replace(/[\u0000-\u001f\u007f]/g,'')
    .replace(/\s+/g,' ')
    .replace(/[. ]+$/g,'')
    .trim();
}
function getBaseName(){return input?safeBase(input.value):''}
function extensionFromName(name,fallback){
  const m=clean(name).match(/\.([A-Za-z0-9]{2,6})$/);return (m?m[1]:fallback||'pdf').toLowerCase();
}
function fileName(ext){const base=getBaseName();return base?(base+'.'+String(ext||'pdf').replace(/^\./,'')):''}
function setMessage(text,isError){
  if(!msg)return;msg.textContent=text||'';msg.style.color=isError?'#9f2f2f':'#47645c';
}
function markInvalid(on){
  if(!input)return;input.style.borderColor=on?'#b93b3b':'#b8b3a9';input.style.boxShadow=on?'0 0 0 3px rgba(185,59,59,.12)':'none';
}
function requireName(showAlert){
  const base=getBaseName();
  if(base){markInvalid(false);setMessage('Nome definido. O formato será acrescentado automaticamente.',false);return base;}
  markInvalid(true);setMessage('Informe o NOME DOC antes de salvar, baixar, imprimir ou enviar para a nuvem.',true);
  try{input?.focus({preventScroll:false});input?.scrollIntoView({behavior:'smooth',block:'center'});}catch(_){input?.focus()}
  if(showAlert!==false)global.alert('Informe o campo NOME DOC antes de salvar ou enviar o documento.');
  return '';
}
function armForDownload(){
  const base=requireName(true);if(!base)return false;
  armed={base,until:Date.now()+120000};
  return true;
}
function managedActionFrom(target){
  if(!actionSelector||!target||!target.closest)return null;
  try{return target.closest(actionSelector)}catch(_){return null}
}
function inferTarget(){
  let el=null;
  if(cfg.targetSelector){try{el=document.querySelector(cfg.targetSelector)}catch(_){}}
  if(!el&&actionSelectors.length){for(const s of actionSelectors){try{el=document.querySelector(s)}catch(_){}if(el)break}}
  return el;
}
function buildField(){
  if(document.getElementById('pcprNomeDoc')){input=document.getElementById('pcprNomeDoc');msg=document.getElementById('pcprNomeDocMsg');return}
  const target=inferTarget();if(!target)return;
  let actions=null;
  if(cfg.placementSelector){try{actions=document.querySelector(cfg.placementSelector)}catch(_){}}
  actions=actions||target.closest('.actions,.row-actions,.previewbar,.toolbar,.small-actions,.preview-actions')||target.parentElement;
  if(!actions||!actions.parentElement)return;
  const box=document.createElement('div');box.id='pcprDocNameBox';
  box.setAttribute('data-pcpr-docname-version',VERSION);
  box.style.cssText='margin:12px 0 10px;padding:12px 14px;border:1px solid #d3cec3;border-left:4px solid #c5a253;border-radius:9px;background:#fbfaf6;box-sizing:border-box;font-family:Arial,Helvetica,sans-serif;';
  box.innerHTML='<label for="pcprNomeDoc" style="display:block;font-weight:900;font-size:12px;letter-spacing:.35px;color:#17202a;margin-bottom:6px">NOME DOC: <span style="color:#9f2f2f">* OBRIGATÓRIO</span></label><input id="pcprNomeDoc" type="text" autocomplete="off" spellcheck="false" placeholder="Digite o nome do documento, sem .pdf ou .odt" style="display:block;width:100%;min-height:42px;padding:9px 11px;border:1px solid #b8b3a9;border-radius:7px;background:#fff;color:#17202a;font-size:14px;font-weight:700;box-sizing:border-box;outline:none"><div id="pcprNomeDocMsg" style="margin-top:6px;font-size:11px;line-height:1.35;color:#626b70">Obrigatório para salvar, baixar, imprimir em PDF ou enviar para a nuvem.</div>';
  actions.parentElement.insertBefore(box,actions);
  input=box.querySelector('#pcprNomeDoc');msg=box.querySelector('#pcprNomeDocMsg');
  input.addEventListener('input',()=>{if(getBaseName()){markInvalid(false);setMessage('Nome definido. O formato será acrescentado automaticamente.',false)}else setMessage('Obrigatório para salvar, baixar, imprimir em PDF ou enviar para a nuvem.',false)});
  input.addEventListener('blur',()=>{if(input.value)input.value=safeBase(input.value)});
}
function patchAnchorClick(){
  const proto=global.HTMLAnchorElement&&global.HTMLAnchorElement.prototype;if(!proto||proto.__pcprDocNamePatched)return;
  const original=proto.click;
  Object.defineProperty(proto,'__pcprDocNamePatched',{value:true,configurable:true});
  proto.click=function(){
    try{
      if(armed&&Date.now()<armed.until&&this.download){
        const ext=extensionFromName(this.download,'pdf');
        this.download=armed.base+'.'+ext;
        setTimeout(()=>{if(armed&&armed.base===getBaseName())armed=null;document.title=originalTitle},0);
      }
    }catch(_){ }
    return original.apply(this,arguments);
  };
}
function patchPrint(){
  if(global.print&&global.print.__pcprDocNamePatched)return;
  const nativePrint=global.print.bind(global);
  function wrappedPrint(){
    const base=requireName(true);if(!base)return;
    const prev=document.title;document.title=base;
    let restored=false;const restore=()=>{if(restored)return;restored=true;document.title=prev||originalTitle;global.removeEventListener('afterprint',restore)};
    global.addEventListener('afterprint',restore,{once:true});
    setTimeout(restore,10000);
    return nativePrint();
  }
  wrappedPrint.__pcprDocNamePatched=true;global.print=wrappedPrint;
}
function patchJsPdf(){
  const api=global.jspdf?.jsPDF?.API;if(!api||!api.save||api.save.__pcprDocNamePatched)return false;
  const original=api.save;
  function wrappedSave(name){
    const base=requireName(true);if(!base)return this;
    const ext=extensionFromName(name,'pdf');
    const result=original.call(this,base+'.'+ext,...Array.prototype.slice.call(arguments,1));setTimeout(()=>{document.title=originalTitle},0);return result;
  }
  wrappedSave.__pcprDocNamePatched=true;api.save=wrappedSave;return true;
}
function patchDrive(){
  const d=global.PCPRDrive;if(!d||d.__pcprDocNamePatched)return false;
  ['uploadPdfForAuthority','uploadElementsPdfForAuthority'].forEach(key=>{
    if(typeof d[key]!=='function')return;
    const original=d[key];
    d[key]=function(options){
      const base=requireName(true);
      if(!base){const e=new Error('Informe o NOME DOC antes de enviar para a nuvem.');e.name='PCPRDocumentNameRequired';return Promise.reject(e)}
      const opts={...(options||{}),fileName:base+'.pdf'};
      return original.call(this,opts);
    };
  });
  d.__pcprDocNamePatched=true;return true;
}
function captureManagedClick(e){
  const action=managedActionFrom(e.target);if(!action)return;
  let isCloud=false;if(cloudSelector&&e.target&&e.target.closest){try{isCloud=!!e.target.closest(cloudSelector)}catch(_){}}
  if(isCloud){
    if(!requireName(true)){e.preventDefault();e.stopPropagation();if(typeof e.stopImmediatePropagation==='function')e.stopImmediatePropagation();return false;}
    return;
  }
  if(!armForDownload()){
    e.preventDefault();e.stopPropagation();if(typeof e.stopImmediatePropagation==='function')e.stopImmediatePropagation();return false;
  }
  // O título é utilizado pelos navegadores como sugestão ao "Salvar como PDF".
  document.title=getBaseName()||originalTitle;
  setTimeout(()=>{if(armed&&Date.now()>=armed.until)document.title=originalTitle},121000);
}
function init(){
  buildField();patchAnchorClick();patchPrint();patchJsPdf();patchDrive();
  document.addEventListener('click',captureManagedClick,true);
  // Algumas bibliotecas (jsPDF/Drive) podem ser carregadas depois do helper.
  let tries=0;const t=setInterval(()=>{tries++;patchJsPdf();patchDrive();if(tries>120)clearInterval(t)},500);
  global.PCPRDocName={VERSION,getBaseName,fileName,requireName,safeBase};
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})(window);
