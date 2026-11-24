# CLAUDE.md

Guidance for Claude Code (and other agents) working in this repository.

## What this is

`galway-trip` is an offline-first installable web app ("Galway: Sláinte, Eejits!") for one
friend group's trip to Galway: pub check-ins, challenges, a slot-machine challenge deck, a
question wheel, bingo, points/leaderboard, expenses with debt settlement, photo album, trip plan,
and a 1-on-1 duel mode ("de Wedstryd": trivia, spelling, blind tasting, card games, quotes,
Netflix frames, live hitster).

- **No build step, no dependencies, no package.json, no bundler, no linter.** Everything ships as
  plain static files: HTML with its own `<style>`, a few plain `.js` files, PNG icons. Never
  introduce a framework, CDN dependency, or `npm install` unless the user explicitly asks: the
  app must stay copy-able as a folder onto any static HTTPS host, and it must run with no network.
- The base app is one hand-written file (`index.html`) of vanilla ES2020+ JavaScript. New features
  arrive as separate plain scripts that patch the base app (`duels.js`, `sync.js`) rather than as
  new build machinery.
- User-facing copy, code comments and identifiers in UI strings are **Dutch** (`nl-NL` formatting, Irish/English flavour words). Keep new strings in that voice.

## Running and checking it

```bash
python3 lokale_testserver.py      # serves the folder at http://127.0.0.1:8765/ and opens a browser
```

- Windows users double-click `Start-Galway.cmd` (it just runs the same server).
- **Never verify by opening `index.html` via `file://`** — the app only registers its service worker when `location.protocol !== 'file:'`, so nothing is cached and offline behaviour cannot be tested that way. Use the dev server above. `LEESMIJ.txt` says the same.
- There is no test framework, but `controle/` holds four dependency-free Node checks that drive
  the real app; run them after any UI change. `wedstrijd.mjs` needs nothing but Node (stubbed DOM,
  full duel played out). The other three need Chrome listening on the DevTools port plus the dev
  server — the exact commands are in the header of `controle/ontwerp.mjs`:

```bash
node controle/wedstrijd.mjs    # duelregels in een namaak-DOM
node controle/ontwerp.mjs      # ontwerpaudit tegen DESIGN.md + schermafbeeldingen
node controle/pwa.mjs          # manifest, service worker, voorcache, offline herladen
node controle/rondloop.mjs     # elke tab en subpagina aflopen, belangrijkste knoppen klikken
```

  Pass a deployed URL plus the word `blokkeer` to audit production without pushing test state into
  the shared room. The deploy package has real unit tests:
  `.venv/bin/python -m unittest discover -s deploy/tests`.
- Offline behaviour (the main product requirement) is checked by `controle/pwa.mjs`; the manual
  route is still described in `LEESMIJ.txt`: first load online, then flight mode, then reopen.

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
| `DESIGN.md` | The design system: colour tokens, type scale, shape rules, and the list of visual tells the audit refuses. |
| `duels.js` | The 1-on-1 "Wedstryd" mode: eight round types, scoring through `S.transactions`, its own pages under Meer. |
| `sync.js` | Optional room sync: pull/merge/push with revisions and tombstones (see architecture). |
| `config.js` | Public runtime config (`window.GALWAY_CONFIG`); the committed copy keeps sync switched off. |
| `controle/` | Four dependency-free Node checks (design audit, PWA/offline, click-through, duel logic). Screenshots land in `controle/scherm/`, which is ignored. |
| `api/room_api.py` | Lambda handler for room sync: one JSON document per room, revision-checked writes, key from SSM. |
| `infra/` | Terraform: S3 + CloudFront + DynamoDB + Lambda + SSM parameter + IAM. |
| `deploy/` | Python publisher: `deploy.py` plus the `galway_deploy` package and its unit tests. |

## How `index.html` is laid out

The file is one `<script>` block with a strict reading order. Logical line ranges:

| Lines | Content |
| --- | --- |
| 1 | `<head>`: meta (theme colour matches `--bg`), manifest and icon links. |
| 2–67 | All CSS: custom properties (`--bg`, `--card`, `--vlak`, `--line`, `--ink`, `--muted`, `--gold`, `--alert`), one rule per line, ending with a `prefers-reduced-motion` block. This is the only place to style; `DESIGN.md` is the contract. |
| 68 | Body shell: `<header>`, `<main id="app">`, `<nav id="nav">`, `<dialog id="modal">`, `#toast`, `<script>` opens. |
| 69–70 | `'use strict'` and helpers: `$`, `uid`, `now`, `item`, `esc`, `fmt`. |
| 71–74 | Seed content: `words` (Irish glossary), `preloadedPlayers`, `pubs`, `qsets` (question sets). |
| 75 | `initial()` — the shape of a fresh state object. |
| 76–79 | Load state from `localStorage`, merge in missing preloaded players, page variables. |
| 80–105 | **Base app**: `save`, `render`, `choosePlayer`, `setup`, all page functions and the IndexedDB photo store — one function per line. Most of these are later overridden by the patch layer. |
| 106–108 | Large v3 content constants: `NEW_PUBS` (42 pubs + area), `PUB_CHALLENGES` (400 slot cards, 8 categories × 50), `EXTRA_QUESTIONS` (500 questions). **Each line is 30–40 KB — always read them with a line range, never whole.** |
| 111–126 | `applyGalwayV3()` content migration, run once on load. |
| 127–247 | The **patch layer**: every later feature reassigns a base function. |
| 246 | `window.Galway`, the bridge used by the separate scripts. |
| 248 | `</script>`, then `<script src>` for `config.js`, `sync.js`, `duels.js`. |

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

