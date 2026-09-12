(function(global){
'use strict';
const SCOPE='https://www.googleapis.com/auth/drive.file';
let token=null,tokenExp=0,tokenClient=null,tokenClientId='';
const scriptPromises={};
function clean(v){return String(v??'').trim()}
function fold(v){return clean(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR')}
function extractFolderId(input){
  const s=clean(input); if(!s)return '';
  const m=s.match(/\/folders\/([A-Za-z0-9_-]+)/i)||s.match(/[?&]id=([A-Za-z0-9_-]+)/i);
  if(m)return m[1];
  return /^[A-Za-z0-9_-]{10,}$/.test(s)?s:'';
}
function folderUrl(id){id=clean(id);return id?'https://drive.google.com/drive/folders/'+encodeURIComponent(id):''}
function normalizeDrive(d){d=(d&&typeof d==='object')?d:{};return {clientId:clean(d.clientId),apiKey:clean(d.apiKey),appId:clean(d.appId),scope:SCOPE}}
function findAuthority(name,cfg){
  const n=fold(name); if(!n)return null;
  const list=Array.isArray(cfg&&cfg.autoridades)?cfg.autoridades:[];
  return list.find(a=>fold(a&&a.nome)===n)||null;
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
async function getAccessToken(settings,forcePrompt){
  const d=normalizeDrive(settings);if(!d.clientId)throw new Error('OAuth Client ID do Google Drive não configurado.');
  if(token&&Date.now()<tokenExp-60000&&!forcePrompt)return token;
  await ensureGoogleLibraries(false);
  return new Promise((resolve,reject)=>{
    const cb=(resp)=>{
      if(resp&&resp.error){reject(new Error(resp.error_description||resp.error));return;}
      if(!resp||!resp.access_token){reject(new Error('O Google não retornou um token de acesso.'));return;}
      token=resp.access_token;tokenExp=Date.now()+((Number(resp.expires_in)||3300)*1000);resolve(token);
    };
    try{
      if(!tokenClient||tokenClientId!==d.clientId){tokenClient=global.google.accounts.oauth2.initTokenClient({client_id:d.clientId,scope:SCOPE,callback:cb,error_callback:e=>reject(new Error((e&&e.type)||'Falha na autenticação Google.'))});tokenClientId=d.clientId;}
      else tokenClient.callback=cb;
      tokenClient.requestAccessToken({prompt:forcePrompt||!token?'consent':''});
    }catch(e){reject(e)}
  });
}
async function pickFolder(settings,startFolderId){
  const d=normalizeDrive(settings);if(!d.clientId)throw new Error('OAuth Client ID do Google Drive não configurado.');if(!d.apiKey)throw new Error('API Key do Google Picker não configurada.');
  await ensureGoogleLibraries(true);const accessToken=await getAccessToken(d,false);
  return new Promise((resolve,reject)=>{
    try{
      const view=new global.google.picker.DocsView(global.google.picker.ViewId.FOLDERS)
        .setIncludeFolders(true).setSelectFolderEnabled(true).setMode(global.google.picker.DocsViewMode.LIST);
      const start=extractFolderId(startFolderId);if(start)view.setFileIds(start);
      let builder=new global.google.picker.PickerBuilder().addView(view).setOAuthToken(accessToken).setDeveloperKey(d.apiKey).setCallback(data=>{
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
function clearToken(){token=null;tokenExp=0;}
global.PCPRDrive={SCOPE,extractFolderId,folderUrl,normalizeDrive,findAuthority,getAccessToken,pickFolder,uploadFile,clearToken};
})(window);
