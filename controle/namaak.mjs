// Namaak-DOM: de echte app-script draait in een nagebootst venster.
// Gebruikt door controle/wedstrijd.mjs en controle/migratie.mjs.
import fs from 'node:fs';
import vm from 'node:vm';

export const root = new URL('..', import.meta.url).pathname;
export const bronnen = () => ({
  html: fs.readFileSync(root + 'index.html', 'utf8'),
  script: fs.readFileSync(root + 'index.html', 'utf8').match(/<script>([\s\S]*?)<\/script>/)[1],
  duels: fs.readFileSync(root + 'duels.js', 'utf8'),
});

export function maakVenster({ voorlop = null, duels = true } = {}) {
  const { script, duels: duelbron } = bronnen();
  const storage = new Map();
  if (voorlop) storage.set('galway-state', JSON.stringify(voorlop));
  const el = () => ({
    innerHTML: '', textContent: '', value: '', className: '', hidden: false, dataset: {}, style: {}, scrollTop: 0, listeners: {},
    classList: { _s: new Set(), add(n) { this._s.add(n); }, remove(n) { this._s.delete(n); }, toggle(n) { this._s.has(n) ? this._s.delete(n) : this._s.add(n); }, contains(n) { return this._s.has(n); } },
    setAttribute() {}, appendChild() {}, show() {}, showModal() {}, close() {}, focus() {}, blur() {},
    addEventListener(t, f) { this.listeners[t] = f; }, querySelectorAll() { return []; }, querySelector() { return null; },
  });
  const knooppunten = new Map();
  const document = {
    getElementById(id) { if (!knooppunten.has(id)) knooppunten.set(id, el()); return knooppunten.get(id); },
    createElement: el,
    createDocumentFragment: el,
    querySelectorAll() { return []; },
    querySelector(sel) { return typeof sel === 'string' && sel.startsWith('#') ? this.getElementById(sel.slice(1)) : null; },
    addEventListener() {},
    body: el(),
    head: el(),
    documentElement: el(),
    visibilityState: 'visible',
  };
  const ctx = vm.createContext({
    console, Math, Date, JSON, Intl, URL,
    Blob: class { },
    setTimeout: () => 0, clearTimeout: () => { }, setInterval: () => 0, clearInterval: () => { },
    localStorage: { getItem: k => (storage.has(k) ? storage.get(k) : null), setItem: (k, v) => storage.set(k, String(v)), removeItem: k => storage.delete(k) },
    indexedDB: { open: () => ({ set onsuccess(f) { }, set onerror(f) { }, set onupgradeneeded(f) { } }) },
    document,
    location: { protocol: 'https:', href: 'https://x.example/', origin: 'https://x.example' },
    navigator: { serviceWorker: { register: () => Promise.resolve() }, vibrate: () => { }, onLine: true },
    fetch: () => Promise.reject(new Error('geen netwerk in de namaak')),
    confirm: () => true,
    alert: () => { },
    matchMedia: () => ({ matches: false, addEventListener() { } }),
    crypto: { randomUUID: () => 'r' + Math.random().toString(36).slice(2) },
  });
  vm.runInContext('var window=this;this.addEventListener=()=>{};this.scrollTo=()=>{};window=this;', ctx);
  vm.runInContext(script, ctx, { filename: 'index.html' });
  if (duels) vm.runInContext(duelbron, ctx, { filename: 'duels.js' });
  return { ctx, run: code => vm.runInContext(code, ctx), opgeslagen: () => JSON.parse(storage.get('galway-state')) };
}
