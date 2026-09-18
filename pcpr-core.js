(function(global){
'use strict';
const VERSION='3.0.0';
const VERSION_DATE='12/09/2026';
const HISTORY_KEY='pcpr.documentos.historico.v1';
const HISTORY_REV_KEY='pcpr.documentos.historico.rev.v1';
const HISTORY_CHANNEL='pcpr-documentos-historico-v1';
const HISTORY_LIMIT=1000;

function clean(v){return String(v??'').trim()}
function fold(v){return clean(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR')}
function parseJSON(v,fallback){try{const x=JSON.parse(v);return x==null?fallback:x}catch(_){return fallback}}
function uid(){try{return crypto.randomUUID()}catch(_){return 'pcpr-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,10)}}
function nowISO(){return new Date().toISOString()}
function pathFile(){try{return decodeURIComponent(location.pathname.split('/').pop()||'index.html').toLowerCase()}catch(_){return 'index.html'}}
const MODULES={
  'informacao.html':'Folha de Rosto',
  'oficios-core.html':'Ofício',
  'oficios.html':'Ofícios',
  'oficio-coffee-break.html':'Ofício Coffee Break',
  'oficio-diaria.html':'Ofício de Diárias',
  'oitiva-penitenciaria.html':'Oitiva em Penitenciária',
  'pericia.html':'Perícia',
  'fundo-rotativo.html':'Fundo Rotativo — Justificativa',
  'fundo-rotativo-certidoes.html':'Fundo Rotativo',
  'diario-bordo.html':'Diário de Bordo',
  'relatorio-viagem.html':'Relatório Técnico de Viagem',
  'reconhecimento-fotografico.html':'Reconhecimento Fotográfico',
  'laudo-lesoes.html':'Laudo de Lesões',
  'envelope-busca.html':'Envelope de Busca',
  'auto-arrecadacao.html':'Auto de Arrecadação',
  'historico-documentos.html':'Histórico de Documentos'
};
function moduleName(){
  const custom=clean(global.PCPR_DOCUMENT_TYPE);
  return custom||MODULES[pathFile()]||clean(document.title).replace(/\s*[—|-]\s*Central PCPR.*$/i,'')||'Documento';
}
function historyRead(){
  try{const a=parseJSON(localStorage.getItem(HISTORY_KEY)||'[]',[]);return Array.isArray(a)?a:[]}catch(_){return[]}
}
function historyEmit(){
  const rev=String(Date.now());
  try{localStorage.setItem(HISTORY_REV_KEY,rev)}catch(_){}
  try{global.dispatchEvent(new CustomEvent('pcpr:history-changed',{detail:{rev}}))}catch(_){}
  try{if('BroadcastChannel' in global){const b=new BroadcastChannel(HISTORY_CHANNEL);b.postMessage({type:'changed',rev});b.close()}}catch(_){}
}
function historyWrite(list){
  const out=(Array.isArray(list)?list:[]).slice(0,HISTORY_LIMIT);
  localStorage.setItem(HISTORY_KEY,JSON.stringify(out));historyEmit();return out;
}
function historyAdd(entry){
  entry=(entry&&typeof entry==='object')?entry:{};
  const row={
    id:clean(entry.id)||uid(),
    data:clean(entry.data)||nowISO(),
    tipo:clean(entry.tipo)||moduleName(),
    nomeDoc:clean(entry.nomeDoc||entry.nome||entry.arquivo).replace(/\.(pdf|odt|docx?|zip|png|jpe?g)$/i,''),
    arquivo:clean(entry.arquivo),
    autoridade:clean(entry.autoridade),
    acao:clean(entry.acao)||'GERADO',
    formato:clean(entry.formato),
    pasta:clean(entry.pasta),
    resultado:clean(entry.resultado)||'Sucesso',
    detalhe:clean(entry.detalhe),
    url:clean(entry.url),
    fileId:clean(entry.fileId),
    origem:clean(entry.origem)||pathFile()
  };
  const list=historyRead();list.unshift(row);historyWrite(list);return row;
}
function historyClear(){historyWrite([])}
function historyRemove(id){historyWrite(historyRead().filter(x=>x&&x.id!==id))}
function historySubscribe(fn){
  if(typeof fn!=='function')return()=>{};
  const storage=e=>{if(e.key===HISTORY_KEY||e.key===HISTORY_REV_KEY)fn(historyRead())};
  const local=()=>fn(historyRead());
  global.addEventListener('storage',storage);global.addEventListener('pcpr:history-changed',local);
  let bc=null;try{if('BroadcastChannel' in global){bc=new BroadcastChannel(HISTORY_CHANNEL);bc.onmessage=()=>fn(historyRead())}}catch(_){}
  return()=>{global.removeEventListener('storage',storage);global.removeEventListener('pcpr:history-changed',local);try{bc&&bc.close()}catch(_){}};
}
function downloadBlob(blob,name){const u=URL.createObjectURL(blob),a=document.createElement('a');a.href=u;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),1500)}
function historyExportJSON(){downloadBlob(new Blob([JSON.stringify({versao:1,exportadoEm:nowISO(),itens:historyRead()},null,2)],{type:'application/json'}),'historico-documentos-central-pcpr.json')}
function csvCell(v){v=String(v??'');return /[";\r\n]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v}
function historyExportCSV(){
  const cols=['Data','Tipo','Nome DOC','Arquivo','Autoridade','Ação','Formato','Pasta','Resultado','Detalhe'];
  const lines=[cols.join(';')];
  historyRead().forEach(x=>lines.push([x.data,x.tipo,x.nomeDoc,x.arquivo,x.autoridade,x.acao,x.formato,x.pasta,x.resultado,x.detalhe].map(csvCell).join(';')));
  downloadBlob(new Blob(['\ufeff'+lines.join('\r\n')],{type:'text/csv;charset=utf-8'}),'historico-documentos-central-pcpr.csv');
}

const history={KEY:HISTORY_KEY,REV_KEY:HISTORY_REV_KEY,LIMIT:HISTORY_LIMIT,read:historyRead,write:historyWrite,add:historyAdd,clear:historyClear,remove:historyRemove,subscribe:historySubscribe,exportJSON:historyExportJSON,exportCSV:historyExportCSV};

global.PCPRCore={VERSION,VERSION_DATE,clean,fold,uid,nowISO,moduleName,MODULES,history};
try{document.documentElement.dataset.pcprVersion=VERSION}catch(_){}
})(window);
