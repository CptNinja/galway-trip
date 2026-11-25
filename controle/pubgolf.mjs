import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { maakVenster } from './namaak.mjs';

const source = fs.readFileSync(new URL('../pubgolf.js', import.meta.url), 'utf8');
const { ctx, run, opgeslagen } = maakVenster();
vm.runInContext(source, ctx);
run(`S.setup=true;
  S.players=[{id:'dylan-raitt',name:'A <test>'},{id:'davy-raitt',name:'B'}];
  localStorage.setItem('galway-current-player','dylan-raitt');
  sub('Meer')`);
assert.match(run("$('#app').innerHTML"), /Pubgolf/);
run("sub('Pubgolf')");
assert.match(run("$('#app').innerHTML"), /Voorbeeldscorekaart/);

run(`var [first,second]=S.pubs;
  var submit=id=>$(id).onsubmit({preventDefault(){}});
  var addHole=(pub,par)=>{
    pubgolfHole();
    $('#pubgolf-pub').value=pub.id;
    $('#pubgolf-par').valueAsNumber=par;
    submit('#pubgolf-hole-form');
  };
  addHole(first,4);
  addHole(second,5);
  addHole(first,6)`);
assert.deepEqual(opgeslagen().pubgolfHoles.map(hole => hole.par).sort(), [4, 5]);

run(`var putScore=(pub,player,strokes,penalty)=>{
    pubgolfScore(pub.id,player);
    $('#pubgolf-strokes').valueAsNumber=strokes;
    $('#pubgolf-penalty').valueAsNumber=penalty;
    submit('#pubgolf-score-form');
  };
  putScore(first,'dylan-raitt',3,0);
  putScore(first,'davy-raitt',2,0)`);
assert.match(run("$('#app').innerHTML"), /De stand volgt/);
run("putScore(second,'dylan-raitt',5,1)");
assert.match(run("$('#app').innerHTML"), /Voorlopig aan kop.*A &lt;test&gt; \(9\)/);
run("putScore(second,'davy-raitt',6,0)");
assert.match(run("$('#app').innerHTML"), /Winnaar.*B \(8\)/);
run("putScore(second,'davy-raitt',6,1)");
assert.match(run("$('#app').innerHTML"), /Winnaar.*A &lt;test&gt;, B \(9\)/);
assert.equal(opgeslagen().pubgolfScores.length, 4);
run("pubgolfHole(first.id); $('#pubgolf-par').valueAsNumber=3; submit('#pubgolf-hole-form')");
assert.match(run("$('#app').innerHTML"), /3 slokken = 3 \(0\)/);
run("pubgolfScore(second.id,'davy-raitt'); $('#pubgolf-clear').onclick()");
assert.match(run("$('#app').innerHTML"), /Voorlopig aan kop.*A &lt;test&gt; \(9\)/);

const restored = maakVenster({ voorlop: opgeslagen() });
vm.runInContext(source, restored.ctx);
restored.run("localStorage.setItem('galway-current-player','dylan-raitt'); sub('Pubgolf')");
assert.match(restored.run("$('#app').innerHTML"), /Voorlopig aan kop.*A &lt;test&gt; \(9\)/);
console.log('Pubgolf: menu, scorekaart, par, strafpunten, gedeelde winst en lokaal herstel akkoord.');
