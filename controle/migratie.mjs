// Migratiecontrole: wat doet de inhoudsavlevering met een oud opgeslagen spel?
// Uitvoeren: node controle/migratie.mjs
import { maakVenster } from './namaak.mjs';

const pas = [];
const ok = (naam, goed, extra = '') => pas.push((goed ? 'OK   ' : 'FAIL ') + naam + (goed ? '' : ' :: ' + String(extra).slice(0, 240)));

// 1. Vers spel: de app draait voor het eerst op een telefoon.
const vers = maakVenster();
const vragenVers = vers.run('S.questions.length');
const kaartenVers = vers.run('S.pubDeck.length');
ok('vers spel krijgt de kuratiete vragen', vragenVers >= 240, vragenVers);
ok('vers spel krijgt de kuratiete kaarten', kaartenVers === 200, kaartenVers);

// 2. Oud spel: machinereeksen, eigen tekst, afgewerkte kaarten.
const oud = vers.opgeslagen();
oud.questions.push(
  { id: 'question-v3-7', updatedAt: 1, category: 'Grappig', text: 'Wat is je meest nutteloze talent?', used: true },
  { id: 'question-v6-9', updatedAt: 1, category: 'Spicy', text: 'Beschrijf een vakantiefilm als een natuurdocumentaire in één zin.', used: false },
  { id: 'question-v1-2', updatedAt: 1, category: 'Deep', text: 'Waar ben je het meest dankbaar voor?', used: false },
  { id: 'question-a1b2c3', updatedAt: 1, category: 'Grappig', text: 'Oud gezaaid: wat is je lievelingskroeg?', used: false },
  { id: 'question-eigen2', updatedAt: 1, category: 'Kroegpraat', text: 'Eigen vraag in een kuratiete rubriek', used: false },
  { id: 'question-eigen', updatedAt: 1, category: 'Eigen vragen', text: 'Vraag van eigen maak: wie pakt de rekening?', used: false },
);
oud.pubDeck.push(
  { id: 'pubchallenge-v3-1', updatedAt: 1, category: 'Acteren', title: 'Houd een dankwoord van 15 seconden voor een onzichtbare trofee.', seen: true, hidden: false, completed: true, points: 2 },
  { id: 'pubchallenge-v6-2', updatedAt: 1, category: 'Muziek', title: 'Neurie drie seconden en laat de groep raden.', seen: false, hidden: false, completed: false, points: 2 },
  { id: 'pubchallenge-eigen', updatedAt: 1, category: 'Eigen', title: 'Eigen kaart: wie haalt de noten.', seen: false, hidden: false, completed: false, points: 2 },
);
delete oud.pubDeck[0];
oud.pubDeck = oud.pubDeck.filter(Boolean);
oud.updatedAt = 12345;

const geupgrade = maakVenster({ voorlop: oud });
const na = () => ({ vragen: geupgrade.run('S.questions'), kaarten: geupgrade.run('S.pubDeck') });
const nadat = na();
const kuratie = new Set(geupgrade.run('Object.values(qsets).flat()'));
ok('machinaal gemaakte vragen zijn weg', !nadat.vragen.some(q => /^(question|vraag)-v\d+-\d+$/.test(q.id) && !kuratie.has(q.text)),
  nadat.vragen.filter(q => /^(question|vraag)-v\d+-\d+$/.test(q.id) && !kuratie.has(q.text)).map(q => q.text).slice(0, 3).join(' | '));
ok('eigen vraag blijft staan', nadat.vragen.some(q => q.text === 'Vraag van eigen maak: wie pakt de rekening?'));
ok('eigen vraag in een kuratiete rubriek blijft staan', nadat.vragen.some(q => q.text === 'Eigen vraag in een kuratiete rubriek'));
ok('oud gezaaide vraag met los id is weg', !nadat.vragen.some(q => q.text.startsWith('Oud gezaaid:')), nadat.vragen.filter(q => q.text.startsWith('Oud gezaaid:')).length);
ok('oude rubrieken zijn uit het spel', !nadat.vragen.some(q => /Grappig|Spicy|Deep|Diep|Controversie|Friendship/i.test(q.category)), [...new Set(nadat.vragen.map(q => q.category))].join(', '));
ok('kuratiete vragen staan er precies één keer', new Set(nadat.vragen.map(q => q.text)).size === nadat.vragen.length, nadat.vragen.length);
ok('kuratiete vragen volledig', nadat.vragen.length >= 240, nadat.vragen.length);
ok('oudere machinereeksen uit de kaarten weg', !nadat.kaarten.some(c => /^pubchallenge-v3-|^pubchallenge-v6-/.test(c.id)), nadat.kaarten.filter(c => /^pubchallenge-v[36]-/.test(c.id)).length);
ok('eigen kaart blijft staan', nadat.kaarten.some(c => c.title === 'Eigen kaart: wie haalt de noten.'));
ok('kuratiete kaarten volledig en uniek', nadat.kaarten.filter(c => /^pubchallenge-v4-/.test(c.id)).length === 200 && new Set(nadat.kaarten.map(c => c.title)).size === nadat.kaarten.length, nadat.kaarten.length);
ok('rubrieken in de keuzelijst zijn de nieuwe', geupgrade.run("questionsPage().includes('Kroegpraat') && !questionsPage().includes('Controversie')"), geupgrade.run('Object.keys(qsets).join(", ")'));
const vraagPoging = (() => { try { geupgrade.run("page='Vragen';nextQuestion();"); return null } catch (f) { return String((f && f.message) || f) } })();
ok('een vraag trekken gaat', vraagPoging === null, vraagPoging);
geupgrade.run("S.slotCurrent=S.pubDeck.find(c=>/^pubchallenge-v4-/.test(c.id)).id");
const kaart = String(geupgrade.run('S.pubDeck.find(c=>c.id===S.slotCurrent).title'));
const pagina = String(geupgrade.run("page='Challenges';slotPage()")).replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&');
ok('Challenge-pagina telt de echte stapel', /201 kaarten · 201 nog niet gezien/.test(pagina), pagina.replace(/\s+/g, ' ').match(/[^>]*kaarten[^<]*/)?.[0]);
ok('Challenge-pagina tekent een nieuwe kaart', pagina.includes(kaart) && !/onzichtbare trofee|neurie|talkshow/i.test(pagina), kaart.slice(0, 70));

// 3. Nogmaals starten mag niets veranderen.
const voorTwee = JSON.stringify(na().vragen) + JSON.stringify(na().kaarten);
const tijden = geupgrade.run('S.updatedAt');
geupgrade.run('inhoudV4()');
const naTwee = JSON.stringify(na().vragen) + JSON.stringify(na().kaarten);
ok('tweede start verandert niets aan de inhoud', voorTwee === naTwee, `${voorTwee.length} vs ${naTwee.length}`);
ok('tweede start schrijft het spel niet opnieuw', geupgrade.run('S.updatedAt') === tijden);

// 4. Derde start op het geupgrade spel: dezelfde aantallen.
const derde = maakVenster({ voorlop: geupgrade.opgeslagen() });
ok('derde start geeft dezelfde aantallen', derde.run('S.questions.length') === nadat.vragen.length && derde.run('S.pubDeck.length') === nadat.kaarten.length, `${derde.run('S.questions.length')} vragen, ${derde.run('S.pubDeck.length')} kaarten`);

for (const regel of pas) console.log(regel);
console.log(pas.some(r => r.startsWith('FAIL')) ? '\niets is niet goed' : '\nmigratie akkoord');
process.exit(pas.some(r => r.startsWith('FAIL')) ? 1 : 0);
