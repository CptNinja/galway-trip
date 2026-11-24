// Ontwerpaudit: meet de berekende stijl van de echte app in Chrome en toetst
// die aan de dertien eisen uit DESIGN.md. Schermafdrukken: controle/scherm/.
//
//   "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new \
//     --remote-debugging-port=9333 --user-data-dir=/tmp/galway-chrome &
//   python3 lokale_testserver.py --port 8765 --no-browser &
//   node controle/ontwerp.mjs                                   # lokaal
//   node controle/ontwerp.mjs https://…/index.html blokkeer     # live, sync uit
const DEBUG = 'http://127.0.0.1:9333';
const ADRES = process.argv[2] || 'http://127.0.0.1:8765/index.html';

const audit = `(() => {
  const px = waarde => parseFloat(waarde) || 0;
  const helderheid = ([r, g, b]) => {
    const line = c => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
    return 0.2126 * line(r) + 0.7152 * line(g) + 0.0722 * line(b);
  };
  const kleuren = [];
  const rgb = waarde => (waarde.match(/[\\d.]+/g) || []).slice(0, 3).map(Number);
  const dekking = (voor, achter) => {
    const a = helderheid(rgb(getComputedStyle(voor).color));
    const b = helderheid(rgb(achter));
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  };
  const rug = el => {
    for (let node = el; node; node = node.parentElement) {
      const achter = getComputedStyle(node).backgroundColor;
      if (achter && !achter.includes('rgba(0, 0, 0, 0)')) return achter;
    }
    return 'rgb(10, 31, 24)';
  };
  const zichtbaar = el => {
    const stijl = getComputedStyle(el);
    return stijl.display !== 'none' && stijl.visibility !== 'hidden' && el.getClientRects().length > 0;
  };
  const tekst = [...document.body.querySelectorAll('body, h1, h2, h3, p, li, small, b, span, button, label, a, td, input, option')]
    .filter(el => zichtbaar(el) && [...el.childNodes].some(k => k.nodeType === 3 && k.textContent.trim()));
  const regels = [];
  for (const blad of document.styleSheets) {
    let lijsten;
    try { lijsten = blad.cssRules; } catch { continue; }
    for (let i = 0; i < lijsten.length; i += 1) regels.push(lijsten[i].cssText);
  }
  const heleboel = regels.join('\\n');
  const cards = [...document.querySelectorAll('.card,.hero')].filter(zichtbaar);
  const knopen = [...document.querySelectorAll('button,.button')].filter(zichtbaar);
  const navigatie = document.querySelector('nav');
  const kop = document.querySelector('header small');
  const kaartenMetVerloop = cards.filter(el => getComputedStyle(el).backgroundImage !== 'none' && getComputedStyle(el).backgroundImage.includes('gradient'));
  const kaartenMetSchaduw = cards.filter(el => getComputedStyle(el).boxShadow !== 'none');
  const watermerken = [...document.querySelectorAll('body, header, .hero, .card')].filter(el => {
    const voor = getComputedStyle(el, '::before').content + getComputedStyle(el, '::after').content;
    return /[\\u{1F300}-\\u{1FAFF}\\u{2600}-\\u{27BF}]/u.test(voor.replace(/url\\([^)]*\\)/g, ''));
  });
  const kleineTekst = tekst.filter(el => px(getComputedStyle(el).fontSize) < 11.5).map(el => el.tagName + ' ' + px(getComputedStyle(el).fontSize) + 'px ' + el.textContent.trim().slice(0, 24));
  const krap = knopen.filter(el => el.getBoundingClientRect().height < 40).map(el => (el.textContent.trim().slice(0, 20) || el.id || 'knop') + ' ' + Math.round(el.getBoundingClientRect().height) + 'px');
  const leeg = knopen.filter(el => !(el.getAttribute('aria-label') || el.getAttribute('title') || el.textContent).trim()).map(el => (el.className || el.id || 'knop') + ' in ' + (el.closest('section,header,nav,#modal')?.className || el.closest('section,header,nav,#modal')?.tagName || '?'));
  const onheleIconen = [...document.querySelectorAll('.ico-btn')].filter(el => { const icoon = el.querySelector('svg.ico'); return !icoon || px(getComputedStyle(icoon).width) < 14 || !(el.getAttribute('aria-label') || '').trim(); }).map(el => el.className + ' ' + Math.round(el.getBoundingClientRect().width) + 'px');
  const kontrast = {};
  const body = document.body;
  const kaart = document.querySelector('.card') || body;
  const over = document.querySelector('.muted') || kaart;
  kontrast.tekst = +dekking(body, rug(body)).toFixed(2);
  kontrast.muted = +dekking(over, rug(over)).toFixed(2);
  const goud = document.querySelector('.tag');
  if (goud) kontrast.label = +dekking(goud, rug(goud)).toFixed(2);
  const knop = [...document.querySelectorAll('button')].find(el => zichtbaar(el) && getComputedStyle(el).backgroundColor.includes('227'));
  if (knop) kontrast.knop = +dekking(knop, rug(knop)).toFixed(2);
  const tab = document.querySelector('nav button');
  if (tab) kontrast.tab = +dekking(tab, rug(tab)).toFixed(2);
  return {
    kop: (document.querySelector('h1') || {}).textContent || '',
    verloopInKaarten: kaartenMetVerloop.length,
    schaduwInKaarten: kaartenMetSchaduw.length,
    achtergrondVerloop: getComputedStyle(body).backgroundImage !== 'none' && getComputedStyle(body).backgroundImage.includes('gradient'),
    watermerken: watermerken.length,
    vervaagdeNavigatie: navigatie ? /[1-9]/.test(getComputedStyle(navigatie).backdropFilter || '') : false,
    navigatieTekstpunt: tab ? px(getComputedStyle(tab).fontSize) : 0,
    hoofdletterKop: kop ? getComputedStyle(kop).textTransform + '/' + getComputedStyle(kop).letterSpacing : '',
    focusRegel: /:focus-visible/.test(heleboel),
    verminderBeweging: /prefers-reduced-motion/.test(heleboel),
    krimpendeKnop: /:active[^{]*\\{[^}]*scale/.test(heleboel),
    pulsatie: /animation[^;]*\\binfinite\\b/.test(heleboel),
    kleineTekst: kleineTekst.slice(0, 5),
    krappeKnopen: krap.slice(0, 5),
    knoppenZonderNaam: leeg.slice(0, 5),
    iconenOnvolledig: onheleIconen.slice(0, 5),
    kontrast,
    horizontaal: document.documentElement.scrollWidth > window.innerWidth + 1,
  };
})()`;

