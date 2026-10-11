const CACHE_NAME='beatforge-pocket-v4.1-gmd-offline';
const ASSETS=['./','./index.html','./producer.css','./producer.js','./audio-learning.js','./audio-learning.css','./groove-model.js','./groove-model.css','./groove-model.json','./manifest.webmanifest','./icon-180.png','./icon-192.png','./icon-512.png'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE_NAME).then(cache=>cache.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE_NAME).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
 if(event.request.method!=='GET'||new URL(event.request.url).origin!==self.location.origin)return;
 if(event.request.mode==='navigate'){
  event.respondWith(fetch(event.request).then(res=>{if(res.ok){const copy=res.clone();event.waitUntil(caches.open(CACHE_NAME).then(cache=>cache.put('./index.html',copy)))}return res}).catch(()=>caches.match('./index.html')));
 }else{
  event.respondWith(caches.match(event.request).then(cache=>cache||fetch(event.request)));
 }
});
