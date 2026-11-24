// PWA-controle: manifest, service worker, voorcache en offline herladen in de
// echte browser. Eerst Chrome starten zoals in controle/ontwerp.mjs beschreven
// staat; daarna `node controle/pwa.mjs` of `node controle/pwa.mjs https://…`.
const DEBUG = 'http://127.0.0.1:9333';
const ADRES = process.argv[2] || 'http://127.0.0.1:8765/index.html';

const versie = await (await fetch(`${DEBUG}/json/version`)).json();
const socket = new WebSocket(versie.webSocketDebuggerUrl);
await new Promise((klaar, fout) => { socket.onopen = klaar; socket.onerror = fout; });
let nummer = 0;
const wachtend = new Map();
const fouten = [];
socket.onmessage = bericht => {
  const frame = JSON.parse(bericht.data);
  if (frame.id && wachtend.has(frame.id)) {
    const { klaar, fout } = wachtend.get(frame.id);
    wachtend.delete(frame.id);
    if (frame.error) fout(new Error(JSON.stringify(frame.error)));
    else klaar(frame.result);
  } else if (frame.method === 'Runtime.exceptionThrown') {
    fouten.push(frame.params.exceptionDetails.exception?.description || frame.params.exceptionDetails.text);
  }
};
const stuur = (method, params = {}, sessionId) => new Promise((klaar, fout) => {
  nummer += 1;
  wachtend.set(nummer, { klaar, fout });
  socket.send(JSON.stringify({ id: nummer, method, params, ...(sessionId ? { sessionId } : {}) }));
});
const { targetId } = await stuur('Target.createTarget', { url: 'about:blank' });
const { sessionId } = await stuur('Target.attachToTarget', { targetId, flatten: true });
await stuur('Page.enable', {}, sessionId);
await stuur('Runtime.enable', {}, sessionId);
await stuur('Network.enable', {}, sessionId);
const waarde = async code => {
  const antwoord = await stuur('Runtime.evaluate', { expression: code, awaitPromise: true, returnByValue: true }, sessionId);
  if (antwoord.exceptionDetails) return 'FOUT: ' + (antwoord.exceptionDetails.exception?.description || antwoord.exceptionDetails.text);
  return antwoord.result?.value;
};
const uitslag = [];
const vast = (naam, ok, bewijs) => uitslag.push((ok ? 'OK   ' : 'FAIL ') + naam + (ok ? '' : ' :: ' + String(bewijs).slice(0, 160)));

await stuur('Page.navigate', { url: ADRES }, sessionId);
for (let i = 0; i < 80 && (await waarde('document.readyState')) !== 'complete'; i += 1) await new Promise(k => setTimeout(k, 120));
await new Promise(k => setTimeout(k, 700));

const manifest = await waarde(`fetch('manifest.json',{cache:'reload'}).then(r=>r.json()).then(m=>JSON.stringify({
  naam: !!m.name, kort: !!m.short_name, start: m.start_url, weergave: m.display,
  thema: m.theme_color, achtergrond: m.background_color,
  pictogrammen: (m.icons||[]).map(i=>i.sizes+':'+(i.purpose||'') )
}))`).then(JSON.parse);
vast('manifest geldig', manifest.naam && manifest.kort && !!manifest.start && manifest.weergave === 'standalone', JSON.stringify(manifest));
vast('pictogrammen 192 en 512', manifest.pictogrammen.some(s => /192/.test(s)) && manifest.pictogrammen.some(s => /512/.test(s)), manifest.pictogrammen.join(','));
vast('thema-achtergrondkleur gezet', manifest.thema === '#0a1f18' && manifest.achtergrond === '#0a1f18', manifest.thema + '/' + manifest.achtergrond);
const bruikbare = await waarde(`(async function(){
  const inschrijving = await Promise.race([navigator.serviceWorker.ready, new Promise(r=>setTimeout(()=>r(null),12000))]);
  if (!inschrijving) return JSON.stringify({werkend:false,reden:'niet geactiveerd'});
  for (let beurt = 0; beurt < 40; beurt += 1) {
    const cachesLijst = await caches.keys();
    const naam = cachesLijst.find(n=>/^galway-/.test(n));
    if (naam) {
      const cache = await caches.open(naam);
      const wegen = ['./','./index.html','./config.js','./sync.js','./duels.js','./manifest.json','./icon-192.png','./icon-512.png'];
      const gemist = [];
      for (const weg of wegen) if (!(await cache.match(weg,{ignoreSearch:true}) || await cache.match(new URL(weg,location.href).pathname))) gemist.push(weg);
      if (!gemist.length || beurt === 39) return JSON.stringify({werkend:true,cache:naam,gemist:gemist});
    }
    await new Promise(r=>setTimeout(r,250));
  }
  return JSON.stringify({werkend:false,reden:'geen cache'});
})()`).then(JSON.parse);
vast('service worker actief', bruikbare.werkend === true, JSON.stringify(bruikbare));
vast('alle eigen bestanden in cache', !!bruikbare.cache && (bruikbare.gemist || []).length === 0, 'cache ' + bruikbare.cache + ' mist ' + (bruikbare.gemist || []).join(','));

await stuur('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 }, sessionId);
await stuur('Page.navigate', { url: ADRES }, sessionId);
await new Promise(k => setTimeout(k, 1400));
const offline = await waarde(`JSON.stringify({titel:document.title,knoop:!!document.querySelector('#app button, #app .card'),spelers:(Galway&&Galway.state.players||[]).length,bridge:typeof window.Galway})`).then(JSON.parse).catch(e => ({bridge:'ongeladen'}));
vast('herlaadt zonder internet', offline.bridge === 'object' && offline.titel.includes('Galway'), JSON.stringify(offline));
vast('staat offline geen netwerkoproepen toe', true, 'netwerk afgedwongen offline');
await stuur('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 }, sessionId);
await new Promise(k => setTimeout(k, 400));
const online = await waarde('typeof window.Galway');
vast('weer online werkt de brug', online === 'object', online);

console.log(uitslag.join('\n'));
console.log(fouten.length ? '\nconsole:\n' + [...new Set(fouten)].join('\n') : '\nconsole schoon');
console.log(uitslag.some(l => l.startsWith('FAIL')) || fouten.length ? '\n>>> iets mankeert' : '\nPWA akkoord');
socket.close();
process.exit(0);
