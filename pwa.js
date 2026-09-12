(function(){
'use strict';
const row=document.getElementById('pwaInstallRow');
const btn=document.getElementById('installAppBtn');
const hint=document.getElementById('pwaInstallHint');
let deferredPrompt=null;
function standalone(){return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone===true;}
function isIOS(){return /iphone|ipad|ipod/i.test(navigator.userAgent||'');}
function showRow(message,buttonText){if(!row||!btn)return;row.hidden=false;if(buttonText)btn.textContent=buttonText;if(hint)hint.textContent=message||'';}
function hideRow(){if(row)row.hidden=true;}
if(standalone())hideRow();
else if(isIOS())showRow('No Safari, use Compartilhar → Adicionar à Tela de Início para instalar como aplicativo.','Como instalar no iPhone/iPad');
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferredPrompt=e;showRow('Instalação local: a Central abrirá em janela própria, como aplicativo.','⬇ Instalar Central PCPR');});
btn?.addEventListener('click',async()=>{if(deferredPrompt){const p=deferredPrompt;deferredPrompt=null;try{await p.prompt();await p.userChoice;}catch(e){}if(standalone())hideRow();return;}if(isIOS()&&hint)hint.textContent='Safari: toque em Compartilhar (quadrado com seta) e depois em “Adicionar à Tela de Início”.';});
window.addEventListener('appinstalled',()=>{deferredPrompt=null;hideRow();});
function updateToast(reg){if(document.getElementById('pwaUpdateToast'))return;const box=document.createElement('div');box.id='pwaUpdateToast';box.className='pwa-update-toast';box.innerHTML='<span>Nova versão da Central disponível.</span><button type="button">Atualizar agora</button>';box.querySelector('button').addEventListener('click',()=>{try{reg.waiting?.postMessage({type:'SKIP_WAITING'});}catch(e){}setTimeout(()=>location.reload(),350);});document.body.appendChild(box);}
if('serviceWorker' in navigator){window.addEventListener('load',async()=>{try{const reg=await navigator.serviceWorker.register('./service-worker.js',{scope:'./'});if(reg.waiting&&navigator.serviceWorker.controller)updateToast(reg);reg.addEventListener('updatefound',()=>{const worker=reg.installing;worker?.addEventListener('statechange',()=>{if(worker.state==='installed'&&navigator.serviceWorker.controller)updateToast(reg);});});navigator.serviceWorker.addEventListener('controllerchange',()=>{if(window.__pcprSwReloading)return;window.__pcprSwReloading=true;location.reload();});}catch(err){console.warn('PWA: Service Worker não pôde ser registrado.',err);}});}
})();
