const CACHE_NAME='beatforge-pocket-v5.0-real-wav';
const ASSETS=['./','./index.html','./producer.css','./producer.js','./audio-learning.js','./audio-learning.css','./groove-model.js','./groove-model.css','./groove-model.json','./manifest.webmanifest','./icon-180.png','./icon-192.png','./icon-512.png','./sample-engine.js','./sample-engine.css','./samples/hard/kick.wav','./samples/hard/kick-alt.wav','./samples/hard/snare.wav','./samples/hard/snare-alt.wav','./samples/hard/hat.wav','./samples/hard/hat-alt.wav','./samples/hard/openhat.wav','./samples/hard/clap.wav','./samples/hard/808-dist.wav','./samples/hard/808-sub.wav','./samples/bounce/kick.wav','./samples/bounce/snare.wav','./samples/bounce/hat.wav','./samples/bounce/openhat.wav','./samples/bounce/808.wav','./samples/vintage/kick.wav','./samples/vintage/snare.wav','./samples/vintage/hat.wav','./samples/vintage/openhat.wav','./samples/vintage/808.wav'];
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
