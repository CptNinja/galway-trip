// Wedstrijdcontrole: draai de echte app-script plus duels.js in een namaak-DOM
// en speel het volledige wedstrijdverloop af. Uitvoeren: node controle/wedstrijd.mjs
import { maakVenster } from './namaak.mjs';

const { run } = maakVenster();
const out = [];
const ok = (name, cond, extra = '') => out.push((cond ? 'OK   ' : 'FAIL ') + name + (cond ? '' : ' :: ' + String(extra).slice(0, 260)));

run("S.players.length=0;S.players.push(item({name:'Fenna'}),item({name:'Davy'}),item({name:'Sien'}));localStorage.setItem('galway-current-player',S.players[0].id);save();");

// 1. the page hangs off the Meer list
{ const p1 = run("more='Meer';morePage()"); console.log('HEEFT WEDSTRYD:', p1.includes('Wedstryd'), '| lengte', p1.length); console.log((p1.match(/<b>[^<]*<\/b>/g)||[]).join(' ')); }
let menu = run("more='Meer';morePage()");
ok('Meer-list noemt de wedstryd', /sub\('Wedstryd'\)/.test(menu) && menu.indexOf("sub('Wedstryd')") < menu.indexOf("sub('Scores')"), menu.match(/Wedstryd.{0,60}/)?.[0]);
run("more='Wedstryd'");
let page = run('morePage()');
ok('Wedstryd page renders', /De Wedstryd/.test(page) && /Nieuwe wedstryd/.test(page), page);

// 2. creating a duel pairs you with someone else and opens the board
run('duelNew()');
const duelId = run('Galway.state.duels[0].id');
const duo = run('JSON.stringify(Galway.state.duels[0].spelers)');
const [ik, ander] = JSON.parse(duo);
ok('jouw eigen naam staat vooraan', ik === run("localStorage.getItem('galway-current-player')"), duo);
ok('tegenstander is iemand anders', ander && ander !== ik, duo);
page = run('morePage()');
ok('bord toont beide namen', /Fenna/.test(page) && /(Davy|Sien)/.test(page), page);
ok('bord toont alle rondesoorten', (page.match(/duelRound\('/g) || []).length === 9, String((page.match(/duelRound\('/g) || []).length));

// 3. every round type generates complete, gapless content
for (const [type, check] of [
  ['trivia', r => r.opties.length === 4 && r.juist >= 0 && r.juist < 4],
  ['citaten', r => r.opties.length === 4 && r.opties.some(o => o === r.opties[r.juist])],
  ['drank', r => r.opties.length === 3 && r.prijzen[r.juist] === Math.max(...r.prijzen)],
  ['spellering', r => r.woord.length >= 10 && r.woord.length <= 20 && typeof r.hint === 'string'],
  ['proeven', r => r.paar.length === 2 && r.paar[0] !== r.paar[1] && typeof r.noot === 'string'],
  ['hitster', r => typeof r.opdracht === 'string' && r.opdracht.length > 10],
  ['frame', r => typeof r.titel === 'string' && /^\d+:\d\d$/.test(r.tijd)],
  ['kaart', r => r.spel && r.spel.naam && r.spel.eenTegenEen],
]) {
  run(`duelRound('${duelId}','${type}')`);
  const ronde = run('JSON.parse(JSON.stringify(Galway.state.duels[0].slagen.at(-1)))');
  const page2 = run('morePage()');
  ok(`${type}: inhoud compleet`, check(ronde), JSON.stringify(ronde));
  ok(`${type}: pagina zonder gaten`, !/undefined|\[object Object\]|NaN/.test(page2), page2.match(/.{0,90}(undefined|\[object Object\]|NaN).{0,40}/)?.[0]);
  run('Galway.state.duels[0].slagen.pop()');
}

// 3b. a won round shows up in the running score and history
run(`duelRound('${duelId}','trivia')`);
run(`duelWin('${duelId}','${ander}')`);
page = run('morePage()');
ok('winpartij verschijnt in de stand', /<b>Fenna 0 — 1 /.test(page), page.match(/<b>[^<]*—[^<]*<\/b>.{0,40}/)?.[0]);
ok('gewonnen ronde staat in de geschiedenis', /Recent[\s\S]*→ (Davy|Sien)/.test(page), page.match(/Recent.{0,160}/)?.[0]);

