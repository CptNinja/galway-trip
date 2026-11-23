# CLAUDE.md

Guidance for Claude Code (and other agents) working in this repository.

## What this is

`galway-trip` is an offline-first installable web app ("Galway: Sláinte, Eejits!") for one
friend group's trip to Galway: pub check-ins, challenges, a slot-machine challenge deck, a
question wheel, bingo, points/leaderboard, expenses with debt settlement, photo album, trip plan.

- **No build step, no dependencies, no package.json, no tests, no linter.** Everything ships as static files.
- The whole app is one hand-written file (`index.html`) of vanilla ES2020+ JavaScript. Never introduce a bundler, framework, CDN dependency, or `npm install` unless the user explicitly asks: the app must stay copy-able as 5 files onto HTTPS hosting / GitHub Pages.
- User-facing copy, code comments and identifiers in UI strings are **Dutch** (`nl-NL` formatting, Irish/English flavour words). Keep new strings in that voice.

## Running and checking it

```bash
python3 lokale_testserver.py      # serves the folder at http://127.0.0.1:8765/ and opens a browser
```

- Windows users double-click `Start-Galway.cmd` (it just runs the same server).
- **Never verify by opening `index.html` via `file://`** — the app only registers its service worker when `location.protocol !== 'file:'`, so nothing is cached and offline behaviour cannot be tested that way. Use the dev server above. `LEESMIJ.txt` says the same.
- There is no automated test suite. Verification is manual, in a browser (device emulation helps): load the page, click through the affected tab, and check the browser console for errors. State lives in `localStorage`, so to test fresh-install behaviour clear `localStorage` + the `galway-photos` IndexedDB + the `galway-*` Cache Storage, then reload.
- Offline behaviour (the main product requirement) is tested as described in `LEESMIJ.txt`: first load online, then flight mode, then reopen.

## Repository layout

| File | Role |
| --- | --- |
| `index.html` | The entire app: `<style>`, HTML shell, all JS, all seed content. ~150 logical lines / ~145 KB. |
| `manifest.json` | PWA manifest (`name`, `icons`, `display: standalone`). |
| `service-worker.js` | Install-time precache of `FILES`, cache-first `fetch`, old-cache cleanup. |
| `icon-192.png`, `icon-512.png` | PWA icons. |
| `lokale_testserver.py` | Local dev server (127.0.0.1:8765). |
| `Start-Galway.cmd` | Windows launcher for the dev server. |
| `README.md`, `LEESMIJ.txt` | README and the full end-user/hosting instructions (Dutch). |

## How `index.html` is laid out

The file is one `<script>` block with a strict reading order. Logical line ranges:

| Lines | Content |
| --- | --- |
| 1 | `<head>`: meta, theme colour, manifest link. |
| 2 | All CSS (one line, custom properties `--bg`, `--card`, `--gold`, `--cream`, `--muted`, `--line`). |
| 3 | Body shell: `<header>`, `<main id="app">`, `<nav id="nav">`, `<dialog id="modal">`, `#toast`, `<script>` opens. |
| 4–5 | `'use strict'`, helpers: `$`, `uid`, `now`, `item`, `esc`, `fmt`. |
| 6–9 | Seed content: `words` (Irish glossary), `preloadedPlayers`, `pubs`, `qsets` (question sets). |
| 10 | `initial()` — the shape of a fresh state object. |
| 11–13 | Load state from `localStorage`, merge in missing preloaded players. |
| 15–40 | **Base app**: `save`, `render`, `choosePlayer`, `setup`, all page functions, IndexedDB photo store, and the "Meer" menu (`menu`, `morePage`) — one function per line. |
| 41–43 | Large v3 content constants: `NEW_PUBS` (42 pubs + area), `PUB_CHALLENGES` (400 slot cards, 8 categories × 50), `EXTRA_QUESTIONS` (500 questions). **These three lines are 30–40 KB each — always read them with a line range, never whole.** |
| 45–60 | `applyGalwayV3()` content migration, run once on load. |
| 61–155 | The **patch layer**: every later feature reassigns a base function. |

Because most "lines" are entire functions or huge data arrays, use ranged reads (`read` with
`index.html:NN-MM`) and precise edits. Do not reformat, prettify, or split the file — line-based
identity is what makes this codebase navigable and reviewable.

## Architecture rules that matter

**State.** One object `S`, persisted wholesale by `save()` into `localStorage['galway-state']`.
Photos are the exception: blobs in IndexedDB `galway-photos` (store `photos`), with metadata
records in `S.photos`. Every entity is created through `item({...})` which adds `{id, updatedAt}`,
and mutations call `save()` (or `touch(obj)`) before `render()`.

