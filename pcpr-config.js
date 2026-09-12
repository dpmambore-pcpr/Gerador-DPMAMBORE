
(function(global){
'use strict';
const KEY='pcpr.configGeralUnidade.v1';
const REV_KEY='pcpr.configGeralRev.v2';
const CHANNEL='pcpr-config-geral-v2';
const DEFAULT={
  versao:2,estadoHeader:'ESTADO DO PARANÁ',estado:'Paraná',
  secretaria:'SECRETARIA DE ESTADO DA SEGURANÇA PÚBLICA',
  departamento:'DEPARTAMENTO DE POLÍCIA CIVIL',
  subdivisao:'16ª SUBDIVISÃO POLICIAL DE CAMPO MOURÃO',
  unidade:'DELEGACIA DE POLÍCIA CIVIL DE MAMBORÊ',
  cidade:'Mamborê',uf:'PR',
  logradouro:'Av. Augusto Mendes dos Santos',numero:'997',bairro:'',
  endereco:'Av. Augusto Mendes dos Santos, 997',cep:'87.340-000',
  email:'dpmambore@pc.pr.gov.br',fone:'(44) 3865-1341',site:'www.policiacivil.pr.gov.br',
  logo:'',assinaturaComplementar:'',
  autoridades:[{nome:'Anderson Sérgio Romão',cargo:'Delegado de Polícia',complemento:''}],
  servidores:[
    {nome:'Anderson Sérgio Romão',cargo:'Delegado de Polícia'},
    {nome:'Thiago Gonzaga da Silva Couto',cargo:'APJ - Agente de Polícia Judiciária'},
    {nome:'Tiago Henrique Lemes',cargo:'APJ - Agente de Polícia Judiciária'},
    {nome:'Paulo Henrique Vilaça',cargo:'APJ - Agente de Polícia Judiciária'}
  ],
  apjs:['Thiago Gonzaga da Silva Couto','Tiago Henrique Lemes','Paulo Henrique Vilaça']
};
function clone(v){return JSON.parse(JSON.stringify(v))}
function readJSON(k){try{return JSON.parse(localStorage.getItem(k)||'null')}catch(_){return null}}
function cleanName(v){return String(v??'').trim()}
function uniqueByName(arr){
  const out=[];
  (Array.isArray(arr)?arr:[]).forEach(x=>{
    if(typeof x==='string')x={nome:x,cargo:''};
    const nome=cleanName(x&&x.nome),cargo=cleanName(x&&x.cargo),complemento=cleanName(x&&x.complemento);
    if(nome && !out.some(y=>y.nome.toLocaleLowerCase('pt-BR')===nome.toLocaleLowerCase('pt-BR')))out.push({nome,cargo,complemento});
  });
  return out;
}
function normalize(raw){
  const r=(raw&&typeof raw==='object')?raw:{}, c={...clone(DEFAULT),...r};
  c.uf=cleanName(c.uf||'PR').toUpperCase().slice(0,2)||'PR';
  c.estadoHeader=cleanName(c.estadoHeader)||DEFAULT.estadoHeader;
  c.estado=cleanName(c.estado)||c.estadoHeader.replace(/^ESTADO\s+(DO|DE|DA)\s+/i,'')||DEFAULT.estado;
  for(const k of ['secretaria','departamento','subdivisao','unidade','cidade'])c[k]=cleanName(c[k])||DEFAULT[k];
  c.logradouro=cleanName(c.logradouro); c.numero=cleanName(c.numero); c.bairro=cleanName(c.bairro);
  if(!c.logradouro && c.endereco){const p=String(c.endereco).split(',');c.logradouro=cleanName(p.shift());if(!c.numero)c.numero=cleanName(p.shift());}
  c.endereco=[c.logradouro,c.numero].filter(Boolean).join(', ')||cleanName(c.endereco)||DEFAULT.endereco;
  c.cep=cleanName(c.cep)||DEFAULT.cep; c.email=cleanName(c.email); c.fone=cleanName(c.fone); c.site=cleanName(c.site);
  c.logo=cleanName(c.logo); c.assinaturaComplementar=cleanName(c.assinaturaComplementar);
  c.autoridades=uniqueByName(c.autoridades);
  let servidores=uniqueByName(c.servidores);
  if(!servidores.length){
    const aps=(Array.isArray(c.apjs)?c.apjs:[]).map(nome=>({nome,cargo:'APJ - Agente de Polícia Judiciária'}));
    servidores=uniqueByName([...(c.autoridades||[]),...aps]);
  }
  c.servidores=servidores.map(x=>({nome:x.nome,cargo:x.cargo||''}));
  if(!c.autoridades.length)c.autoridades=c.servidores.filter(x=>/^delegad[oa]/i.test(x.cargo||'')).map(x=>({nome:x.nome,cargo:x.cargo,complemento:''}));
  if(!c.autoridades.length)c.autoridades=clone(DEFAULT.autoridades);
  for(const a of c.autoridades){
    if(!c.servidores.some(s=>s.nome.toLocaleLowerCase('pt-BR')===a.nome.toLocaleLowerCase('pt-BR')))c.servidores.unshift({nome:a.nome,cargo:a.cargo||'Delegado de Polícia'});
  }
  c.apjs=c.servidores.filter(x=>/APJ|AGENTE DE POL[IÍ]CIA JUDICI[AÁ]RIA/i.test(x.cargo||'')).map(x=>x.nome);
  c.versao=2; return c;
}
function deriveLegacy(){
  const h=readJSON('pcpr.oitivaPenal.institucional.v1')||{};
  const f=readJSON('pcpr.rodapeUnidade.v1')||{};
  const auth=readJSON('pcpr.autoridades.v2');
  const dels=readJSON('pcpr.oitivaPenal.delegados.v1');
  let autoridades=uniqueByName(Array.isArray(auth)?auth:[]);
  if(!autoridades.length && Array.isArray(dels))autoridades=uniqueByName(dels.map((nome,i)=>({nome,cargo:i===0?(localStorage.getItem('pcpr.cargoAutoridade.v1')||'Delegado de Polícia'):'Delegado de Polícia'})));
  const apjLegacy=readJSON('pcpr.oitivaPenal.apjs.v1')||readJSON('pcpr.apjs.v1')||[];
  const base={
    estadoHeader:h.estado||DEFAULT.estadoHeader,secretaria:h.secretaria||DEFAULT.secretaria,
    departamento:h.departamento||DEFAULT.departamento,subdivisao:h.subdivisao||DEFAULT.subdivisao,
    unidade:h.unidade||DEFAULT.unidade,endereco:f.endereco||DEFAULT.endereco,
    email:f.email||DEFAULT.email,fone:f.fone||DEFAULT.fone,site:f.site||DEFAULT.site,
    autoridades:autoridades.length?autoridades:DEFAULT.autoridades,
    apjs:Array.isArray(apjLegacy)&&apjLegacy.length?apjLegacy:DEFAULT.apjs
  };
  const cidades=readJSON('pcpr.oitivaPenal.cidades.v1');
  if(Array.isArray(cidades)&&cidades.length){const c=cidades[0]||{};if(c.nome)base.cidade=c.nome;if(c.email&&!base.email)base.email=c.email;if(c.telefone&&!base.fone)base.fone=c.telefone;}
  return normalize(base);
}
function get(){const current=readJSON(KEY);return normalize(current||deriveLegacy())}
function footerLines(c=get()){
  const cityUf=[c.cidade,c.uf].filter(Boolean).join(' - ');
  const addr=[c.endereco,c.bairro,cityUf,c.cep].filter(Boolean).join(', ');
  const second=[c.email?'Email: '+c.email:'',c.fone?'Fone/Fax: '+c.fone:'',c.site||''].filter(Boolean).join(' – ');
  return [addr,second].filter(Boolean);
}
function headerLines(c=get()){return [c.estadoHeader,c.secretaria,c.departamento,c.subdivisao,c.unidade].filter(Boolean)}
function authority(c=get()){return (Array.isArray(c.autoridades)&&c.autoridades[0])||{nome:'',cargo:''}}
function servers(c=get()){return Array.isArray(c.servidores)?c.servidores:[]}
function apjs(c=get()){return servers(c).filter(x=>/APJ|AGENTE DE POL[IÍ]CIA JUDICI[AÁ]RIA/i.test(x.cargo||'')).map(x=>x.nome)}
function syncLegacy(c){
  const a=authority(c);
  try{
    localStorage.setItem('pcpr.autoridades.v2',JSON.stringify(c.autoridades||[]));
    localStorage.setItem('pcpr.oitivaPenal.delegados.v1',JSON.stringify((c.autoridades||[]).map(x=>x.nome)));
    localStorage.setItem('pcpr.cargoAutoridade.v1',a.cargo||'Delegado de Polícia');
    localStorage.setItem('pcpr.oitivaPenal.institucional.v1',JSON.stringify({estado:c.estadoHeader,secretaria:c.secretaria,departamento:c.departamento,subdivisao:c.subdivisao,unidade:c.unidade}));
    const fl=footerLines(c);
    localStorage.setItem('pcpr.rodapeUnidade.v1',JSON.stringify({endereco:fl[0]||'',email:c.email,fone:c.fone,site:c.site}));
    const cityId='geral_'+String(c.cidade||'cidade').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]/gi,'_').toLowerCase();
    let cidades=readJSON('pcpr.oitivaPenal.cidades.v1'); if(!Array.isArray(cidades))cidades=[];
    const city={id:cityId,nome:c.cidade,endereco:(footerLines(c)[0]||[c.endereco,c.bairro].filter(Boolean).join(', ')),email:c.email,telefone:c.fone};
    const i=cidades.findIndex(x=>x&&((x.id===cityId)||String(x.nome||'').toLocaleLowerCase('pt-BR')===String(c.cidade||'').toLocaleLowerCase('pt-BR')));
    if(i>=0){const oldId=cidades[i]&&cidades[i].id;cidades[i]={...cidades[i],...city,id:oldId||cityId};}else cidades.unshift(city);
    localStorage.setItem('pcpr.oitivaPenal.cidades.v1',JSON.stringify(cidades));
    localStorage.setItem('pcpr.oitivaPenal.apjs.v1',JSON.stringify(c.apjs||[]));
    localStorage.setItem('pcpr.apjs.v1',JSON.stringify(c.apjs||[]));
  }catch(_){}
}
function emit(c){
  const stamp=String(Date.now());
  try{localStorage.setItem(REV_KEY,stamp)}catch(_){}
  try{if('BroadcastChannel' in global){const b=new BroadcastChannel(CHANNEL);b.postMessage({type:'changed',rev:stamp});b.close();}}catch(_){}
  try{global.dispatchEvent(new CustomEvent('pcpr:config-changed',{detail:c}))}catch(_){}
}
function save(raw){const c=normalize(raw);localStorage.setItem(KEY,JSON.stringify(c));syncLegacy(c);emit(c);return c}
function reset(){return save(clone(DEFAULT))}
function onChange(fn){
  if(typeof fn!=='function')return ()=>{};
  const sh=e=>{if(e.key===KEY||e.key===REV_KEY)fn(get())}; global.addEventListener('storage',sh);
  const eh=e=>fn((e&&e.detail)?normalize(e.detail):get()); global.addEventListener('pcpr:config-changed',eh);
  let bc=null;try{if('BroadcastChannel' in global){bc=new BroadcastChannel(CHANNEL);bc.onmessage=()=>fn(get())}}catch(_){}
  return ()=>{global.removeEventListener('storage',sh);global.removeEventListener('pcpr:config-changed',eh);try{bc&&bc.close()}catch(_){}};
}
global.PCPRConfig={KEY,REV_KEY,DEFAULT:clone(DEFAULT),normalize,get,save,reset,headerLines,footerLines,authority,servers,apjs,onChange,syncLegacy};
})(window);
