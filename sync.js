/* Gedeelde groep: same three endpoints as api/room_api.py and as the local
 * dev server, so laptop, phone and CloudFront all speak one protocol.
 *
 * The server is deliberately dumb - it stores one JSON document per room and a
 * revision number - which means all the intelligence lives here:
 *   - pull once at startup, push debounced after every change;
 *   - a revision conflict (409) is not an error but the other person's version,
 *     which is merged entity-by-entity using the updatedAt stamps the app
 *     already writes;
 *   - deletes are invisible in a merge, so ids that disappeared since the last
 *     push are written into a small 'deleted' map and win over old copies.
 *
 * config.js with an empty api means: this file does nothing at all. */
(function () {
  const config = window.GALWAY_CONFIG || {};
  const api = (config.api || '').replace(/\/+$/, '');
  const key = config.key || '';
  const room = config.room || 'galway';
  const enabled = !!api && !!key && !!window.Galway;

  const META_KEY = 'galway-sync';
  const DEVICE_KEY = 'galway-device';
  const DELETED = 'deleted';
  const PUSH_DELAY = 1200;
  const PULL_EVERY = Math.max(8000, Number(config.syncIntervalMs) || 20000);
  const REQUEST_TIMEOUT = 12000;
  const TOMBSTONE_TTL = 45 * 86400000;

  /* Content the app generates itself on every device; sending it over the
   * network would double the document and achieve nothing. */
  const DEVICE_LOCAL = ['questions', 'pubDeck'];

  let meta = readMeta();
  let device = readDevice();
  let timer = null;
  let inflight = false;
  let holdPush = false;
  let dirty = false;
  let state = 'uit';

  // ------------------------------------------------------------- small tools

  function readMeta() {
    try {
      const stored = JSON.parse(localStorage.getItem(META_KEY) || '{}');
      return { rev: Number(stored.rev) || 0, pushed: stored.pushed || {}, at: stored.at || '' };
    } catch {
      return { rev: 0, pushed: {}, at: '' };
    }
  }

  function readDevice() {
    const stored = localStorage.getItem(DEVICE_KEY);
    if (stored) return stored;
    const fresh = 'p-' + Math.random().toString(36).slice(2, 10);
    localStorage.setItem(DEVICE_KEY, fresh);
    return fresh;
  }

  function writeMeta() {
    localStorage.setItem(META_KEY, JSON.stringify(meta));
  }

  function stamp() {
    return new Date().toISOString();
  }

  function newer(left, right) {
    return String(left && left.updatedAt) > String(right && right.updatedAt);
  }

  function isRecord(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }

  function isTrackedList(value) {
    return Array.isArray(value) && value.length > 0 && value.every(entry => isRecord(entry) && typeof entry.id === 'string');
  }

  function label(text) {
    state = text;
    const badge = document.getElementById('galway-sync');
    if (badge) {
      badge.textContent = text;
      badge.dataset.state = offline() ? 'out' : 'ok';
    }
  }

  function offline() {
    return navigator.onLine === false;
  }

  // -------------------------------------------------------------- document

  /* The room document is the app state minus the bits a device regenerates,
   * plus the tombstones needed to make deletes travel. */
  function payload() {
    const local = window.Galway.state || {};
    const body = {};
    Object.keys(local).forEach(name => {
      if (!DEVICE_LOCAL.includes(name)) body[name] = local[name];
    });
    body.deleted = Object.assign({}, local[DELETED]);
    return body;
  }

  function collectIds(body) {
    const seen = {};
    Object.keys(body).forEach(name => {
      if (name === DELETED) return;
      (Array.isArray(body[name]) ? body[name] : []).forEach(entry => {
        if (isRecord(entry) && typeof entry.id === 'string') seen[name + ':' + entry.id] = entry.updatedAt || '';
      });
    });
    return seen;
  }

  /* Tombstones must not live forever; 45 days is long enough for anyone who
   * had their phone in Brazil without signal to catch up. */
  function pruneTombstones(existing) {
    const body = existing || {};
    const cut = new Date(Date.now() - TOMBSTONE_TTL).toISOString();
    const kept = {};
    Object.keys(body).forEach(id => {
      if (String(body[id]) >= cut) kept[id] = body[id];
    });
    return kept;
  }

  /* Anything that was in the document we last sent and is gone now was deleted
   * on this device; note the moment so the other devices can follow. Pruning
   * happens here, once per push, and never while reading the app state. */
  function withTombstones(body) {
    const current = collectIds(body);
    const deleted = Object.assign({}, body[DELETED]);
    Object.keys(meta.pushed).forEach(id => {
      if (!(id in current) && !(id in deleted)) deleted[id] = stamp();
    });
    body.deleted = pruneTombstones(deleted);
    return body;
  }

  function removeDeleted(body) {
    const deleted = body[DELETED] || {};
    const limit = Date.now() - TOMBSTONE_TTL;
    Object.keys(body).forEach(name => {
      if (name === DELETED || !Array.isArray(body[name])) return;
      body[name] = body[name].filter(entry => {
        if (!isRecord(entry) || typeof entry.id !== 'string') return true;
        const gone = deleted[name + ':' + entry.id];
        return !(gone && String(entry.updatedAt || '') <= String(gone));
      });
    });
    Object.keys(deleted).forEach(id => {
      if (Date.parse(deleted[id]) < limit) delete deleted[id];
    });
    return body;
  }

  /* Winner is whichever document was saved last; everything the winner does not
   * know about is taken from the loser, and entities that both know are decided
   * by their own updatedAt. That keeps two phones adding players at the same
   * time both, instead of one silently overwriting the other. */
  function mergeValues(winner, loser) {
    if (isTrackedList(winner) && isTrackedList(loser)) {
      const byId = new Map();
      winner.forEach(entry => byId.set(entry.id, entry));
      loser.forEach(entry => {
        const held = byId.get(entry.id);
        if (!held || newer(entry, held)) byId.set(entry.id, entry);
      });
      return [...byId.values()];
    }
    if (isRecord(winner) && isRecord(loser)) {
      const out = {};
      Object.keys(winner).forEach(name => {
        out[name] = winner[name];
      });
      Object.keys(loser).forEach(name => {
        const left = winner[name];
        const right = loser[name];
        if (left === undefined) out[name] = right;
        else if (isTrackedList(left) && isTrackedList(right)) out[name] = mergeValues(left, right);
        else if (isRecord(left) && isRecord(right)) out[name] = mergeValues(left, right);
      });
      return out;
    }
    return winner;
  }

  function mergeDocs(remote, local) {
    const leader = String(remote.updatedAt || '') >= String(local.updatedAt || '') ? remote : local;
    const other = leader === remote ? local : remote;
    const merged = mergeValues(leader, other);
    DEVICE_LOCAL.forEach(name => {
      if (local[name] !== undefined) merged[name] = local[name];
    });
    merged.updatedAt = stamp();
    return removeDeleted(merged);
  }

  // ------------------------------------------------------------------ wire

  function request(method, body) {
    const controller = new AbortController();
    const giveUp = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
    return fetch(api + '/state?room=' + encodeURIComponent(room), {
      method: method,
      headers: { 'content-type': 'application/json', 'x-galway-key': key },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    })
      .then(response => (response.status === 404 ? { status: 404, doc: null } : response.json().then(doc => ({ status: response.status, doc: doc }))))
      .finally(() => clearTimeout(giveUp));
  }

  function adopt(doc) {
    const local = window.Galway.state || {};
    const merged = mergeDocs(doc.state || {}, local);
    window.Galway.state = merged;
    holdPush = true;
    window.Galway.save();
    holdPush = false;
    /* Everything in the merged document is now something the group knows about,
     * so when this device deletes one of those entries later it turns into a
     * tombstone instead of quietly surviving on the other devices. */
    meta.pushed = collectIds(payload());
    writeMeta();
    window.Galway.render();
  }

  /* A pull can end in "no document yet" and a push in "someone was first"; both
   * need a follow-up request, and that may only start once the current request
   * is finished, because a second one would see the first still in flight. */
  function pulled(result) {
    if (result.status === 404) return 'push';
    if (result.status !== 200 || !result.doc) {
      fail();
      return '';
    }
    const changed = String(result.doc.updatedAt || '') !== String(meta.at || '');
    meta.rev = Number(result.doc.rev) || meta.rev;
    meta.at = result.doc.updatedAt || stamp();
    writeMeta();
    /* Adopt whenever the group has something we have not seen - including the
     * first pull on a fresh phone, whose own empty state technically carries a
     * newer stamp than the trip that has been going on for a week. */
    if (changed || dirty) {
      adopt(result.doc);
      label('Samengevoegd');
    } else {
      label('Vers');
    }
    return '';
  }

  function pushed(result, retry) {
    if (result.status === 201 || result.status === 200) {
      meta.rev = Number(result.doc && result.doc.rev) || meta.rev;
      meta.at = stamp();
      meta.pushed = collectIds(payload());
      dirty = false;
      writeMeta();
      label('Synchronisatie');
      return '';
    }
    if (result.status === 409 && result.doc && !retry) {
      /* The group moved while we were typing: take their version, merge ours
       * into it, and push once more from their revision. */
      meta.rev = Number(result.doc.rev) || 0;
      adopt(result.doc);
      label('Samengevoegd');
      return 'push';
    }
    if (result.status === 404) {
      meta.rev = 0;
      return 'push';
    }
    fail();
    return '';
  }

  function push(retry) {
    if (inflight || !window.Galway.state) return Promise.resolve();
    inflight = true;
    label('Doorsturen…');
    const body = withTombstones(payload());
    let again = '';
    return request('PUT', { state: body, baseRev: meta.rev })
      .then(result => {
        again = pushed(result, retry);
        return undefined;
      })
      .catch(fail)
      .finally(() => {
        inflight = false;
        if (again) push(true);
      });
  }

  function pull() {
    if (inflight || offline()) return Promise.resolve();
    inflight = true;
    let again = '';
    return request('GET')
      .then(result => {
        again = pulled(result);
        return undefined;
      })
      .catch(fail)
      .finally(() => {
        inflight = false;
        if (again) push();
      });
  }

  function fail() {
    label(offline() ? 'Offline' : 'Sync mislukt');
    return undefined;
  }

  /* Only what this device actually changed gets pushed, and only after a short
   * pause: dragging a slider or tapping through a list should not mean a
   * request per tap, and a device that merely merged someone else's work must
   * not answer it with a push of its own. */
  function queue() {
    if (!enabled || holdPush) return;
    dirty = true;
    if (offline()) return;
    clearTimeout(timer);
    timer = setTimeout(() => {
      push();
    }, PUSH_DELAY);
  }

  // ------------------------------------------------------------------ shell

  function badge() {
    const host = document.querySelector('.topbar, header, .bar');
    const spot = document.createElement('span');
    spot.id = 'galway-sync';
    spot.className = 'sync-badge';
    spot.dataset.state = 'ok';
    spot.title = 'Gedeelde groep ' + room;
    spot.textContent = 'Starten…';
    spot.addEventListener('click', () => pull());
    (host || document.body).appendChild(spot);
  }

  function start() {
    if (!enabled) return;
    badge();
    const priorSave = window.save;
    if (typeof priorSave === 'function') {
      window.save = function () {
        const result = priorSave.apply(this, arguments);
        queue();
        return result;
      };
    }
    window.addEventListener('online', () => pull());
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) pull();
    });
    setInterval(() => {
      if (!document.hidden) pull();
    }, PULL_EVERY);
    pull();
  }

  window.GalwaySync = {
    enabled: enabled,
    room: room,
    pull: pull,
    push: push,
    status: () => state,
    revision: () => meta.rev,
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