**Rendering.** No virtual DOM. `render()` sets `$('#nav').innerHTML` and `$('#app').innerHTML`
from the page function selected by the `page` variable; the "Meer" tab branches on `more`
(`morePage` routes on a `menu` list). Sub-pages are entered with `sub('Naam')` and left with
`sub('Meer')`. Modals are `<dialog>` content built by `modal(title, body)`; toasts by `toast()`.
Anything rendered is a template string — so a page function must return a complete HTML string.

**Escaping.** `esc()` is applied to *all* user-entered text interpolated into HTML (names, pub
names, challenge titles, notes, expense titles, custom questions). Inline `onclick="fn('${id}')"`
handlers carry **ids only** (`crypto.randomUUID()`, or stable seeded ids like `pub-v3-<slug>`),
never user text — `esc()`'s `'` → `&#39;` is *not* safe inside a JS string literal in an
attribute, because the HTML parser decodes it back to a quote. Keep it that way.

**Feature layering (the pattern to follow).** Later versions never edited the base functions;
they captured and wrapped them, in file order:

```js
const priorMorePage = morePage;
morePage = function () { /* new chrome */ return priorMorePage(); };
```

Each wrapper must be declared after the thing it wraps (`pts*` / `prior*` snapshots at lines 61,
98, 129–135, 144) and the final `render()` (line 136) is the authoritative nav/view table — the
earlier `render`s are dead once superseded. Some wrappers patch base markup with literal
`.replace('<button …>…', …)` or a regex over `home()` output; those string patches are brittle by
nature: if you change base markup, grep the patch layer (`const original`, `const prior`,
`=function`, `.replace('`) and fix every site in the same commit.

**Points.** All scores derive from `S.transactions` (`{playerId, points, reason, source}`);
`score(id)` just sums them. A feature that can be re-awarded uses `removeSource(source)` before
`addPoints(...)`, and the source string encodes the feature and entity so re-awarding is
idempotent: `pub:<id>`, `challenge:<id>`, `slot:<id>`, `pubtask:<id>`, `bingo`, `bingo-board:<id>`,
`bonus:<uuid>`. Current awards: pub visit +1/person, slot card +2, challenge/pub-task per-item
points, single bingo +5, full bingo board +10 for everyone (`grantFullBingo`, intentionally called
from render). Add new awards through `addPoints` with a namespaced `source`, and mention the rule
in the points explainer (`pointsInfoPage`, `pointsLink`).

**Money.** Expenses store integer `cents` (parsed with `Math.round(value * 100)` and validated by
`Number.isSafeInteger`); splits use `Math.floor` + remainder distribution. The "Afrekenen"
settlement is a greedy largest-debt ↔ largest-credit loop (documented in `LEESMIJ.txt` as "not
guaranteed minimal"). Format only via `fmt()` (nl-NL EUR). Never introduce float arithmetic.

**Content migration.** `applyGalwayV3()` (lines 45–60) runs on every load and returns early when
`S.contentVersion >= 3`. It adds `NEW_PUBS` (name-normalised dedupe, with an explicit alias rule
for "The Front Door / Sonny Molloy's" vs "Sonny's"), deletes the duplicated "Séhan Ua Neáchtain"
entry only if untouched, rebuilds `S.pubDeck`, and appends `EXTRA_QUESTIONS` by stable id.
Note the consequence: **`initial()` does not contain `pubDeck` or the v3 questions** — a fresh
state only gains them when `applyGalwayV3()` runs right after load. Never read `S.pubDeck` before
that migration has run. When adding a content batch, follow the same shape: stable ids
(`pub-v3-<slug>`, `question-v3-<n>`), idempotent insert, bump `contentVersion`, and preserve
user data (visits, points, photos) — never reset it.

**Backup / restore.** `exportData()` exports `structuredClone(S)` with `photos` emptied;
`importData()` requires `version === 1` plus `players`/`pubs`/`questions` arrays and replaces text
data (photos are not restorable). Keep those invariants in sync with `initial()` and with what
`LEESMIJ.txt` promises.

## Deployment gotcha

The service worker is **cache-first**: a cached `index.html` is served forever until the cache
version changes. On any release that touches a precached file, bump `const CACHE = 'galway-vN'`
in `service-worker.js` (currently `galway-v5`) and add new files to its `FILES` array. Forgetting
this is the single most likely cause of "my change doesn't show up on the phone".
Hosting is GitHub Pages from `main` at the repository root (see `LEESMIJ.txt`).

## Guardrails

- Do not add real names, phone numbers, booking details, or anything sensitive to the source. The
  repository is public and already ships the friend group's first names in `preloadedPlayers`;
  do not extend that with more personal data.
- Keep everything working offline: no remote API calls, no remote assets. External links (pub fact
  source links, `tel:` numbers) are allowed because they degrade gracefully offline.
- Storage is per-device with no sync, and browsers can evict `localStorage` — do not add features
  that assume durability across devices.
- One device is the design assumption; multi-device sync is explicitly out of scope.
- Match existing density and style (compact statements, no semicolon-free rewrites, no new files)
  unless the user asks for restructuring.
