// Synccontrole: laat de echte browser met de echte sync-API praten en kijk of
// de telefoon er wat aan overhoudt. Curl merkt een dubbele
// access-control-allow-origin niet op; een browser verwerpt dan het hele
// antwoord, en dat is precies wat "Sync mislukt" oplevert.
// Uitvoeren zoals in controle/ontwerp.mjs beschreven:
//   node controle/synccheck.mjs                      # tegen de lokale testserver
//   node controle/synccheck.mjs https://…/ '' alleen-lezen   # tegen de live-site
// Deze controle schrijft, dus vervangt hij de kamer in config.js door een
// wegwerpkamer (standaard 'controle'). Met het woord 'alleen-lezen' wordt er
// niets geschreven en blijft de echte kamer van de site onaangeroerd.
const DEBUG = 'http://127.0.0.1:9333';
const ADRES = process.argv[2] || 'http://127.0.0.1:8765/index.html';
const KAMER = process.argv[3] || 'controle';
const basis = ADRES.replace(/\/[^/]*$/, '/');

const pas = [];
const ok = (naam, goed, extra = '') => pas.push((goed ? 'OK   ' : 'FAIL ') + naam + (goed ? '' : ' :: ' + String(extra).slice(0, 220)));

const grondtekst = await (await fetch(basis + 'config.js?t=' + Date.now())).text();
const api = (grondtekst.match(/api\s*:\s*(['"])([^'"]*)\1/) || [])[2] || '';
if (!api) {
  console.log('overgeslagen: config.js heeft geen api, dus er is niets te syncen');
  process.exit(0);
}
// Deze controle schrijft: altijd in een wegwerpkamer, nooit die van de trip.
const LEZEN = process.argv.includes('alleen-lezen');
// De lokale testserver is niet de live-omgeving: daar mag deze controle op
// schrijven. Tegen een echte API wordt alleen in een wegwerpkamer geschreven.
const LOKAAP = /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(new URL(api, ADRES).origin);
const kamer = LEZEN ? (grondtekst.match(/room\s*:\s*(['"])([^'"]*)\1/) || [])[2] || '' : KAMER;
const body = Buffer.from(
  grondtekst.replace(/room\s*:\s*(['"])[^'"]*\1/, "room: '" + kamer + "'"),
  'utf8',
).toString('base64');

const versie = await (await fetch(`${DEBUG}/json/version`)).json();
const socket = new WebSocket(versie.webSocketDebuggerUrl);
await new Promise((klaar, fout) => { socket.onopen = klaar; socket.onerror = fout; });
let nummer = 0;
const wachtend = new Map();
const fouten = [];
const geblokkeerd = new Set();
const pogingen = [];
socket.onmessage = bericht => {
  const frame = JSON.parse(bericht.data);
  if (frame.id && wachtend.has(frame.id)) {
    const { klaar, fout } = wachtend.get(frame.id);
    wachtend.delete(frame.id);
    if (frame.error) fout(new Error(JSON.stringify(frame.error)));
    else klaar(frame.result);
    return;
  }
  if (frame.method === 'Fetch.requestPaused') {
    const { requestId, request } = frame.params;
    if (LEZEN && request.method === 'PUT') {
      geblokkeerd.add(requestId);
      pogingen.push('poging tot doorsturen, geblokkeerd door alleen-lezen');
      stuur('Fetch.failRequest', { requestId, errorReason: 'Aborted' }, frame.sessionId).catch(() => {});
      return;
    }
    const roep = /config\.js/.test(request.url)
      ? stuur('Fetch.fulfillRequest', { requestId, responseCode: 200, responseHeaders: [{ name: 'content-type', value: 'application/javascript' }], body }, frame.sessionId)
      : stuur('Fetch.continueRequest', { requestId }, frame.sessionId);
    roep.catch(() => {});
    return;
  }
  if (frame.method === 'Network.loadingFailed' && /XHR|Fetch/.test(frame.params.type || '') && !geblokkeerd.has(frame.params.requestId)) {
    fouten.push(`netwerk: ${frame.params.errorText}`);
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
await stuur('Fetch.enable', { patterns: LEZEN ? [{ urlPattern: '*config.js*', requestStage: 'Request' }, { urlPattern: '*state?*', requestStage: 'Request' }] : [{ urlPattern: '*config.js*', requestStage: 'Request' }] }, sessionId);
const waarde = async code => {
  const antwoord = await stuur('Runtime.evaluate', { expression: code, awaitPromise: true, returnByValue: true }, sessionId);
  if (antwoord.exceptionDetails) return 'FOUT: ' + (antwoord.exceptionDetails.exception?.description || antwoord.exceptionDetails.text);
  return antwoord.result?.value;
};
const wacht = ms => new Promise(d => setTimeout(d, ms));

await stuur('Page.navigate', { url: ADRES }, sessionId);
for (let i = 0; i < 80 && (await waarde('typeof window.GalwaySync').catch(() => 'nee')) !== 'object'; i += 1) await wacht(150);
ok('sync staat aan', await waarde('String(GalwaySync.enabled)') === 'true');
const bediende = String(await waarde('String(GalwaySync.room)'));
const magSchrijven = LEZEN || LOKAAP || bediende === kamer;
ok(LEZEN ? 'deze controle leest alleen' : (LOKAAP ? 'schrijven mag op de lokale testserver' : 'deze controle praat met de wegwerpkamer'), magSchrijven, `${bediende} via ${LOKAAP ? 'lokale testserver' : 'echte api'}`);
if (!magSchrijven) {
  console.log('afgebroken: de pagina schrijft naar kamer "' + bediende + '" op een echte api; deze controle schrijft alleen in een wegwerpkamer');
  console.log('oplossing: draai hem tegen de lokale testserver, of met het woord alleen-lezen.');
  await stuur('Target.closeTarget', { targetId });
  socket.close();
  process.exit(1);
}

// 1. Haal de kamer op zoals de app dat doet.
const gehaald = await waarde(`(async function(){try{const antwoord=await fetch(GALWAY_CONFIG.api+'/state?room='+GALWAY_CONFIG.room,{headers:{'x-galway-key':GALWAY_CONFIG.key}});return antwoord.status+'|'+Object.keys((await antwoord.json()).state||{}).length}catch(f){return '_weigering_'+f.name+': '+f.message}})()`);
ok('ophalen uit de kamer lukt', /^\d\d\d\|\d+$/.test(String(gehaald)), gehaald);

// 2. De preflight: de browser mag het antwoord niet verwerpen.
const vooraf = await waarde(`(async function(){try{const antwoord=await fetch(GALWAY_CONFIG.api+'/state?room='+GALWAY_CONFIG.room,{method:'OPTIONS',headers:{'access-control-request-method':'PUT','access-control-request-headers':'content-type,x-galway-key'}});return antwoord.status}catch(f){return '_weigering_'+f.message}})()`);
ok('verkennend verzoek wordt aangenomen', Number(vooraf) >= 200 && Number(vooraf) < 300, vooraf);

// 3. De app zelf: trek, duw een eigen wijziging, kijk of de revisie meegaat.
await waarde('GalwaySync.pull()');
await wacht(2500);
const eerste = await waarde("JSON.stringify({status:GalwaySync.status(),rev:GalwaySync.revision()})");
ok('trekken geeft geen foutmelding', !String(eerste).includes('mislukt'), eerste);
if (!LEZEN) {
  await waarde("Galway.state.notes.push(Galway.item({text:'controle-duwtje ' + Date.now()}));Galway.save();");
  await wacht(6000);
}
const tweede = await waarde("JSON.stringify({status:GalwaySync.status(),rev:GalwaySync.revision()})");
const revs = [eerste, tweede].map(s => Number((String(s).match(/"rev":(\d+)/) || [0, 0])[1]));
ok('doorsturen van een wijziging lukt', LEZEN || (!String(tweede).includes('mislukt') && revs[1] > 0), `${eerste} -> ${tweede}`);
const badge = String(await waarde("(document.getElementById('galway-sync')||{}).textContent||''"));
ok('het badge meldt geen ramp', !/mislukt/i.test(badge), badge);

console.log(`synccontrole op ${ADRES} tegen kamer '${kamer}'`);
for (const regel of pas) console.log(regel);
if (fouten.length) console.log('opgemerkte netwerkfouten:\n' + fouten.slice(0, 4).map(f => '  ' + f).join('\n'));
const mislukt = pas.some(r => r.startsWith('FAIL')) || fouten.length > 0;
console.log(mislukt ? '\nsync mankeert iets' : '\nsync akkoord');
await stuur('Target.closeTarget', { targetId });
socket.close();
process.exit(mislukt ? 1 : 0);