// 4. three round wins settles the duel
run('duelNew()');
const strijd = run('Galway.state.duels.at(-1).id');
const paar = JSON.parse(run('JSON.stringify(Galway.state.duels.at(-1).spelers)'));
for (let i = 0; i < 3; i += 1) run(`duelRound('${strijd}','trivia');duelWin('${strijd}','${paar[0]}')`);
const stand = JSON.parse(run('JSON.stringify({status:Galway.state.duels.at(-1).status})'));
ok('drie overwinningen maken de wedstrijd klaar', stand.status === 'klaar', JSON.stringify(stand));
const punts = JSON.parse(run(`JSON.stringify(Galway.state.transactions.filter(t=>t.source==='duel:${strijd}').map(t=>[t.playerId,t.points]))`));
ok('winnaar +30 en verliezer +10', punts.length === 2 && punts.some(t => t[0] === paar[0] && t[1] === 30) && punts.some(t => t[0] === paar[1] && t[1] === 10), JSON.stringify(punts));
page = run('morePage()');
ok('afrekening staat op het bord', /wint: \+30 punten/.test(page), page.slice(0, 700));

// 5. looking again must not pay out twice
run('morePage();morePage();duelFinish("' + strijd + '")');
ok('afrekenen gebeurt precies één keer', run(`Galway.state.transactions.filter(t=>t.source==='duel:${strijd}').length`) === 2, String(run(`Galway.state.transactions.filter(t=>t.source==='duel:${strijd}').length`)));

// 6. playing on after settlement clears the payout and re-earns it later
run(`duelRound('${strijd}','trivia')`);
const again = JSON.parse(run(`JSON.stringify({status:Galway.state.duels.at(-1).status,rest:Galway.state.transactions.filter(t=>t.source==='duel:${strijd}').length})`));
ok('verder spelen na afrekening wist de punten', again.status === 'lopend' && again.rest === 0, JSON.stringify(again));

// 7. tapping an answer reveals which one was right
run(`duelRound('${strijd}','trivia')`);
run(`var r=Galway.state.duels.at(-1).slagen.at(-1);duelChoose('${strijd}',r.id,0)`);
page = run('morePage()');
ok('antwoord tonen markeert het juiste', /· juist/.test(page), page.match(/.{0,200}juist.{0,40}/)?.[0]);

// 8. the spelling word hides itself again after the countdown
run(`duelWin('${strijd}','${paar[0]}');duelRound('${strijd}','spellering')`);
run(`duelShow('${strijd}')`);
page = run('morePage()');
const woord = run('Galway.state.duels.at(-1).slagen.at(-1).woord');
ok('spellering toont het woord', page.includes(woord), `${woord} / ${page.match(/.{0,120}spellen.{0,20}/)?.[0]}`);
run(`duelHide('${strijd}',Galway.state.duels.at(-1).slagen.at(-1).id)`);
page = run('morePage()');
ok('woord is weer weg', !page.includes(woord) && /Toon nog eens/.test(page), page.match(/spellen.{0,200}/)?.[0]);

// 9. a nasty name cannot inject markup
run("Galway.state.players[0].name='<img src=x onerror=boom()>';save()");
ok('naam met markup blijft onschuldig', true);
page = run('morePage()');
ok('spelernaam ontsmet', !/<img src=x/.test(page) && /&lt;img/.test(page), page.match(/.{0,120}onerror.{0,20}/)?.[0]);
run("Galway.state.players[0].name='Fenna';save()");

// 10. deleting a duel takes its points with it
run('duelNew()');
const second = run('Galway.state.duels.at(-1).id');
for (let i = 0; i < 3; i += 1) run(`duelRound('${second}','trivia');duelWin('${second}','${ik}')`);
run(`duelDelete('${second}')`);
const left = JSON.parse(run(`JSON.stringify({duels:Galway.state.duels.length,punten:Galway.state.transactions.filter(t=>t.source==='duel:${second}').length})`));
ok('wissen haalt wedstrijd én punten weg', left.duels === 2 && left.punten === 0, JSON.stringify(left));

// 11. the points explainer mentions the duel
ok('puntenticker legt de wedstryd uit', /Wedstryd/.test(run('pointsInfoPage()')), '');

// 12. the duel rides along in the sync payload as plain data
const gesynchroniseerd = run("JSON.parse(JSON.stringify(Galway.state.duels))");
ok('wedstrijden zijnsync-ready', Array.isArray(gesynchroniseerd) && gesynchroniseerd[0].updatedAt && gesynchroniseerd[0].slagen.every(s => s.updatedAt), JSON.stringify(gesynchroniseerd[0]).slice(0, 200));

console.log(out.join('\n'));
console.log(out.some(l => l.startsWith('FAIL')) ? '\n>>> SOMETHING FAILED' : '\nall good');
