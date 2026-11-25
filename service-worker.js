const CACHE='galway-v10';
const FILES=['./','./index.html','./config.js','./sync.js','./duels.js','./pubgolf.js','./manifest.json','./icon-192.png','./icon-512.png'];

self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(FILES)).then(()=>self.skipWaiting()));
});

self.addEventListener('activate',event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('galway-')&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim()));
});

/* Vraag de bestanden op bij de server en val terug op de cache. Daarmee werkt
 * de app offline, maar ziet een telefoon wel meteen een nieuwe versie; een
 * cache-eerst-strategie houdt gebruikers tot een volgende SW-versie vast, en
 * "mijn wijziging staat er niet" was het eerste wat daar misging. */
self.addEventListener('fetch',event=>{
  const url=new URL(event.request.url);
  if(event.request.method!=='GET'||url.origin!==location.origin||url.pathname.startsWith('/api/'))return;
  event.respondWith(
    fetch(event.request)
      .then(response=>{
        if(response.ok){
          const copy=response.clone();
          caches.open(CACHE).then(cache=>cache.put(event.request,copy));
        }
        return response;
      })
      .catch(()=>caches.match(event.request,{ignoreSearch:true}).then(hit=>hit||caches.match('./index.html')))
  );
});
