// Inhoudscontrole: is elke vraag en opdracht echt anders, en geen machinerot?
// Gebruik: node controle/inhoud.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const html = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'index.html'), 'utf8');

// Haal de const op die met JSON.stringify in index.html gezet is (dubbele aanhalingstekens).
function haalOp(naam) {
  const starts = html.indexOf(`const ${naam}`);
  if (starts < 0) throw new Error(`"${naam}" staat niet in index.html`);
  const tekens = html.slice(starts);
  const open = tekens.search(/[{[]/);
  if (open < 0) throw new Error(`geen opening van "${naam}" gevonden`);
  let diepte = 0, slot = -1;
  for (let i = open; i < tekens.length; i++) {
    const teken = tekens[i];
    if ('{['.includes(teken)) diepte++;
    else if ('}]'.includes(teken)) { diepte--; if (!diepte) { slot = i; break } }
  }
  if (slot < 0) throw new Error(`"${naam}" niet afgesloten`);
  return JSON.parse(tekens.slice(open, slot + 1));
}

const qsets = haalOp('qsets');
const opdrachtenLijst = haalOp('PUB_CHALLENGES');
const vragen = Object.entries(qsets).flatMap(([rubriek, teksten]) => teksten.map(tekst => ({ rubriek, tekst })));
const opdrachten = opdrachtenLijst.map(([rubriek, tekst]) => ({ rubriek, tekst }));
const rota = /(als (het|de|een)[^ ]{0,14} aanwezig is|denkbeeldige|de magie van|ontdek \w+ (van|op)|connectie maken|in verbinding|herinneringen aan het|op een schaal van|schets een plan|denk aan een moment|in beeld met|als hij aanwezig is|als ze aanwezig zijn|drie emoji)/i;

const minimumVragen = 240;
const minimumOpdrachten = 200;
const rubriekenMetAntwoord = ['Ierland-kennis', 'Kennisquiz', 'Galway-feiten', 'Bier & drank'];
const emoji = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{2B50}]/u;

const falen = [];
const zeg = (ok, tekst) => { if (!ok) falen.push(tekst) };

function controleer(items, soort) {
  const aantallen = new Map();
  for (const { rubriek } of items) aantallen.set(rubriek, (aantallen.get(rubriek) || 0) + 1);
  console.log(`\n${soort}: ${items.length} stuks in ${aantallen.size} rubrieken`);
  for (const [rubriek, antal] of aantallen) console.log(`  ${rubriek.padEnd(18)} ${antal}`);
  const gezien = new Set();
  for (const { rubriek, tekst } of items) {
    zeg(typeof tekst === 'string' && tekst.length >= 14 && tekst.length <= 152, `${soort} buiten 14-152 tekens (${tekst.length}): ${String(tekst).slice(0, 46)}`);
    zeg(!emoji.test(tekst), `${soort} bevat een emoji: ${tekst.slice(0, 46)}`);
    zeg(!/\.{3}|…/.test(tekst), `${soort} heeft weglatingspunten: ${tekst.slice(0, 46)}`);
    zeg(!/\s{2,}/.test(tekst), `${soort} bevat dubbele spaties: ${tekst.slice(0, 46)}`);
    zeg(!rota.test(tekst), `${soort} is machinerot: ${tekst.slice(0, 52)}`);
    zeg(!/[A-ZА-Я]{4,}/.test(tekst), `${soort} schreeuwt: ${tekst.slice(0, 46)}`);
    zeg(!gezien.has(tekst), `${soort} dubbel: ${tekst.slice(0, 52)}`);
    gezien.add(tekst);
  }
  const openers = new Map();
  for (const { rubriek, tekst } of items) {
    const kop = tekst.split(' ').slice(0, 3).join(' ').toLocaleLowerCase('nl').replace(/[^a-z0-9 &']/g, '');
    const sleutel = rubriek + '|' + kop;
    openers.set(sleutel, (openers.get(sleutel) || 0) + 1);
  }
  for (const [rubriek, antal] of aantallen) {
    const top = [...openers].filter(([sleutel]) => sleutel.startsWith(rubriek + '|')).sort((a, b) => b[1] - a[1])[0];
    if (!top) continue;
    zeg(top[1] / antal <= 0.5, `${soort}rubriek ${rubriek}: "${top[0].split('|')[1]}" opent ${top[1]} van de ${antal} items`);
  }
  return aantallen;
}

const vraagRubrieken = controleer(vragen, 'vragen');
const opdrachtRubrieken = controleer(opdrachten, 'opdrachten');

zeg(vragen.length >= minimumVragen, `te weinig vragen: ${vragen.length} < ${minimumVragen}`);
zeg(opdrachten.length >= minimumOpdrachten, `te weinig opdrachten: ${opdrachten.length} < ${minimumOpdrachten}`);
zeg(vragen.length <= 420, `terug naar templatetoestand: ${vragen.length} vragen`);
zeg(opdrachten.length <= 360, `terug naar templatetoestand: ${opdrachten.length} opdrachten`);

for (const [rubriek, aantal] of opdrachtRubrieken) {
  if (!rubriekenMetAntwoord.includes(rubriek)) continue;
  const metAntwoord = opdrachten.filter(o => o.rubriek === rubriek && /· Antwoord: .+/.test(o.tekst)).length;
  zeg(metAntwoord >= Math.ceil(aantal * 0.5), `rubriek ${rubriek} heeft te weinig antwoorden (${metAntwoord}/${aantal})`);
}
for (const rubriek of ['Ierland-kennis', 'Kennisquiz']) {
  const items = vragen.filter(v => v.rubriek === rubriek);
  const metAntwoord = items.filter(v => /· Antwoord: .+/.test(v.tekst)).length;
  zeg(items.length > 0 && metAntwoord === items.length, `vragenrubriek ${rubriek}: ${metAntwoord}/${items.length} met antwoord`);
}

for (const rest of ['EXTRA_QUESTIONS', 'V6_QUESTIONS', 'V6_CHALLENGES', 'addV6Content', 'contentVersion', 'question-v3', 'question-v6', 'pubchallenge-v3', 'pubchallenge-v6']) {
  zeg(!html.includes(rest), `rest van de oude machine-inhoud: ${rest}`);
}
zeg(/function inhoudV4\(\)\{/.test(html), 'de inhoudsmigratie (inhoudV4) ontbreekt');
zeg(/function vulInhoudAan\(\)\{/.test(html), 'vulInhoudAan ontbreekt');

console.log(falen.length ? '\n' + falen.slice(0, 25).map(f => '- ' + f).join('\n') + (falen.length > 25 ? `\n… en ${falen.length - 25} meer` : '') : '\ngeen inhoudsbezwaren');
process.exit(falen.length ? 1 : 0);