**Content migration.** `applyGalwayV3()` (lines 111–126) runs on every load and returns early when
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

**Multi-device sync (`sync.js`, optional).** `config.js` sets `window.GALWAY_CONFIG = {api, room,
key, sync}`; with `sync: true` the client pulls the room document on load, merges it
entity-by-entity by `updatedAt`, and pushes (debounced, only after local changes) with optimistic
concurrency — a `409` returns the current document, which is merged and re-pushed. The server
(`api/room_api.py`) is deliberately dumb: it stores one JSON document per room plus a revision,
authenticates `x-galway-key`, and caps payloads; all merging is client-side. Deletions travel as
tombstones inferred from what disappeared since the last push, and keys listed in `LOKAAL`
(`questions`, `pubDeck`) never leave the device. Anything added to `S` that must not sync goes in
that list.

**Duel mode (`duels.js`).** Loads after the base app and reaches it only through `window.Galway`
(`state`, `save`, `render`, `item`, `uid`, `now`, `points`, `clearPoints`) — `let S` is script-scoped,
so a separate script cannot touch it directly; extend that bridge instead of reaching into
`index.html`. It patches `morePage`/`pointsInfoPage` output the same way the patch layer does and
keeps its state in `S.duels`. Points are ordinary transactions with a `duel:<id>` source, and a
duel pays out once because `settle()` checks that source before awarding.

**Design.** `DESIGN.md` is the contract for colours, type and shape, and lists the thirteen things
the UI must not do (the "AI slop" tells). Styling belongs in the `<style>` block, not in injected
`extraStyle` strings. `node controle/ontwerp.mjs` measures the running app against those rules.

## Deployment

Live site: `https://d1luu4d2i8itxg.cloudfront.net/` — CloudFront in front of a private S3 bucket
(origin access control), with a Lambda Function URL for room sync and a DynamoDB table behind it.
No custom domain: CloudFront's own certificate provides the HTTPS that PWA installation needs.

- Infrastructure is Terraform in `infra/` (`main.tf`, `storage.tf`, `cdn.tf`, `api.tf`,
  `outputs.tf`). State lives in `infra/terraform.tfstate`, which is git-ignored; the DynamoDB
  table has `prevent_destroy`.
- `deploy/deploy.py` is the only thing to run by hand: `doctor`, `plan`, `infra`, `up` (infra +
  assets), `assets`, `status`, `url`, `key`, `destroy --yes [--purge]`. It calls Terraform for
  infrastructure and boto3 for uploads, and it reads the room key from the SSM SecureString.
- The published `config.js` (API URL + room key) is generated at publish time and never written
  into the repository. The `config.js` that is committed keeps `api: ""` so a clone runs with
  sync off.
- The service worker is **network-first** for its own files: edits show up on the next reload once
  online, and the cache is only the offline fallback. Still bump `const CACHE = 'galway-vN'` in
  `service-worker.js` (currently `galway-v8`) on release and add new files to its `FILES` array —
  that is what clears stale caches on phones. The deploy step sends `must-revalidate` for app
  files and invalidates those paths on CloudFront.
- Never commit the room key, `infra/terraform.tfstate`, `.venv/`, or a `config.js` containing the
  key. `.gitignore` covers the first three; check `git diff` before pushing.

## Guardrails

- Do not add real names, phone numbers, booking details, or anything sensitive to the source. The
  repository is public and already ships the friend group's first names in `preloadedPlayers`;
  do not extend that with more personal data.
- Keep everything working offline: the app never needs the network to run. The one permitted
  remote call is the room sync endpoint from `config.js` (`sync.js`), and only when it is
  configured — every sync path must fail silently and leave local use untouched. External links
  (pub fact source links, `tel:` numbers) are allowed because they degrade gracefully offline.
- State is per-device by default and browsers can evict `localStorage`. Sync (see below) is
  best-effort: never make a feature depend on it, and never assume the room document exists.
- One device is still the primary design assumption. `sync.js` merges state across devices but is
  deliberately conservative: device-local keys stay local, and conflicts resolve per entity.
- Match the existing density and style (compact statements in `index.html`, readable modules in the
  separate scripts). New content or features go in a new plain script that patches the base app —
  do not reformat or split `index.html`.
- UI changes must satisfy `DESIGN.md`; `node controle/ontwerp.mjs` fails on a regression.
