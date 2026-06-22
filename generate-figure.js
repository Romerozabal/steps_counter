#!/usr/bin/env node
/*
 * Generates an HTML file containing an SVG figure for the last session with events:
 * a timeline showing when each leg step occurred.
 *
 * Usage:   node generate-figure.js
 * Creates:  figure-<session>.html  (open it with a double click)
 */
const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, 'steps.json');
const state = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));

// --- find the last session that has events ---------------------------
const order = [];
const bySes = {};
state.events.forEach((e) => {
  if (!bySes[e.session]) { bySes[e.session] = []; order.push(e.session); }
  bySes[e.session].push(e);
});
const session = order[order.length - 1];
if (!session) { console.error('No events found.'); process.exit(1); }
const ev = bySes[session].slice().sort((a, b) => a.t - b.t);

const t0 = ev[0].t;
const t1 = ev[ev.length - 1].t;
const durS = Math.max(1, (t1 - t0) / 1000);

// --- metrics ---------------------------------------------------------------
const L = ev.filter((e) => e.leg === 'L');
const R = ev.filter((e) => e.leg === 'R');
const ints = [];
for (let i = 1; i < ev.length; i++) ints.push((ev[i].t - ev[i - 1].t) / 1000);
const mean = (a) => a.reduce((s, x) => s + x, 0) / (a.length || 1);
const meanInterval = mean(ints);
const cadence = (ev.length / durS) * 60; // steps per minute

// --- SVG drawing -------------------------------------------------------------
const W = 960, H = 380;
const m = { l: 90, r: 30, t: 70, b: 70 };
const plotW = W - m.l - m.r;
const yLeft = m.t + 40;
const yRight = m.t + 130;
const x = (t) => m.l + ((t - t0) / 1000 / durS) * plotW;

let svg = '';
// axes/guides
svg += `<line x1="${m.l}" y1="${yLeft}" x2="${m.l + plotW}" y2="${yLeft}" stroke="#334155" stroke-width="1.5"/>`;
svg += `<line x1="${m.l}" y1="${yRight}" x2="${m.l + plotW}" y2="${yRight}" stroke="#334155" stroke-width="1.5"/>`;
svg += `<text x="${m.l - 12}" y="${yLeft + 5}" fill="#2563eb" font-size="15" font-weight="700" text-anchor="end">Left</text>`;
svg += `<text x="${m.l - 12}" y="${yRight + 5}" fill="#16a34a" font-size="15" font-weight="700" text-anchor="end">Right</text>`;

// time ticks
const stepSec = durS <= 20 ? 2 : durS <= 60 ? 5 : 10;
for (let s = 0; s <= durS + 0.001; s += stepSec) {
  const xx = m.l + (s / durS) * plotW;
  svg += `<line x1="${xx}" y1="${yLeft - 30}" x2="${xx}" y2="${yRight + 30}" stroke="#1e293b" stroke-width="1"/>`;
  svg += `<text x="${xx}" y="${yRight + 50}" fill="#64748b" font-size="12" text-anchor="middle">${s}s</text>`;
}
svg += `<text x="${m.l + plotW / 2}" y="${H - 12}" fill="#94a3b8" font-size="13" text-anchor="middle">Time from start (seconds)</text>`;

// thin line connecting steps in order (shows alternation)
let pathPts = ev.map((e) => `${x(e.t).toFixed(1)},${e.leg === 'L' ? yLeft : yRight}`).join(' ');
svg += `<polyline points="${pathPts}" fill="none" stroke="#475569" stroke-width="1" opacity="0.5"/>`;

// markers
ev.forEach((e) => {
  const cy = e.leg === 'L' ? yLeft : yRight;
  const col = e.leg === 'L' ? '#2563eb' : '#16a34a';
  svg += `<circle cx="${x(e.t).toFixed(1)}" cy="${cy}" r="7" fill="${col}" stroke="#0f172a" stroke-width="1.5"/>`;
});

const startDate = new Date(t0).toLocaleString();
const html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
<title>Figure — ${session}</title>
<style>
 body{margin:0;background:#0f172a;color:#e2e8f0;font-family:system-ui,-apple-system,sans-serif;padding:24px;}
 h1{font-size:22px;margin:0 0 4px;} .sub{color:#94a3b8;margin:0 0 16px;font-size:14px;}
 .cards{display:flex;flex-wrap:wrap;gap:12px;margin:16px 0;}
 .card{background:#1e293b;border:1px solid #334155;border-radius:12px;padding:12px 16px;min-width:120px;}
 .card .k{color:#94a3b8;font-size:12px;} .card .v{font-size:22px;font-weight:800;}
 svg{background:#0b1220;border:1px solid #1e293b;border-radius:14px;max-width:100%;height:auto;}
</style></head><body>
 <h1>Step timeline — «${session}»</h1>
 <p class="sub">Start: ${startDate} · Duration: ${durS.toFixed(1)} s</p>
 <div class="cards">
   <div class="card"><div class="k">Total steps</div><div class="v">${ev.length}</div></div>
   <div class="card"><div class="k">Left</div><div class="v" style="color:#3b82f6">${L.length}</div></div>
   <div class="card"><div class="k">Right</div><div class="v" style="color:#22c55e">${R.length}</div></div>
   <div class="card"><div class="k">Cadence</div><div class="v">${cadence.toFixed(0)} <span style="font-size:13px;font-weight:500;color:#94a3b8">steps/min</span></div></div>
   <div class="card"><div class="k">Mean interval</div><div class="v">${meanInterval.toFixed(2)} <span style="font-size:13px;font-weight:500;color:#94a3b8">s</span></div></div>
 </div>
 <svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">${svg}</svg>
</body></html>`;

const safe = session.replace(/[^\w\-]+/g, '_');
const out = path.join(__dirname, 'figure-' + safe + '.html');
fs.writeFileSync(out, html, 'utf8');
console.log('Figure generated:', out);
console.log('Session:', session, '| steps:', ev.length, '| L:', L.length, 'R:', R.length,
  '| duration:', durS.toFixed(1) + 's', '| cadence:', cadence.toFixed(0), 'steps/min');