const seed = `(function(){
  if (!window.Galway) return 'geen brug';
  const state = Galway.state;
  if (!state.players || state.players.length < 3) {
    const namen = ['Fenna', 'Davy', 'Sien'];
    state.players = namen.map(naam => Galway.item({ name: naam }));
    const [a, b, c] = state.players;
    state.transactions = [
      Galway.item({ playerId: a.id, points: 30, reason: 'Wedstryd gewonnen van Davy', source: 'duel:x' }),
      Galway.item({ playerId: b.id, points: 10, reason: 'Wedstryd verloren van Fenna', source: 'duel:x' }),
      Galway.item({ playerId: c.id, points: 45, reason: 'Bingo gehaald', source: 'bingo' }),
    ];
    Galway.save();
  }
  localStorage.setItem('galway-current-player', state.players[0].id);
  Galway.render();
  return 'klaar';
})()`;

const version = await (await fetch(`${DEBUG}/json/version`)).json();
const socket = new WebSocket(version.webSocketDebuggerUrl);
await new Promise((done, fail) => { socket.onopen = done; socket.onerror = fail; });

let id = 0;
const waiting = new Map();
const errors = [];
socket.onmessage = message => {
  const frame = JSON.parse(message.data);
  if (frame.id && waiting.has(frame.id)) {
    const { done, fail } = waiting.get(frame.id);
    waiting.delete(frame.id);
    if (frame.error) fail(new Error(JSON.stringify(frame.error)));
    else done(frame.result);
  } else if (frame.method === 'Runtime.exceptionThrown') {
    errors.push(frame.params.exceptionDetails.exception?.description || frame.params.exceptionDetails.text);
  } else if (frame.method === 'Log.entryAdded' && frame.params.entry.level === 'error') {
    errors.push(`${frame.params.entry.text} ${frame.params.entry.url || ''}`.trim());
  }
};
const send = (method, params = {}, sessionId) => new Promise((done, fail) => {
  id += 1;
  waiting.set(id, { done, fail });
  socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
});
const evaluate = async code => {
  const answer = await send('Runtime.evaluate', { expression: code, awaitPromise: true, returnByValue: true }, sessionId);
  if (answer.exceptionDetails) throw new Error(answer.exceptionDetails.exception?.description || answer.exceptionDetails.text);
  return answer.result?.value;
};

