/* global more, morePage, card, esc, modal, closeModal, $, toast */
(() => {
  'use strict';

  const G = window.Galway;
  const holes = () => G.state.pubgolfHoles || [];
  const scores = () => G.state.pubgolfScores || [];
  const players = () => G.state.players;
  const pubName = hole => G.state.pubs.find(pub => pub.id === hole.id)?.name || hole.name;
  const scoreId = (holeId, playerId) => JSON.stringify([holeId, playerId]);
  const scoreFor = (holeId, playerId) => scores().find(score => score.id === scoreId(holeId, playerId));
  const signed = number => number > 0 ? '+' + number : String(number);

  function standings(course) {
    const rows = players().map(player => {
      const played = course.map(hole => scoreFor(hole.id, player.id)).filter(score => score?.strokes != null);
      return {
        name: player.name,
        played: played.length,
        total: played.reduce((sum, score) => sum + score.strokes + score.penalty, 0),
      };
    });
    const complete = rows.filter(row => row.played === course.length).sort((a, b) => a.total - b.total);
    const leaders = complete.filter(row => row.total === complete[0].total);
    const label = complete.length === rows.length ? 'Winnaar' : 'Voorlopig aan kop';
    const result = leaders.length
      ? `<p><b>${label}</b> · ${leaders.map(row => esc(row.name)).join(', ')} (${leaders[0].total})</p>`
      : '<p class="muted">De stand volgt zodra iemand alle holes heeft ingevuld.</p>';
    return card('Stand', result + [...complete, ...rows.filter(row => row.played < course.length)].map(row =>
      `<div class="spread"><b>${esc(row.name)}</b><span>${row.played}/${course.length} holes · ${row.total} punten</span></div>`
    ).join(''));
  }

  function holeCard(hole, index) {
    const id = esc(hole.id);
    const rows = players().map(player => {
      const score = scoreFor(hole.id, player.id);
      let detail = 'Open';
      if (score?.strokes != null) {
        const total = score.strokes + score.penalty;
        const penalty = score.penalty ? ` + ${score.penalty} straf` : '';
        detail = `${score.strokes} slokken${penalty} = ${total} (${signed(total - hole.par)})`;
      }
      return `<div class="spread"><div><b>${esc(player.name)}</b><div class="muted">${detail}</div></div>
        <button class="secondary" data-hole="${id}" data-player="${esc(player.id)}"
          onclick="pubgolfScore(this.dataset.hole, this.dataset.player)" aria-label="Score voor ${esc(player.name)}">Score</button></div>`;
    }).join('');
    return card(`Hole ${index + 1} · ${esc(pubName(hole))}`, `<div class="spread"><b>Par ${hole.par}</b>
      <button class="secondary" data-hole="${id}" onclick="pubgolfHole(this.dataset.hole)">Par wijzigen</button></div>${rows}`);
  }

  function pubgolfPage() {
    const course = [...holes()].sort((a, b) => a.addedAt.localeCompare(b.addedAt) || a.id.localeCompare(b.id));
    return `<button class="secondary" onclick="sub('Meer')">← Meer</button>
      <div class="spread"><h2>Pubgolf</h2><button onclick="pubgolfHole()">Hole toevoegen</button></div>
      ${course.length ? standings(course) + course.map(holeCard).join('') : '<p>Voeg de eerste kroeg toe aan jullie scorekaart.</p>'}
      ${card('Spelregels', `<p>Elke kroeg is één hole. Spreek per hole een par af. Bij par 4 zijn vier slokken de richtscore. Minder slokken levert een lagere score op en meer slokken een hogere. Alcoholvrij spelen kan ook.</p>
        <p>Tel afgesproken strafpunten op bij de slokken, bijvoorbeeld voor morsen, te laat komen of een gemiste opdracht. De laagste totaalscore wint. Bij gelijkspel deel je de plek.</p>
        <h3>Voorbeeldscorekaart</h3>
        <p>Hole 1 · par 4 · 3 slokken + 0 straf = 3 (−1)<br>Hole 2 · par 4 · 4 slokken + 1 straf = 5 (+1)<br><b>Totaal 8 punten</b></p>
        <p>Golfoutfit voor de sfeer. Denk aan een pet, polo en eventueel een golfclub als accessoire.</p>`)}`;
  }

  function saveRecord(key, values) {
    const records = G.state[key] ||= [];
    const existing = records.find(record => record.id === values.id);
    if (existing) Object.assign(existing, values, { updatedAt: G.now() });
    else records.push(G.item(values));
    G.save();
    closeModal();
    G.render();
  }

  window.pubgolfHole = function (id) {
    const hole = holes().find(entry => entry.id === id);
    const used = new Set(holes().map(entry => entry.id));
    const available = G.state.pubs.filter(pub => !used.has(pub.id));
    if (!hole && !available.length) return toast('Alle kroegen staan al op de scorekaart.');
    modal(hole ? 'Par wijzigen' : 'Hole toevoegen', `<form id="pubgolf-hole-form">
      ${hole ? `<p>${esc(pubName(hole))}</p>` : `<label for="pubgolf-pub">Kroeg</label><select id="pubgolf-pub">
        ${available.map(pub => `<option value="${esc(pub.id)}">${esc(pub.name)}</option>`).join('')}</select>`}
      <label for="pubgolf-par">Par (slokken)</label><input id="pubgolf-par" type="number" min="1" max="99" required value="${hole?.par ?? 4}">
      <button>Opslaan</button></form>`);
    $('#pubgolf-hole-form').onsubmit = event => {
      event.preventDefault();
      const par = $('#pubgolf-par').valueAsNumber;
      if (hole) {
        if (holes().some(entry => entry.id === hole.id)) saveRecord('pubgolfHoles', { id: hole.id, par });
        return;
      }
      const pub = G.state.pubs.find(entry => entry.id === $('#pubgolf-pub').value);
      if (!pub || holes().some(entry => entry.id === pub.id)) return toast('Deze hole kan niet worden toegevoegd.');
      saveRecord('pubgolfHoles', { id: pub.id, name: pub.name, par, addedAt: G.now() });
    };
  };

  window.pubgolfScore = function (holeId, playerId) {
    const hole = holes().find(entry => entry.id === holeId);
    const player = players().find(entry => entry.id === playerId);
    if (!hole || !player) return;
    const score = scoreFor(holeId, playerId);
    modal('Score invullen', `<form id="pubgolf-score-form">
      <p>${esc(player.name)} · ${esc(pubName(hole))} · par ${hole.par}</p>
      <label for="pubgolf-strokes">Slokken</label><input id="pubgolf-strokes" type="number" min="1" max="999" required value="${score?.strokes ?? ''}">
      <label for="pubgolf-penalty">Strafpunten</label><input id="pubgolf-penalty" type="number" min="0" max="999" required value="${score?.penalty ?? 0}">
      <div class="actions"><button>Opslaan</button>
      ${score?.strokes != null ? '<button id="pubgolf-clear" type="button" class="secondary">Score wissen</button>' : ''}</div></form>`);
    const record = { id: scoreId(holeId, playerId), holeId, playerId };
    $('#pubgolf-score-form').onsubmit = event => {
      event.preventDefault();
      saveRecord('pubgolfScores', { ...record, strokes: $('#pubgolf-strokes').valueAsNumber, penalty: $('#pubgolf-penalty').valueAsNumber });
    };
    const clear = $('#pubgolf-clear');
    if (clear) clear.onclick = () => saveRecord('pubgolfScores', { ...record, strokes: null, penalty: 0 });
  };

  const priorMore = morePage;
  morePage = function () {
    if (more === 'Pubgolf') return pubgolfPage();
    const view = priorMore();
    if (more !== 'Meer') return view;
    return view + '<div class="card spread"><b>Pubgolf</b><button class="secondary" onclick="sub(\'Pubgolf\')">Open →</button></div>';
  };
})();
