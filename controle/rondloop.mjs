// Rondloop: ga in de echte browser door elke tab en elke subpagina en klik de
// belangrijke knoppen; geen fouten in de console en overal inhoud.
// Uitvoeren zoals in controle/ontwerp.mjs beschreven; `node controle/rondloop.mjs`
// of `node controle/rondloop.mjs https://…/index.html blokkeer` (sync uit).
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
  } else if (frame.method === 'Log.entryAdded' && frame.params.entry.level === 'error') {
    fouten.push(`${frame.params.entry.text} ${frame.params.entry.url || ''}`.trim());
  }
};
const stuur = (method, params = {}, sessionId) => new Promise((klaar, fout) => {
  nummer += 1;
  wachtend.set(nummer, { klaar, fout });
  socket.send(JSON.stringify({ id: nummer, method, params, ...(sessionId ? { sessionId } : {}) }));
});

const { targetId } = await stuur('Target.createTarget', { url: 'about:blank' });
const { sessionId } = await stuur('Target.attachToTarget', { targetId, flatten: true });
await stuur('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true }, sessionId);
await stuur('Page.enable', {}, sessionId);
await stuur('Runtime.enable', {}, sessionId);
await stuur('Log.enable', {}, sessionId);
await stuur('Network.enable', {}, sessionId);
if (process.argv[3] === 'blokkeer') await stuur('Network.setBlockedURLs', { urls: ['*lambda-url*'] }, sessionId);
const waarde = async code => {
  const antwoord = await stuur('Runtime.evaluate', { expression: code, awaitPromise: true, returnByValue: true }, sessionId);
  if (antwoord.exceptionDetails) return 'FOUT: ' + (antwoord.exceptionDetails.exception?.description || antwoord.exceptionDetails.text);
  return antwoord.result?.value;
};
await stuur('Page.navigate', { url: ADRES }, sessionId);
for (let i = 0; i < 60 && (await waarde('typeof window.Galway').catch(() => 'nee')) !== 'object'; i += 1) await new Promise(d => setTimeout(d, 150));

await waarde(`(function(){const s=Galway.state;if(!s.players||s.players.length<2){s.players=['Fenna','Davy'].map(n=>Galway.item({name:n}));Galway.save();}localStorage.setItem('galway-current-player',s.players[0].id);Galway.render();return 'klaar'})()`);

const pas = [];
const check = (naam, code, voorwaarde) => {
  const uitkomst = voorwaarde;
  pas.push((uitkomst === true ? 'OK   ' : 'FAIL ') + naam + (uitkomst === true ? '' : ' :: ' + String(uitkomst).slice(0, 160)));
  return waarde(code).then(() => {});
};

const pagina = async (stap, noem, voorwaarde) => {
  const uitkomst = await waarde(stap);
  const inhoud = await waarde('document.getElementById("app").textContent.replace(/\\s+/g," ").trim().slice(0,90)');
  const lang = await waarde('document.getElementById("app").textContent.trim().length');
  const ok = typeof inhoud === 'string' && !String(uitkomst).startsWith('FOUT') && voorwaarde(inhoud, lang);
  pas.push((ok ? 'OK   ' : 'FAIL ') + noem + (ok ? '' : ' :: ' + String(inhoud).slice(0, 130)));
};

for (const tab of ['Home', 'Pubs', 'Pubopdrachten', 'Challenges', 'Vragen', 'Bingo', 'Meer']) {
  await pagina(`go('${tab}');'ok'`, `tab ${tab}`, (inhoud, lang) => lang > 40 && !/undefined|NaN|\[object/.test(inhoud));
}

const subStappen = ['Vandaag & planning', 'Fotoalbum', 'Uitgaven', 'Wrapped', 'Handige info', 'Spelers', 'Back-up', 'Scores', 'Configuratie', 'Wedstryd'];
for (const naam of subStappen) {
  await pagina(`sub('${naam}');'ok'`, `meer ${naam}`, (inhoud, lang) => lang > 30 && !/undefined|NaN|\[object/.test(inhoud));
}

await waarde("sub('Wedstryd');if(!Galway.state.duels||!Galway.state.duels.length)duelNew();'ok'");
const duelId = await waarde('Galway.state.duels.at(-1).id');
await waarde(`duelOpen('${duelId}');duelRound('${duelId}','trivia');Galway.render();'ok'`);
const ronde = await waarde(`(function(){var r=Galway.state.duels.at(-1).slagen.at(-1);return r.type+':'+((r.opties||[]).length||(r.woord?'woord':r.spel?'kaart':'anders'))})()`);
pas.push((/^trivia:[1-9]/.test(ronde) ? 'OK   ' : 'FAIL ') + `wedstrijdronde ${ronde}`);
const voorKeuze = await waarde(`document.querySelectorAll('#app button[onclick^="duelChoose"]').length`);
pas.push((voorKeuze >= 2 ? 'OK   ' : 'FAIL ') + `antwoordkeuzes op scherm: ${voorKeuze}`);
await waarde(`(function(){var b=document.querySelector('#app button[onclick^="duelChoose"]');if(b)b.click();return 'geklikt'})()`);
const spelerKnop = await waarde(`document.querySelector('#app button[onclick^="duelWin"]')?document.querySelector('#app button[onclick^="duelWin"]').textContent:'geen'`);
pas.push((/wint de ronde$/.test(spelerKnop) ? 'OK   ' : 'FAIL ') + `juryknop: ${spelerKnop}`);
await waarde(`duelWin('${duelId}',Galway.state.duels.at(-1).spelers[0]);Galway.render();'ok'`);
const geschiedenis = await waarde('document.getElementById("app").textContent.includes("Recent")');
pas.push((geschiedenis ? 'OK   ' : 'FAIL ') + 'ronde staat in de geschiedenis');

const draaien = await waarde(`(function(){go('Challenges');var b=document.querySelector('#slot-spin');if(!b)return 'geen knop';b.click();return 'geklikt'})()`);
await new Promise(d => setTimeout(d, 900));
const raam = await waarde('document.querySelector(".slot-window")?document.querySelector(".slot-window").textContent.trim().slice(0,40):"geen raam"');
pas.push((typeof raam === 'string' && raam.length > 4 && !/Klaar voor de craic/.test(raam) ? 'OK   ' : 'FAIL ') + `slot draaide (${draaien}): ${raam}`);

const wiel = await waarde(`(function(){go('Rad');return new Promise(function(d){setTimeout(function(){var c=document.querySelector('.wheel');d(c?c.width+'x'+c.height:'geen canvas')},250)})})()`);
pas.push((/^\d+x[1-9]/.test(wiel) ? 'OK   ' : 'FAIL ') + `wiel tekent: ${wiel}`);

const akties = await waarde(`(function(){go('Pubs');var rij=document.querySelector('#app section.card');var knopen=[...rij.querySelectorAll('.ico-btn')];editPub(S.pubs[0].id);var sluit=document.querySelector('#modal .spread button');var meting=sluit.getBoundingClientRect();var uit={tellen:knopen.length,aria:knopen.map(b=>b.getAttribute('aria-label')).join('|'),svg:rij.querySelectorAll('svg.ico').length,sluitSvg:sluit.querySelectorAll('svg.ico').length,sluitNaam:sluit.getAttribute('aria-label')||'',vierkant:meting.width>=40&&meting.height>=40};closeModal();return JSON.stringify(uit)})()`).then(JSON.parse);
const aktiesOk = akties.tellen === 2 && akties.svg === 2 && akties.sluitSvg === 1 && akties.sluitNaam === 'Sluiten' && akties.vierkant;
pas.push((aktiesOk ? 'OK   ' : 'FAIL ') + `pub-akties: ${akties.svg} iconen (${akties.aria}), modal sluiten ${akties.sluitSvg}x "${akties.sluitNaam}"`);

const vragenStap = await waarde(`(async function(){go('Vragen');var kies=document.querySelector('#app select');var rubrieken=kies?[...kies.options].map(o=>o.textContent.trim()).filter(Boolean):[];var knop=document.getElementById('question-spin');if(knop)knop.click();await new Promise(function(d){setTimeout(d,1600)});var tekst=(document.getElementById('question')||{}).textContent||'';return JSON.stringify({rubrieken:rubrieken,tekst:tekst,gekend:Object.values(qsets).flat().indexOf(tekst)>=0})})()`).then(JSON.parse);
const vragenGoed = vragenStap.rubrieken.includes('Kroegpraat') && !vragenStap.rubrieken.some(r => /Grappig|Controversie|Spicy/i.test(r)) && vragenStap.gekend;
pas.push((vragenGoed ? 'OK   ' : 'FAIL ') + `vragenpagina: ${vragenStap.rubrieken.length} rubrieken (${vragenStap.rubrieken.slice(0, 3).join(', ')}…), vraag "${vragenStap.tekst.slice(0, 46)}"`);

const verbinding = await waarde(`(function(){var c=window.GALWAY_CONFIG||{};return JSON.stringify({api:c.api||'',ruimte:c.room||'',sleutel:!!c.key})})()`).then(JSON.parse);
if (process.argv[3] === 'blokkeer') {
  pas.push((/^https:\/\/.+lambda-url/.test(verbinding.api) && verbinding.sleutel && !!verbinding.ruimte ? 'OK   ' : 'FAIL ') + `productieconfig: ${verbinding.api.slice(0, 44)}… ruimte ${verbinding.ruimte}`);
} else {
  const status = await waarde(`fetch((window.GALWAY_CONFIG||{}).api+'/state?room='+encodeURIComponent((window.GALWAY_CONFIG||{}).room||'galway'),{headers:{'x-galway-key':(window.GALWAY_CONFIG||{}).key||''}}).then(r=>r.status)`);
  pas.push((status === 200 || status === 404 ? 'OK   ' : 'FAIL ') + `sync api antwoordde met ${status}`);
}

console.log(pas.join('\n'));
const opvallend = [...new Set(fouten)].filter(regel => !/navigator\.vibrate/.test(regel));
console.log(opvallend.length ? '\nconsole:\n' + opvallend.join('\n') : '\nconsole schoon');
console.log(pas.some(l => l.startsWith('FAIL')) || opvallend.length ? '\n>>> iets mankeert' : '\nniks mankeert');
socket.close();
process.exit(0);