const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true }, sessionId);
await send('Page.enable', {}, sessionId);
await send('Runtime.enable', {}, sessionId);
await send('Log.enable', {}, sessionId);
await send('Network.enable', {}, sessionId);
if (process.argv[3] === 'blokkeer') await send('Network.setBlockedURLs', { urls: ['*lambda-url*'] }, sessionId);
await send('Page.navigate', { url: ADRES }, sessionId);
for (let poging = 0; poging < 60 && (await evaluate('typeof window.Galway').catch(() => 'nee')) !== 'object'; poging += 1) {
  await new Promise(done => setTimeout(done, 150));
}
await evaluate(seed);

const pagina = async (noem, code, bestandsnaam) => {
  await evaluate(code);
  await new Promise(done => setTimeout(done, 120));
  const rapport = await evaluate(audit);
  const shot = await send('Page.captureScreenshot', { format: 'png' }, sessionId);
  const { writeFileSync, mkdirSync } = await import('node:fs');
  mkdirSync(new URL('scherm/', import.meta.url).pathname, { recursive: true });
  writeFileSync(new URL('scherm/' + bestandsnaam, import.meta.url).pathname, Buffer.from(shot.data, 'base64'));
  return { noem, ...rapport };
};

const rapporten = [
  await pagina('Thuis', 'go("Home");"ok"', 'na-thuis.png'),
  await pagina('Pubs', 'go("Pubs");"ok"', 'na-pubs.png'),
  await pagina('Challenges', 'go("Challenges");"ok"', 'na-challenges.png'),
  await pagina('Meer', 'go("Meer");"ok"', 'na-meer.png'),
  await pagina('Wedstryd', 'sub("Wedstryd");if(!Galway.state.duels||!Galway.state.duels.length)duelNew();var d=Galway.state.duels.at(-1).id;duelRound(d,"trivia");"ok"', 'na-wedstryd.png'),
  await pagina('Bingo', 'go("Bingo");"ok"', 'na-bingo.png'),
];

const eisen = rapport => [
  ['geen kleurverloop in kaarten', rapport.verloopInKaarten === 0, rapport.verloopInKaarten],
  ['geen schaduw op kaarten', rapport.schaduwInKaarten === 0, rapport.schaduwInKaarten],
  ['geen gloed op de achtergrond', !rapport.achtergrondVerloop, rapport.achtergrondVerloop],
  ['geen emoji-watermerken', rapport.watermerken === 0, rapport.watermerken],
  ['geen vervaagde navigatie', !rapport.vervaagdeNavigatie, rapport.vervaagdeNavigatie],
  ['navigatie ≥ 12px', rapport.navigatieTekstpunt >= 11.5, rapport.navigatieTekstpunt],
  ['kop zonder hoofdletterverrekking', rapport.hoofdletterKop === 'none/normal', rapport.hoofdletterKop],
  ['focusring gedefinieerd', rapport.focusRegel, rapport.focusRegel],
  ['beweging is uit te zetten', rapport.verminderBeweging, rapport.verminderBeweging],
  ['knoppen krimpen niet', !rapport.krimpendeKnop, rapport.krimpendeKnop],
  ['geen oneindige animaties', !rapport.pulsatie, rapport.pulsatie],
  ['geen tekst onder 12px', rapport.kleineTekst.length === 0, rapport.kleineTekst.join(', ')],
  ['tikdoelen ≥ 40px', rapport.krappeKnopen.length === 0, rapport.krappeKnopen.join(', ')],
  ['geen knop zonder naam', rapport.knoppenZonderNaam.length === 0, rapport.knoppenZonderNaam.join(', ')],
  ['iconen volledig en vernoemd', rapport.iconenOnvolledig.length === 0, rapport.iconenOnvolledig.join(', ')],
  ['contrast ≥ 4,5', Object.values(rapport.kontrast).every(waarde => waarde >= 4.5), JSON.stringify(rapport.kontrast)],
  ['past op het scherm', !rapport.horizontaal, rapport.horizontaal],
];

let fouten = 0;
for (const rapport of rapporten) {
  const gezegd = eisen(rapport).filter(([, ok]) => !ok);
  fouten += gezegd.length;
  console.log(`${rapport.noem.padEnd(11)} ${gezegd.length ? 'FAIL' : 'OK  '} ${gezegd.map(([naam, , waarde]) => `${naam}: ${waarde}`).join(' | ')}`);
}
const opvallend = [...new Set(errors)].filter(regel => !/navigator\.vibrate/.test(regel));
console.log(opvallend.length ? '\nconsole:\n' + opvallend.join('\n') : '\nconsole schoon');
console.log(fouten ? `\n>>> ${fouten} struikelblok(ken)` : '\nesthetiek akkoord');
socket.close();
process.exit(0);
