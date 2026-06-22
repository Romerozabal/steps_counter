#!/usr/bin/env node
/*
 * Genera una figura (SVG dentro de un HTML) de la ULTIMA sesion con eventos:
 * una linea temporal donde se marca cuando ocurrio cada paso de cada pierna.
 *
 * Uso:   node generar-figura.js
 * Crea:  figura-<sesion>.html  (abrelo con doble clic)
 */
const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, 'pasos.json');
const state = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));

// --- localizar la ultima sesion que tenga eventos ---------------------------
const order = [];
const bySes = {};
state.events.forEach((e) => {
  if (!bySes[e.session]) { bySes[e.session] = []; order.push(e.session); }
  bySes[e.session].push(e);
});
const sesion = order[order.length - 1];
if (!sesion) { console.error('No hay eventos.'); process.exit(1); }
const ev = bySes[sesion].slice().sort((a, b) => a.t - b.t);

const t0 = ev[0].t;
const t1 = ev[ev.length - 1].t;
const durS = Math.max(1, (t1 - t0) / 1000);

// --- metricas ---------------------------------------------------------------
const L = ev.filter((e) => e.leg === 'L');
const R = ev.filter((e) => e.leg === 'R');
const ints = [];
for (let i = 1; i < ev.length; i++) ints.push((ev[i].t - ev[i - 1].t) / 1000);
const mean = (a) => a.reduce((s, x) => s + x, 0) / (a.length || 1);
const intMedia = mean(ints);
const cadencia = (ev.length / durS) * 60; // pasos por minuto

// --- dibujo SVG -------------------------------------------------------------
const W = 960, H = 380;
const m = { l: 90, r: 30, t: 70, b: 70 };
const plotW = W - m.l - m.r;
const yIzq = m.t + 40;
const yDer = m.t + 130;
const x = (t) => m.l + ((t - t0) / 1000 / durS) * plotW;

let svg = '';
// ejes/guias
svg += `<line x1="${m.l}" y1="${yIzq}" x2="${m.l + plotW}" y2="${yIzq}" stroke="#334155" stroke-width="1.5"/>`;
svg += `<line x1="${m.l}" y1="${yDer}" x2="${m.l + plotW}" y2="${yDer}" stroke="#334155" stroke-width="1.5"/>`;
svg += `<text x="${m.l - 12}" y="${yIzq + 5}" fill="#2563eb" font-size="15" font-weight="700" text-anchor="end">Izquierda</text>`;
svg += `<text x="${m.l - 12}" y="${yDer + 5}" fill="#16a34a" font-size="15" font-weight="700" text-anchor="end">Derecha</text>`;

// ticks de tiempo (cada ~ paso entero de segundos)
const stepSec = durS <= 20 ? 2 : durS <= 60 ? 5 : 10;
for (let s = 0; s <= durS + 0.001; s += stepSec) {
  const xx = m.l + (s / durS) * plotW;
  svg += `<line x1="${xx}" y1="${yIzq - 30}" x2="${xx}" y2="${yDer + 30}" stroke="#1e293b" stroke-width="1"/>`;
  svg += `<text x="${xx}" y="${yDer + 50}" fill="#64748b" font-size="12" text-anchor="middle">${s}s</text>`;
}
svg += `<text x="${m.l + plotW / 2}" y="${H - 12}" fill="#94a3b8" font-size="13" text-anchor="middle">Tiempo desde el inicio (segundos)</text>`;

// linea fina que une los pasos en orden (muestra la alternancia)
let pathPts = ev.map((e) => `${x(e.t).toFixed(1)},${e.leg === 'L' ? yIzq : yDer}`).join(' ');
svg += `<polyline points="${pathPts}" fill="none" stroke="#475569" stroke-width="1" opacity="0.5"/>`;

// marcadores
ev.forEach((e) => {
  const cy = e.leg === 'L' ? yIzq : yDer;
  const col = e.leg === 'L' ? '#2563eb' : '#16a34a';
  svg += `<circle cx="${x(e.t).toFixed(1)}" cy="${cy}" r="7" fill="${col}" stroke="#0f172a" stroke-width="1.5"/>`;
});

const fecha = new Date(t0).toLocaleString();
const html = `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8">
<title>Figura — ${sesion}</title>
<style>
 body{margin:0;background:#0f172a;color:#e2e8f0;font-family:system-ui,-apple-system,sans-serif;padding:24px;}
 h1{font-size:22px;margin:0 0 4px;} .sub{color:#94a3b8;margin:0 0 16px;font-size:14px;}
 .cards{display:flex;flex-wrap:wrap;gap:12px;margin:16px 0;}
 .card{background:#1e293b;border:1px solid #334155;border-radius:12px;padding:12px 16px;min-width:120px;}
 .card .k{color:#94a3b8;font-size:12px;} .card .v{font-size:22px;font-weight:800;}
 svg{background:#0b1220;border:1px solid #1e293b;border-radius:14px;max-width:100%;height:auto;}
</style></head><body>
 <h1>Línea temporal de pasos — «${sesion}»</h1>
 <p class="sub">Inicio: ${fecha} · Duración: ${durS.toFixed(1)} s</p>
 <div class="cards">
   <div class="card"><div class="k">Total pasos</div><div class="v">${ev.length}</div></div>
   <div class="card"><div class="k">Izquierda</div><div class="v" style="color:#3b82f6">${L.length}</div></div>
   <div class="card"><div class="k">Derecha</div><div class="v" style="color:#22c55e">${R.length}</div></div>
   <div class="card"><div class="k">Cadencia</div><div class="v">${cadencia.toFixed(0)} <span style="font-size:13px;font-weight:500;color:#94a3b8">pasos/min</span></div></div>
   <div class="card"><div class="k">Intervalo medio</div><div class="v">${intMedia.toFixed(2)} <span style="font-size:13px;font-weight:500;color:#94a3b8">s</span></div></div>
 </div>
 <svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">${svg}</svg>
</body></html>`;

const safe = sesion.replace(/[^\w\-]+/g, '_');
const out = path.join(__dirname, 'figura-' + safe + '.html');
fs.writeFileSync(out, html, 'utf8');
console.log('Figura generada:', out);
console.log('Sesion:', sesion, '| pasos:', ev.length, '| L:', L.length, 'R:', R.length,
  '| duracion:', durS.toFixed(1) + 's', '| cadencia:', cadencia.toFixed(0), 'ppm');
