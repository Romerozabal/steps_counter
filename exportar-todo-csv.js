// Exporta cada sesion a su propio CSV + uno con todas. Carpeta: csv-export/
const fs = require('fs');
const path = require('path');

const s = JSON.parse(fs.readFileSync(path.join(__dirname, 'pasos.json'), 'utf8'));
const dir = path.join(__dirname, 'csv-export');
if (!fs.existsSync(dir)) fs.mkdirSync(dir);

function cell(v) {
  const t = String(v == null ? '' : v);
  return /[",\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t;
}
function csvFor(events) {
  const rows = [['n', 'sesion', 'pierna', 'fecha_hora_local', 'iso', 'epoch_ms'].join(',')];
  events.forEach((e, i) => {
    const d = new Date(e.t);
    rows.push([i + 1, e.session, e.leg === 'L' ? 'izquierda' : 'derecha',
      d.toLocaleString(), d.toISOString(), e.t].map(cell).join(','));
  });
  return '﻿' + rows.join('\r\n') + '\r\n';
}

const order = [], by = {};
s.events.forEach((e) => { if (!by[e.session]) { by[e.session] = []; order.push(e.session); } by[e.session].push(e); });

order.forEach((name) => {
  const ev = by[name].slice().sort((a, b) => a.t - b.t);
  const safe = name.replace(/[^\w\- ]+/g, '_').trim().replace(/ +/g, '_');
  fs.writeFileSync(path.join(dir, safe + '.csv'), csvFor(ev));
  console.log('  OK ' + safe + '.csv  (' + ev.length + ' pasos)');
});
fs.writeFileSync(path.join(dir, '_TODAS.csv'), csvFor(s.events.slice().sort((a, b) => a.t - b.t)));
console.log('  OK _TODAS.csv  (' + s.events.length + ' pasos en total)');
console.log('\nCarpeta:', dir);
