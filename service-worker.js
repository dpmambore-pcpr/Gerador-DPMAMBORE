const CACHE_VERSION='pcpr-central-v2.8.2';
const STATIC_CACHE=CACHE_VERSION+'-static';
const CDN_CACHE=CACHE_VERSION+'-cdn';
const CORE_FILES=[
  "./",
  "./MODELO_BASE_ORIGINAL_COFFEE_BREAK.odt",
  "./apple-touch-icon-precomposed.png",
  "./apple-touch-icon.png",
  "./atualizacoes.html",
  "./auto-arrecadacao.html",
  "./brasao-padrao.png",
  "./configuracoes.html",
  "./consulta-operadora.html",
  "./contato-dp-pr.html",
  "./contatos.html",
  "./diario-bordo.html",
  "./envelope-busca.html",
  "./erb.html",
  "./favicon.png",
  "./filtro-ip.html",
  "./fundo-rotativo-certidoes.html",
  "./fundo-rotativo.html",
  "./icon-192.png",
  "./icon-512.png",
  "./imei.html",
  "./index.html",
  "./laudo-lesoes.html",
  "./manifest.webmanifest",
  "./offline.html",
  "./oficio-coffee-break.html",
  "./oficio-diaria.html",
  "./oficios-core.html",
  "./oficios.html",
  "./oitiva-penitenciaria.html",
  "./papel-pericia.png",
  "./pcpr-config.js",
  "./pericia.html",
  "./pwa.js",
  "./qrcode.html",
  "./reconhecimento-fotografico.html",
  "./relatorio-viagem.html"
];
const STATIC_CDN_HOSTS=new Set(['cdn.jsdelivr.net','unpkg.com']);
self.addEventListener('install',event=>{
  event.waitUntil((async()=>{
    const cache=await caches.open(STATIC_CACHE);
    const results=await Promise.allSettled(CORE_FILES.map(url=>cache.add(url)));
    const failures=results.filter(x=>x.status==='rejected').length;
    if(failures)console.warn('PWA PCPR: arquivos não armazenados na instalação:',failures);
  })());
});
self.addEventListener('activate',event=>{
  event.waitUntil((async()=>{
    const names=await caches.keys();
    await Promise.all(names.filter(n=>n.startsWith('pcpr-central-')&&n!==STATIC_CACHE&&n!==CDN_CACHE).map(n=>caches.delete(n)));
    await self.clients.claim();
  })());
});
self.addEventListener('message',event=>{if(event.data&&event.data.type==='SKIP_WAITING')self.skipWaiting();});
async function networkFirst(request){
  const cache=await caches.open(STATIC_CACHE);
  try{const fresh=await fetch(request);if(fresh&&fresh.ok)cache.put(request,fresh.clone());return fresh;}
  catch(err){const cached=await cache.match(request,{ignoreSearch:true});if(cached)return cached;if(request.mode==='navigate')return cache.match('./offline.html');throw err;}
}
async function cacheFirstLocal(request){
  const cache=await caches.open(STATIC_CACHE);
  const cached=await cache.match(request,{ignoreSearch:true});
  if(cached){fetch(request).then(r=>{if(r&&r.ok)cache.put(request,r.clone());}).catch(()=>{});return cached;}
  const fresh=await fetch(request);if(fresh&&fresh.ok)cache.put(request,fresh.clone());return fresh;
}
async function staleWhileRevalidateCdn(request){
  const cache=await caches.open(CDN_CACHE);const cached=await cache.match(request);
  const network=fetch(request).then(r=>{if(r&&(r.ok||r.type==='opaque'))cache.put(request,r.clone());return r;}).catch(()=>null);
  return cached||(await network)||Response.error();
}
self.addEventListener('fetch',event=>{
  const req=event.request;if(req.method!=='GET')return;const url=new URL(req.url);
  if(url.origin===self.location.origin){if(req.mode==='navigate')event.respondWith(networkFirst(req));else event.respondWith(cacheFirstLocal(req));return;}
  if(STATIC_CDN_HOSTS.has(url.hostname))event.respondWith(staleWhileRevalidateCdn(req));
  // Consultas externas, APIs, mapas e formulários não são armazenados pelo Service Worker.
});
