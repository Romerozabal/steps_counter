// Export each session to its own CSV plus one combined file. Directory: csv-export/
const fs = require('fs');
const path = require('path');

const s = JSON.parse(fs.readFileSync(path.join(__dirname, 'steps.json'), 'utf8'));
const dir = path.join(__dirname, 'csv-export');
if (!fs.existsSync(dir)) fs.mkdirSync(dir);

function cell(v) {
  const t = String(v == null ? '' : v);
  return /[",\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t;
}
function csvFor(events) {
  const rows = [['n', 'session', 'leg', 'local_datetime', 'iso', 'epoch_ms'].join(',')];
  events.forEach((e, i) => {
    const d = new Date(e.t);
    rows.push([i + 1, e.session, e.leg === 'L' ? 'left' : 'right',
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
  console.log('  OK ' + safe + '.csv  (' + ev.length + ' steps)');
});
fs.writeFileSync(path.join(dir, '_ALL.csv'), csvFor(s.events.slice().sort((a, b) => a.t - b.t)));
console.log('  OK _ALL.csv  (' + s.events.length + ' total steps)');
console.log('\nDirectory:', dir);
