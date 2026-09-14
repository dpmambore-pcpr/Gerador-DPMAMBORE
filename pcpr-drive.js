(function(global){
'use strict';
const VERSION='3.0.4';
const SCOPE='https://www.googleapis.com/auth/drive.file';
let token=null,tokenExp=0,tokenClient=null,tokenClientId='';
const scriptPromises={};
const TOKEN_STORE_KEY='pcpr.drive.oauth.token.v1';
function loadStoredToken(){
  try{
    const raw=sessionStorage.getItem(TOKEN_STORE_KEY);if(!raw)return false;
    const data=JSON.parse(raw)||{};
    const t=clean(data.token),exp=Number(data.exp)||0;
    if(t&&Date.now()<exp-60000){token=t;tokenExp=exp;return true;}
    sessionStorage.removeItem(TOKEN_STORE_KEY);
  }catch(_){}
  return false;
}
function saveStoredToken(){
  try{
    if(token&&tokenExp)sessionStorage.setItem(TOKEN_STORE_KEY,JSON.stringify({token,exp:tokenExp}));
  }catch(_){}
}
function clearStoredToken(){try{sessionStorage.removeItem(TOKEN_STORE_KEY)}catch(_){} }
function hasLiveToken(){if(token&&Date.now()<tokenExp-60000)return true;return loadStoredToken();}
function clean(v){return String(v??'').trim()}
function historyAdd(entry){try{const h=global.PCPRCore&&global.PCPRCore.history;if(h&&typeof h.add==='function')h.add(entry)}catch(_){}}
function currentDocType(){try{return global.PCPRCore&&typeof global.PCPRCore.moduleName==='function'?global.PCPRCore.moduleName():(clean(document.title)||'Documento')}catch(_){return 'Documento'}}
function fold(v){return clean(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR')}
function extractFolderId(input){
  const s=clean(input); if(!s)return '';
  const m=s.match(/\/folders\/([A-Za-z0-9_-]+)/i)||s.match(/[?&]id=([A-Za-z0-9_-]+)/i);
  if(m)return m[1];
  return /^[A-Za-z0-9_-]{10,}$/.test(s)?s:'';
}
function folderUrl(id){id=clean(id);return id?'https://drive.google.com/drive/folders/'+encodeURIComponent(id):''}
function pickerOrigin(){
  try{
    const t=global.top&&global.top.location;
    if(t&&t.protocol&&t.host)return t.protocol+'//'+t.host;
  }catch(_){}
  try{return global.location.protocol+'//'+global.location.host}catch(_){return ''}
}
function normalizeDrive(d){d=(d&&typeof d==='object')?d:{};return {clientId:clean(d.clientId),apiKey:clean(d.apiKey),appId:clean(d.appId),scope:SCOPE}}
function authorityList(cfg){
  return Array.isArray(cfg&&cfg.autoridades)?cfg.autoridades.filter(a=>a&&clean(a.nome)):[];
}
function isDelegateAuthority(a){return /^delegad[oa]\b/i.test(clean(a&&a.cargo))}
function defaultAuthority(cfg){
  const list=authorityList(cfg),delegates=list.filter(isDelegateAuthority);
  return delegates[0]||list[0]||null;
}
function looksInstitutionalName(name){
  const n=fold(name);
  return /\b(delegacia|unidade|subdivisao|departamento|secretaria|policia civil|pcpr|estado do parana)\b/.test(n);
}
function findAuthority(name,cfg){
  const n=fold(name),list=authorityList(cfg);
  if(!list.length)return null;
  if(!n)return defaultAuthority(cfg);
  let a=list.find(x=>fold(x&&x.nome)===n);
  if(a)return a;
  // Aceita textos como "NOME - Delegado de Polícia" ou assinatura com cargo anexado.
  a=list.find(x=>{const an=fold(x&&x.nome);return an&&(n.includes(an)||an.includes(n));});
  if(a)return a;
  // Alguns módulos antigos enviavam por engano o nome da unidade em vez do nome do assinante.
  // Nessa situação usamos a autoridade padrão (★) da Configuração Geral.
  const delegates=list.filter(isDelegateAuthority);
  if(looksInstitutionalName(name))return delegates[0]||list[0]||null;
  // Se há apenas um Delegado cadastrado, ele é inequivocamente o destino de assinatura.
  if(delegates.length===1)return delegates[0];
  return null;
}
function loadScript(src,key){
  key=key||src;if(scriptPromises[key])return scriptPromises[key];
  scriptPromises[key]=new Promise((resolve,reject)=>{
    const exists=[...document.scripts].find(s=>s.src===src);if(exists){if((key==='gis'&&global.google?.accounts?.oauth2)||(key==='gapi'&&global.gapi))return resolve();exists.addEventListener('load',()=>resolve(),{once:true});exists.addEventListener('error',()=>reject(new Error('Falha ao carregar '+src)),{once:true});return;}
    const s=document.createElement('script');s.src=src;s.async=true;s.defer=true;s.onload=()=>resolve();s.onerror=()=>reject(new Error('Falha ao carregar '+src));document.head.appendChild(s);
  });
  return scriptPromises[key];
}
async function ensureGoogleLibraries(withPicker){
  await loadScript('https://accounts.google.com/gsi/client','gis');
  if(withPicker){
    await loadScript('https://apis.google.com/js/api.js','gapi');
    await new Promise((resolve,reject)=>{try{global.gapi.load('picker',{callback:resolve,onerror:()=>reject(new Error('Não foi possível carregar o Google Picker.'))});}catch(e){reject(e)}});
  }
}
function requestAccessTokenOnce(d,promptValue){
  return new Promise((resolve,reject)=>{
    let settled=false;
    const finishReject=(err)=>{if(settled)return;settled=true;reject(err instanceof Error?err:new Error(String(err||'Falha na autenticação Google.')))};
    const cb=(resp)=>{
      if(settled)return;
      if(resp&&resp.error){finishReject(new Error(resp.error_description||resp.error));return;}
      if(!resp||!resp.access_token){finishReject(new Error('O Google não retornou um token de acesso.'));return;}
      settled=true;
      token=resp.access_token;
      tokenExp=Date.now()+((Number(resp.expires_in)||3300)*1000);
      saveStoredToken();
      resolve(token);
    };
    const errCb=(e)=>{
      const type=clean(e&&e.type);
      if(type==='popup_failed_to_open'){
        finishReject(new Error('O navegador bloqueou a janela de autorização do Google. No iPhone/iPad, abra a Central diretamente no Safari e toque novamente em Autorizar pasta. Se necessário, permita pop-ups temporariamente.'));
        return;
      }
      if(type==='popup_closed'){
        finishReject(new Error('A janela de autorização do Google foi fechada antes da conclusão. Toque novamente em Autorizar pasta.'));
        return;
      }
      finishReject(new Error(type||'Falha na autenticação Google.'));
    };
    try{
      if(!tokenClient||tokenClientId!==d.clientId){
        tokenClient=global.google.accounts.oauth2.initTokenClient({client_id:d.clientId,scope:SCOPE,callback:cb,error_callback:errCb});
        tokenClientId=d.clientId;
      }else{
        tokenClient.callback=cb;
        tokenClient.error_callback=errCb;
      }
      // prompt vazio reaproveita a sessão/permissão já concedida sem exibir
      // novamente seleção de conta e consentimento quando o Google permitir.
      tokenClient.requestAccessToken({prompt:promptValue});
    }catch(e){finishReject(e)}
  });
}
async function getAccessToken(settings,forcePrompt){
  const d=normalizeDrive(settings);if(!d.clientId)throw new Error('OAuth Client ID do Google Drive não configurado.');
  if(hasLiveToken()&&!forcePrompt)return token;
  // Se a biblioteca já estiver pronta, inicia a solicitação imediatamente.
  // Isso preserva o gesto do clique no Safari/iOS e evita popup_failed_to_open.
  if(global.google?.accounts?.oauth2){
    if(forcePrompt)return requestAccessTokenOnce(d,'consent');
    try{return await requestAccessTokenOnce(d,'');}
    catch(silentError){
      const msg=clean(silentError&&silentError.message);
      if(/popup_failed_to_open|bloqueou a janela/i.test(msg))throw silentError;
      return requestAccessTokenOnce(d,'consent');
    }
  }
  await ensureGoogleLibraries(false);
  // Quando o carregamento da biblioteca ocorreu após o clique, não tentamos
  // abrir um popup atrasado no iOS. A mensagem orienta um segundo toque,
  // agora com a biblioteca já carregada e o gesto preservado.
  if(forcePrompt)throw new Error('A integração Google terminou de carregar. Toque novamente em Autorizar pasta.');
  try{return await requestAccessTokenOnce(d,'');}
  catch(silentError){
    const msg=clean(silentError&&silentError.message);
    if(/popup_failed_to_open|bloqueou a janela/i.test(msg))throw silentError;
    throw new Error('É necessário autorizar o Google Drive. Abra Configurações → Google Drive e toque em Autorizar pasta.');
  }
}

async function pickFolder(settings,startFolderId){
  const d=normalizeDrive(settings);if(!d.clientId)throw new Error('OAuth Client ID do Google Drive não configurado.');if(!d.apiKey)throw new Error('API Key do Google Picker não configurada.');
  let accessToken='';
  if(hasLiveToken())accessToken=token;
  else{
    // Autorizar pasta é uma ação explícita do usuário. O token deve ser
    // solicitado diretamente a partir desse clique, antes de qualquer await.
    if(!global.google?.accounts?.oauth2){
      await ensureGoogleLibraries(false);
      throw new Error('A integração Google terminou de carregar. Toque novamente em Autorizar pasta.');
    }
    accessToken=await requestAccessTokenOnce(d,'consent');
  }
  await ensureGoogleLibraries(true);
  return new Promise((resolve,reject)=>{
    try{
      const view=new global.google.picker.DocsView(global.google.picker.ViewId.FOLDERS)
        .setIncludeFolders(true).setSelectFolderEnabled(true).setMode(global.google.picker.DocsViewMode.LIST);
      const start=extractFolderId(startFolderId);if(start)view.setFileIds(start);
      const origin=pickerOrigin();
      let builder=new global.google.picker.PickerBuilder()
        .addView(view)
        .setOAuthToken(accessToken)
        .setDeveloperKey(d.apiKey);
      if(origin)builder=builder.setOrigin(origin);
      builder=builder.setCallback(data=>{
        const action=data&&data[global.google.picker.Response.ACTION];
        if(action===global.google.picker.Action.CANCEL){reject(new Error('Seleção de pasta cancelada.'));return;}
        if(action!==global.google.picker.Action.PICKED)return;
        const doc=(data[global.google.picker.Response.DOCUMENTS]||[])[0];if(!doc){reject(new Error('Nenhuma pasta foi selecionada.'));return;}
        const id=doc[global.google.picker.Document.ID]||'';
        const name=doc[global.google.picker.Document.NAME]||'Pasta do Google Drive';
        const mime=doc[global.google.picker.Document.MIME_TYPE]||'';
        if(mime&&mime!=='application/vnd.google-apps.folder'){reject(new Error('Selecione uma pasta do Google Drive.'));return;}
        resolve({id,name,url:folderUrl(id),accessToken});
      });
      if(d.appId)builder=builder.setAppId(d.appId);
      builder.build().setVisible(true);
    }catch(e){reject(e)}
  });
}

async function uploadFile(bytes,name,mimeType,folderId,settings,accessToken){
  const id=extractFolderId(folderId);if(!id)throw new Error('Pasta do Google Drive inválida.');
  const tok=accessToken||await getAccessToken(settings,false);
  const fileBlob=bytes instanceof Blob?bytes:new Blob([bytes],{type:mimeType||'application/octet-stream'});
  const boundary='pcpr_'+Math.random().toString(36).slice(2)+Date.now().toString(36);
  const meta={name:clean(name)||'documento.pdf',mimeType:mimeType||fileBlob.type||'application/pdf',parents:[id]};
  const body=new Blob([
    '--'+boundary+'\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n',JSON.stringify(meta),
    '\r\n--'+boundary+'\r\nContent-Type: '+(mimeType||fileBlob.type||'application/pdf')+'\r\n\r\n',fileBlob,
    '\r\n--'+boundary+'--'
  ]);
  const res=await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,name,webViewLink,parents',{
    method:'POST',headers:{Authorization:'Bearer '+tok,'Content-Type':'multipart/related; boundary='+boundary},body
  });
  let data={};try{data=await res.json()}catch(_){ }
  if(!res.ok){const m=data&&data.error&&data.error.message?data.error.message:('HTTP '+res.status);const e=new Error('Google Drive: '+m);e.status=res.status;throw e;}
  return data;
}

function getGeneralConfig(){
  if(global.PCPRConfig&&typeof global.PCPRConfig.get==='function')return global.PCPRConfig.get();
  try{return JSON.parse(localStorage.getItem('pcpr.configGeralUnidade.v1')||'{}')||{}}catch(_){return{}}
}
function saveGeneralConfig(cfg){
  if(global.PCPRConfig&&typeof global.PCPRConfig.save==='function')return global.PCPRConfig.save(cfg);
  localStorage.setItem('pcpr.configGeralUnidade.v1',JSON.stringify(cfg));return cfg;
}
function safeFileName(v){
  return clean(v||'documento.pdf').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[\\/:*?"<>|]+/g,'-').replace(/\s+/g,'_').replace(/_+/g,'_').replace(/^-+|-+$/g,'')||'documento.pdf';
}
function savePickedFolder(cfg,authorityName,picked){
  const target=fold(authorityName);
  cfg={...(cfg||{})};
  cfg.autoridades=(Array.isArray(cfg.autoridades)?cfg.autoridades:[]).map(a=>{
    if(fold(a&&a.nome)!==target)return a;
    const id=clean(picked&&picked.id)||extractFolderId(a.driveFolderId||a.driveFolderUrl);
    return {...a,driveFolderId:id,driveFolderUrl:(picked&&picked.url)||folderUrl(id),driveFolderName:clean(picked&&picked.name)||clean(a.driveFolderName),driveFolderAuthorized:true};
  });
  return saveGeneralConfig(cfg);
}
async function prepareDestination(authorityName,options){
  options=options||{};
  let cfg=getGeneralConfig(),a=findAuthority(authorityName,cfg);
  if(!a){const pedido=clean(authorityName);throw new Error(pedido?'A autoridade "'+pedido+'" não está cadastrada na Configuração Geral da Central.':'Nenhuma autoridade responsável foi encontrada na Configuração Geral da Central.');}
  let id=extractFolderId(a.driveFolderId||a.driveFolderUrl);
  if(!id)throw new Error('Nenhuma pasta do Google Drive foi configurada para '+a.nome+'. Abra Configuração Geral → Google Drive e cole o link da pasta para assinatura.');
  const d=normalizeDrive(cfg.drive);
  if(!d.clientId||!d.apiKey)throw new Error('A integração Google Drive ainda não está completa. Abra Configuração Geral → Google Drive → Configuração técnica e preencha OAuth Client ID e API Key.');
  let accessToken='';
  if(options.forcePicker||!a.driveFolderAuthorized){
    const picked=await pickFolder(d,id);
    cfg=savePickedFolder(cfg,a.nome,picked);
    a=findAuthority(a.nome,cfg)||a;
    id=extractFolderId(a.driveFolderId||picked.id);
    accessToken=picked.accessToken||'';
  }
  if(!accessToken)accessToken=await getAccessToken(d,false);
  return {cfg,authority:a,folderId:id,drive:d,accessToken,folderName:a.driveFolderName||'Pasta configurada'};
}
async function uploadPdfForAuthority(opts){
  opts=opts||{};
  const authorityName=clean(opts.authorityName);
  const filename=safeFileName(opts.fileName||'documento.pdf').replace(/\.pdf$/i,'')+'.pdf';
  let dest=null;
  try{
    dest=await prepareDestination(authorityName,{forcePicker:!!opts.forcePicker});
    if(opts.confirm!==false){
      const ok=global.confirm('Enviar PDF para assinatura?\n\nAutoridade: '+dest.authority.nome+'\nPasta: '+dest.folderName+'\nArquivo: '+filename);
      if(!ok){const e=new Error('Envio cancelado.');e.cancelled=true;throw e;}
    }
    let bytes=opts.bytes;
    if(typeof bytes==='function')bytes=await bytes();
    if(!bytes)throw new Error('Não foi possível gerar o PDF para envio.');
    let result;
    try{
      result=await uploadFile(bytes,filename,'application/pdf',dest.folderId,dest.drive,dest.accessToken);
    }catch(e){
      if(e&&e.status===401){
        clearToken();dest.accessToken=await getAccessToken(dest.drive,true);
        result=await uploadFile(bytes,filename,'application/pdf',dest.folderId,dest.drive,dest.accessToken);
      }else if(e&&(e.status===403||e.status===404)&&!opts.forcePicker){
        const picked=await pickFolder(dest.drive,dest.folderId);
        const cfg=savePickedFolder(dest.cfg,dest.authority.nome,picked);
        dest.authority=findAuthority(dest.authority.nome,cfg)||dest.authority;
        dest.folderId=extractFolderId(dest.authority.driveFolderId||picked.id);
        dest.accessToken=picked.accessToken||await getAccessToken(dest.drive,false);
        result=await uploadFile(bytes,filename,'application/pdf',dest.folderId,dest.drive,dest.accessToken);
      }else throw e;
    }
    historyAdd({tipo:currentDocType(),nomeDoc:filename.replace(/\.pdf$/i,''),arquivo:filename,autoridade:clean(dest.authority&&dest.authority.nome),acao:'ENVIADO_DRIVE',formato:'PDF',pasta:clean(dest.folderName),resultado:'Sucesso',url:clean(result&&result.webViewLink),fileId:clean(result&&result.id)});
    return {...result,folderId:dest.folderId,folderUrl:folderUrl(dest.folderId),authority:dest.authority,filename};
  }catch(e){
    if(!(e&&e.cancelled))historyAdd({tipo:currentDocType(),nomeDoc:filename.replace(/\.pdf$/i,''),arquivo:filename,autoridade:clean(dest&&dest.authority&&dest.authority.nome)||authorityName,acao:'ERRO_DRIVE',formato:'PDF',pasta:clean(dest&&dest.folderName),resultado:'Erro',detalhe:clean(e&&e.message)});
    throw e;
  }
}

async function ensurePdfLibraries(){
  if(!global.html2canvas)await loadScript('https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js','html2canvas');
  if(!global.jspdf?.jsPDF)await loadScript('https://cdn.jsdelivr.net/npm/jspdf@2.5.2/dist/jspdf.umd.min.js','jspdf');
  if(!global.html2canvas||!global.jspdf?.jsPDF)throw new Error('Não foi possível carregar o gerador de PDF.');
}
function normalizeElements(input){
  if(!input)return[];
  if(typeof input==='string')return [...document.querySelectorAll(input)];
  if(input instanceof Element)return[input];
  if(Array.isArray(input)||input instanceof NodeList)return [...input].filter(x=>x instanceof Element);
  return[];
}
async function elementsToPdfBlob(elements,options){
  options=options||{};await ensurePdfLibraries();
  const els=normalizeElements(elements);if(!els.length)throw new Error('A pré-visualização do documento não foi encontrada.');
  const {jsPDF}=global.jspdf;
  const pdf=new jsPDF({orientation:'portrait',unit:'mm',format:'a4',compress:true});
  for(let i=0;i<els.length;i++){
    if(i)pdf.addPage('a4','portrait');
    const el=els[i];
    const canvas=await global.html2canvas(el,{scale:options.scale||2,useCORS:true,allowTaint:false,backgroundColor:options.backgroundColor||'#ffffff',logging:false,imageTimeout:15000,scrollX:0,scrollY:-global.scrollY});
    const img=canvas.toDataURL('image/jpeg',options.quality||0.94);
    const pw=210,ph=297,ratio=canvas.width/canvas.height;
    let w=pw,h=w/ratio;if(h>ph){h=ph;w=h*ratio}
    const x=(pw-w)/2,y=(ph-h)/2;
    pdf.addImage(img,'JPEG',x,y,w,h,undefined,'FAST');
  }
  return pdf.output('blob');
}
async function uploadElementsPdfForAuthority(opts){
  opts=opts||{};
  const bytes=await elementsToPdfBlob(opts.elements,opts.pdfOptions);
  return uploadPdfForAuthority({...opts,bytes});
}

function clearToken(){token=null;tokenExp=0;tokenClient=null;tokenClientId='';clearStoredToken();}
// Pré-carrega as bibliotecas do Google enquanto o usuário preenche o formulário.
// Assim, no iOS, o clique em "Autorizar pasta" pode abrir o OAuth imediatamente.
function warmupGoogle(){ensureGoogleLibraries(true).catch(()=>{});}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(warmupGoogle,0),{once:true});
else setTimeout(warmupGoogle,0);

global.PCPRDrive={VERSION,SCOPE,extractFolderId,folderUrl,pickerOrigin,normalizeDrive,authorityList,defaultAuthority,findAuthority,getAccessToken,pickFolder,uploadFile,getGeneralConfig,prepareDestination,safeFileName,elementsToPdfBlob,uploadPdfForAuthority,uploadElementsPdfForAuthority,clearToken};
})(window);
