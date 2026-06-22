#!/usr/bin/env node
/*
 * Steps Counter - local web server
 * --------------------------------
 * Serves a mobile-friendly page with two large buttons (left leg / right leg).
 * Each press is saved with the computer time under the active session name.
 * Data can be exported to CSV.
 *
 * Usage:
 *   node steps-counter.js
 * Then open on your phone:  http://COMPUTER-IP:3000
 * (the computer and phone must be on the same Wi-Fi network)
 *
 * No dependencies: only Node.js.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PORT = process.env.PORT || 3000;
const DATA_FILE = process.env.STEP_DATA_FILE || path.join(__dirname, 'steps.json');

// ---- State / persistence ---------------------------------------------------

let state = { session: 'Session 1', events: [] };

function load() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      state = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
      if (!Array.isArray(state.events)) state.events = [];
      if (!state.session) state.session = 'Session 1';
    }
  } catch (e) {
    console.error('Could not read steps.json, starting empty:', e.message);
    state = { session: 'Session 1', events: [] };
  }
}

function save() {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(state, null, 2));
  } catch (e) {
    console.error('Could not save steps.json:', e.message);
  }
}

load();

// ---- Utilities -------------------------------------------------------------

function readBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (c) => (data += c));
    req.on('end', () => {
      try { resolve(data ? JSON.parse(data) : {}); }
      catch { resolve({}); }
    });
  });
}

function csvCell(v) {
  const s = String(v == null ? '' : v);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function buildCsv(names) {
  const set = names && names.length ? new Set(names) : null;
  const evs = state.events
    .filter((e) => !set || set.has(e.session))
    .slice()
    .sort((a, b) => a.t - b.t);
  const header = ['n', 'session', 'leg', 'local_datetime', 'iso', 'epoch_ms'];
  const rows = [header.join(',')];
  evs.forEach((e, i) => {
    const d = new Date(e.t);
    rows.push([
      i + 1,
      e.session,
      e.leg === 'L' ? 'left' : 'right',
      d.toLocaleString(),
      d.toISOString(),
      e.t,
    ].map(csvCell).join(','));
  });
  return '﻿' + rows.join('\r\n') + '\r\n'; // BOM for Excel
}

// List recordings with metrics in original order.
function sessionList() {
  const order = [], by = {};
  state.events.forEach((e) => {
    if (!by[e.session]) { by[e.session] = []; order.push(e.session); }
    by[e.session].push(e);
  });
  return order.map((name) => {
    const ev = by[name].slice().sort((a, b) => a.t - b.t);
    const L = ev.filter((e) => e.leg === 'L').length;
    const dur = ev.length > 1 ? (ev[ev.length - 1].t - ev[0].t) / 1000 : 0;
    return {
      name, count: ev.length, L, R: ev.length - L,
      start: ev[0].t, end: ev[ev.length - 1].t, dur,
      active: name === state.session,
    };
  });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

// Build an HTML/SVG figure for one session step timeline.
function buildFigureHtml(session) {
  const ev = state.events.filter((e) => e.session === session).sort((a, b) => a.t - b.t);
  if (ev.length === 0) {
    return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Figure</title><style>body{margin:0;background:#0f172a;color:#e2e8f0;font-family:system-ui,sans-serif;
display:flex;align-items:center;justify-content:center;height:100vh;text-align:center;padding:24px;}</style></head>
<body><div><h2>«${escapeHtml(session)}»</h2><p>This session does not have steps yet.<br>Add steps and save again.</p></div></body></html>`;
  }

  const t0 = ev[0].t, t1 = ev[ev.length - 1].t;
  const durS = Math.max(1, (t1 - t0) / 1000);
  const L = ev.filter((e) => e.leg === 'L');
  const R = ev.filter((e) => e.leg === 'R');
  const ints = [];
  for (let i = 1; i < ev.length; i++) ints.push((ev[i].t - ev[i - 1].t) / 1000);
  const meanInterval = ints.reduce((s, x) => s + x, 0) / (ints.length || 1);
  const cadence = (ev.length / durS) * 60;

  const W = 960, H = 380, m = { l: 90, r: 30, t: 70, b: 70 };
  const plotW = W - m.l - m.r;
  const yLeft = m.t + 40, yRight = m.t + 130;
  const x = (t) => m.l + ((t - t0) / 1000 / durS) * plotW;

  let svg = '';
  svg += `<line x1="${m.l}" y1="${yLeft}" x2="${m.l + plotW}" y2="${yLeft}" stroke="#334155" stroke-width="1.5"/>`;
  svg += `<line x1="${m.l}" y1="${yRight}" x2="${m.l + plotW}" y2="${yRight}" stroke="#334155" stroke-width="1.5"/>`;
  svg += `<text x="${m.l - 12}" y="${yLeft + 5}" fill="#2563eb" font-size="15" font-weight="700" text-anchor="end">Left</text>`;
  svg += `<text x="${m.l - 12}" y="${yRight + 5}" fill="#16a34a" font-size="15" font-weight="700" text-anchor="end">Right</text>`;

  const stepSec = durS <= 20 ? 2 : durS <= 60 ? 5 : 10;
  for (let s = 0; s <= durS + 0.001; s += stepSec) {
    const xx = m.l + (s / durS) * plotW;
    svg += `<line x1="${xx}" y1="${yLeft - 30}" x2="${xx}" y2="${yRight + 30}" stroke="#1e293b" stroke-width="1"/>`;
    svg += `<text x="${xx}" y="${yRight + 50}" fill="#64748b" font-size="12" text-anchor="middle">${s}s</text>`;
  }
  svg += `<text x="${m.l + plotW / 2}" y="${H - 12}" fill="#94a3b8" font-size="13" text-anchor="middle">Time from start (seconds)</text>`;

  const pathPts = ev.map((e) => `${x(e.t).toFixed(1)},${e.leg === 'L' ? yLeft : yRight}`).join(' ');
  svg += `<polyline points="${pathPts}" fill="none" stroke="#475569" stroke-width="1" opacity="0.5"/>`;
  ev.forEach((e) => {
    const cy = e.leg === 'L' ? yLeft : yRight;
    const col = e.leg === 'L' ? '#2563eb' : '#16a34a';
    svg += `<circle cx="${x(e.t).toFixed(1)}" cy="${cy}" r="7" fill="${col}" stroke="#0f172a" stroke-width="1.5"/>`;
  });

  const startDate = new Date(t0).toLocaleString();
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Figure — ${escapeHtml(session)}</title>
<style>
 body{margin:0;background:#0f172a;color:#e2e8f0;font-family:system-ui,-apple-system,sans-serif;padding:20px;}
 h1{font-size:20px;margin:0 0 4px;} .sub{color:#94a3b8;margin:0 0 14px;font-size:13px;}
 .cards{display:flex;flex-wrap:wrap;gap:10px;margin:14px 0;}
 .card{background:#1e293b;border:1px solid #334155;border-radius:12px;padding:10px 14px;min-width:100px;}
 .card .k{color:#94a3b8;font-size:12px;} .card .v{font-size:20px;font-weight:800;}
 svg{background:#0b1220;border:1px solid #1e293b;border-radius:14px;max-width:100%;height:auto;}
 a{display:inline-block;margin-top:16px;color:#94a3b8;font-size:14px;}
</style></head><body>
 <h1>Step timeline — «${escapeHtml(session)}»</h1>
 <p class="sub">Start: ${startDate} · Duration: ${durS.toFixed(1)} s</p>
 <div class="cards">
   <div class="card"><div class="k">Total steps</div><div class="v">${ev.length}</div></div>
   <div class="card"><div class="k">Left</div><div class="v" style="color:#3b82f6">${L.length}</div></div>
   <div class="card"><div class="k">Right</div><div class="v" style="color:#22c55e">${R.length}</div></div>
   <div class="card"><div class="k">Cadence</div><div class="v">${cadence.toFixed(0)} <span style="font-size:12px;font-weight:500;color:#94a3b8">steps/min</span></div></div>
   <div class="card"><div class="k">Mean interval</div><div class="v">${meanInterval.toFixed(2)} <span style="font-size:12px;font-weight:500;color:#94a3b8">s</span></div></div>
 </div>
 <svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">${svg}</svg>
 <br><a href="/">← Back to counter</a>
</body></html>`;
}

// Page for reviewing recordings and downloading selected CSV files.
function pageRecordings() {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Recordings</title>
<style>
 :root{--bg:#07111f;--panel:#101b2e;--panel2:#15223a;--line:#253553;--text:#edf4ff;--muted:#9fb0c8;--ok:#15803d;--button:#22314f;}
 *{box-sizing:border-box;-webkit-tap-highlight-color:transparent;}
 body{margin:0;min-height:100vh;background:var(--bg);color:var(--text);font-family:system-ui,-apple-system,Segoe UI,sans-serif;padding:14px;}
 .page{max-width:980px;margin:0 auto;display:flex;flex-direction:column;gap:12px;}
 .header{display:flex;justify-content:space-between;align-items:center;gap:12px;}
 h1{font-size:22px;margin:0;}
 .sub{color:var(--muted);font-size:13px;margin-top:2px;}
 button,a.btn{padding:12px 14px;font-size:14px;border-radius:10px;border:none;font-weight:700;cursor:pointer;text-decoration:none;display:inline-block;color:var(--text);background:var(--button);}
 button:active,a.btn:active{transform:translateY(1px);filter:brightness(.94);}
 .primary{background:var(--ok)!important;color:#fff;} .sec{background:var(--button);color:var(--text);}
 .actions{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;}
 .list{display:flex;flex-direction:column;gap:10px;}
 .row{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:12px;display:grid;grid-template-columns:auto 1fr auto;gap:12px;align-items:center;}
 .row.act{border-color:#22c55e;box-shadow:0 0 0 1px #22c55e33 inset;}
 .chk{width:24px;height:24px;flex:0 0 auto;accent-color:#22c55e;}
 .name{font-size:16px;font-weight:800;word-break:break-word;}
 .meta{color:var(--muted);font-size:13px;margin-top:4px;}
 .badge{display:inline-block;background:#166534;color:#fff;font-size:11px;padding:2px 8px;border-radius:999px;margin-left:6px;vertical-align:middle;}
 .rowbtns{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end;}
 .rowbtns a{background:var(--button);color:var(--text);padding:9px 11px;font-size:13px;border-radius:8px;text-decoration:none;font-weight:700;}
 .rowbtns a.csv{background:#1d4ed8;color:#fff;}
 .empty{color:var(--muted);background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:18px;text-align:center;}
 .back{white-space:nowrap;}
 @media(max-width:720px){body{padding:8px}.header{align-items:flex-start}.actions{grid-template-columns:1fr 1fr}.row{grid-template-columns:auto 1fr}.rowbtns{grid-column:1 / -1;justify-content:stretch}.rowbtns a{flex:1;text-align:center}}
</style></head><body>
 <main class="page">
 <div class="header">
   <div><h1>Recordings</h1><div class="sub">Review sessions, export labels, and open timeline figures.</div></div>
   <a class="btn back" href="/">← Counter</a>
 </div>
 <div class="actions">
   <a class="btn primary" href="/export.csv">⬇ Download ALL (one CSV)</a>
   <button class="primary" id="dlSel">⬇ Download selected</button>
   <button class="sec" id="all">Select all</button>
   <button class="sec" id="none">None</button>
 </div>
 <div class="list" id="list"><p class="empty">Loading…</p></div>
 </main>
<script>
 const fmt = (ms) => new Date(ms).toLocaleString();
 const enc = encodeURIComponent;
 let SESS = [];
 function render() {
   const c = document.getElementById('list');
   if (!SESS.length) { c.innerHTML = '<p class="empty">There are no recordings with data yet.</p>'; return; }
   c.innerHTML = SESS.map((s, i) => {
     const dur = s.dur >= 60 ? (s.dur/60).toFixed(1)+' min' : s.dur.toFixed(0)+' s';
     return '<div class="row'+(s.active?' act':'')+'">' +
       '<input class="chk" type="checkbox" data-i="'+i+'">' +
       '<div class="info"><div class="name">'+s.name.replace(/</g,'&lt;')+(s.active?'<span class="badge">active</span>':'')+'</div>' +
       '<div class="meta">'+s.count+' steps (L:'+s.L+' / R:'+s.R+') · '+dur+' · '+fmt(s.start)+'</div></div>' +
       '<div class="rowbtns">' +
         '<a href="/figure?s='+enc(s.name)+'" target="_blank">Figure</a>' +
         '<a class="csv" href="/export.csv?sel='+i+'">CSV</a>' +
       '</div></div>';
   }).join('');
 }
 function checked() {
   return [...document.querySelectorAll('.chk')].filter(c=>c.checked).map(c=>c.dataset.i);
 }
 document.getElementById('dlSel').addEventListener('click', () => {
   const sel = checked();
   if (!sel.length) { alert('Select at least one recording.'); return; }
   window.location = '/export.csv?sel=' + sel.join(',');
 });
 document.getElementById('all').addEventListener('click', () => document.querySelectorAll('.chk').forEach(c=>c.checked=true));
 document.getElementById('none').addEventListener('click', () => document.querySelectorAll('.chk').forEach(c=>c.checked=false));
 fetch('/sessions').then(r=>r.json()).then(d=>{ SESS=d; render(); });
</script>
</body></html>`;
}

function localIPs() {
  const ifaces = os.networkInterfaces();
  const ips = [];
  for (const name of Object.keys(ifaces)) {
    for (const ni of ifaces[name]) {
      if (ni.family === 'IPv4' && !ni.internal) ips.push(ni.address);
    }
  }
  return ips;
}

function counts() {
  let L = 0, R = 0;
  let firstTs = 0, lastTs = 0, lastLeg = '';
  for (const e of state.events) {
    if (e.session !== state.session) continue;
    if (e.leg === 'L') L++; else R++;
    if (!firstTs || e.t < firstTs) firstTs = e.t;
    if (!lastTs || e.t >= lastTs) {
      lastTs = e.t;
      lastLeg = e.leg;
    }
  }
  const elapsedSec = firstTs && lastTs ? Math.max(0, Math.round((lastTs - firstTs) / 1000)) : 0;
  return { L, R, total: L + R, lastTs, lastLeg, elapsedSec };
}

// ---- HTML page -----------------------------------------------------------

function pageHtml() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
<title>Steps Counter</title>
<style>
  :root {
    --bg:#07111f; --panel:#101b2e; --panel2:#15223a; --line:#253553;
    --text:#edf4ff; --muted:#9fb0c8; --left:#2563eb; --right:#16a34a;
    --danger:#b4232f; --ok:#15803d; --button:#22314f;
  }
  * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
  html, body { margin:0; min-height:100%; font-family: system-ui, -apple-system, Segoe UI, sans-serif; background:var(--bg); color:var(--text); }
  body { display:flex; justify-content:center; padding:12px; }
  .app { width:min(980px, 100%); min-height:calc(100vh - 24px); display:grid; grid-template-rows:auto auto auto 1fr auto; gap:12px; }
  .header { display:flex; align-items:center; justify-content:space-between; gap:12px; }
  .title { margin:0; font-size:20px; letter-spacing:.2px; }
  .subtitle { color:var(--muted); font-size:12px; margin-top:2px; }
  .pill { border:1px solid var(--line); background:var(--panel); color:#b8e2c6; border-radius:999px; padding:7px 10px; font-size:12px; white-space:nowrap; }
  .panel { background:var(--panel); border:1px solid var(--line); border-radius:14px; padding:12px; }
  .session { display:grid; grid-template-columns:1fr auto; gap:8px; align-items:center; }
  .session input { width:100%; min-width:0; padding:13px 14px; font-size:17px; border-radius:10px; border:1px solid var(--line); background:#0b1424; color:var(--text); outline:none; }
  .session input:focus { border-color:#60a5fa; box-shadow:0 0 0 3px #2563eb33; }
  button { border:none; color:var(--text); font-weight:700; cursor:pointer; touch-action:manipulation; }
  button:disabled { opacity:.55; cursor:not-allowed; }
  .btn { padding:13px 14px; font-size:15px; border-radius:10px; background:var(--button); }
  .btn:active { transform:translateY(1px); filter:brightness(.92); }
  .ok { background:var(--ok) !important; }
  .danger { background:var(--danger) !important; }
  .stats { display:grid; grid-template-columns:repeat(4, 1fr); gap:8px; }
  .stat { background:var(--panel2); border:1px solid var(--line); border-radius:12px; padding:10px; min-width:0; }
  .stat .k { color:var(--muted); font-size:12px; margin-bottom:4px; }
  .stat .v { font-size:28px; font-weight:850; line-height:1; }
  .stat.left .v { color:#7db0ff; }
  .stat.right .v { color:#71df91; }
  .status { display:grid; grid-template-columns:1fr auto; gap:8px; color:var(--muted); font-size:13px; margin-top:8px; }
  .pads { display:grid; grid-template-columns:1fr 1fr; gap:12px; min-height:310px; }
  .pad { position:relative; overflow:hidden; border-radius:18px; color:#fff; font-weight:900; letter-spacing:.5px;
         display:flex; flex-direction:column; align-items:center; justify-content:center; gap:10px; user-select:none; touch-action:manipulation; }
  .pad.left { background:linear-gradient(160deg, #1d4ed8, #2563eb); }
  .pad.right { background:linear-gradient(160deg, #15803d, #16a34a); }
  .pad .side { font-size:20px; opacity:.95; }
  .pad .n { font-size:clamp(72px, 18vw, 150px); line-height:.9; }
  .pad .hint { font-size:13px; opacity:.78; font-weight:650; }
  .pad:active, .pad.flash { transform:scale(.992); filter:brightness(1.12); }
  .pad.flash::after { content:""; position:absolute; inset:0; background:#ffffff2c; animation:fade .28s ease-out forwards; }
  @keyframes fade { from { opacity:1; } to { opacity:0; } }
  .actions { display:grid; grid-template-columns:repeat(5, 1fr); gap:8px; }
  .toast { position:fixed; left:50%; bottom:24px; transform:translateX(-50%); background:#020617e8; border:1px solid var(--line); padding:10px 14px; border-radius:999px; font-size:14px; opacity:0; transition:opacity .2s, transform .2s; pointer-events:none; }
  .toast.show { opacity:1; }
  @media (max-width: 760px) {
    body { padding:8px; }
    .app { min-height:calc(100vh - 16px); gap:8px; }
    .header { align-items:flex-start; }
    .session { grid-template-columns:1fr; }
    .stats { grid-template-columns:repeat(2, 1fr); }
    .pads { min-height:360px; gap:8px; }
    .actions { grid-template-columns:repeat(2, 1fr); }
    .actions .wide { grid-column:span 2; }
  }
</style>
</head>
<body>
  <main class="app">
  <header class="header">
    <div>
      <h1 class="title">Steps Counter</h1>
      <div class="subtitle">Manual labels for gait segmentation experiments</div>
    </div>
    <div class="pill" id="saveStatus">Ready</div>
  </header>

  <section class="panel">
    <div class="session">
      <input id="session" placeholder="Session name" autocomplete="off">
      <button id="newSession" class="btn ok">New session</button>
    </div>
    <div class="status">
      <span id="lastStep">No steps recorded in this session yet</span>
      <span id="elapsed">0 s</span>
    </div>
  </section>

  <section class="stats">
    <div class="stat left"><div class="k">Left</div><div class="v" id="cL">0</div></div>
    <div class="stat"><div class="k">Total</div><div class="v" id="cT">0</div></div>
    <div class="stat right"><div class="k">Right</div><div class="v" id="cR">0</div></div>
    <div class="stat"><div class="k">Elapsed</div><div class="v" id="elapsedBig">0s</div></div>
  </section>

  <section class="pads">
    <button class="pad left" data-leg="L" aria-label="Record left step">
      <span class="side">LEFT STEP</span>
      <span class="n" id="nL">0</span>
      <span class="hint">Tap or press L</span>
    </button>
    <button class="pad right" data-leg="R" aria-label="Record right step">
      <span class="side">RIGHT STEP</span>
      <span class="n" id="nR">0</span>
      <span class="hint">Tap or press R</span>
    </button>
  </section>

  <section class="actions">
    <button id="undo" class="btn">Undo</button>
    <button id="save" class="btn ok">Save</button>
    <button id="reset" class="btn danger">Clear</button>
    <button id="grab" class="btn">Recordings</button>
    <button id="export" class="btn wide">Export CSV</button>
  </section>

  </main>

  <div class="toast" id="toast"></div>

<script>
  const $ = (id) => document.getElementById(id);
  let toastT;
  function toast(msg) {
    const t = $('toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 1200);
  }
  function render(s) {
    $('nL').textContent = s.L; $('nR').textContent = s.R;
    $('cL').textContent = s.L; $('cR').textContent = s.R; $('cT').textContent = s.total;
    $('elapsed').textContent = (s.elapsedSec || 0) + ' s';
    $('elapsedBig').textContent = (s.elapsedSec || 0) + 's';
    $('lastStep').textContent = s.lastTs
      ? 'Last step: ' + (s.lastLeg === 'L' ? 'left' : 'right') + ' at ' + new Date(s.lastTs).toLocaleTimeString()
      : 'No steps recorded in this session yet';
    if (document.activeElement !== $('session')) $('session').value = s.session;
  }
  async function api(url, body) {
    const r = await fetch(url, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body||{}) });
    return r.json();
  }
  async function step(leg) {
    if (navigator.vibrate) navigator.vibrate(20);
    const pad = document.querySelector('.pad[data-leg="' + leg + '"]');
    if (pad) {
      pad.classList.remove('flash');
      void pad.offsetWidth;
      pad.classList.add('flash');
    }
    render(await api('/step', { leg }));
    $('saveStatus').textContent = 'Saved';
  }
  document.querySelectorAll('.pad').forEach((p) => {
    p.addEventListener('click', () => step(p.dataset.leg));
  });
  $('newSession').addEventListener('click', async () => {
    const name = ($('session').value.trim()) || 'Session ' + new Date().toLocaleString();
    render(await api('/session', { name }));
    $('session').blur(); toast('New session: ' + name);
  });
  $('undo').addEventListener('click', async () => { render(await api('/undo')); toast('Undone'); });
  $('grab').addEventListener('click', () => { window.location = '/recordings'; });
  $('save').addEventListener('click', async () => {
    const w = window.open('/figure', '_blank'); // Open here from the user gesture to avoid popup blocking.
    const r = await api('/save');
    if (r.ok) {
      $('saveStatus').textContent = 'Saved';
      toast('Saved: ' + r.saved + ' events · figure opened');
      if (!w) window.location = '/figure'; // If the browser blocked the tab, navigate to the figure.
    } else {
      toast('ERROR while saving');
    }
  });
  $('reset').addEventListener('click', async () => {
    if (confirm('Clear all steps from this session?')) { render(await api('/reset')); toast('Session cleared'); }
  });
  $('export').addEventListener('click', () => { window.location = '/export.csv'; });
  document.addEventListener('keydown', (e) => {
    if (e.target && ['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return;
    if (e.key.toLowerCase() === 'l') step('L');
    if (e.key.toLowerCase() === 'r') step('R');
    if (e.key.toLowerCase() === 'u') $('undo').click();
  });
  // Initial state.
  fetch('/state').then(r => r.json()).then(render);
</script>
</body>
</html>`;
}

// ---- Server --------------------------------------------------------------

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://localhost');
  const url = u.pathname;
  const q = u.searchParams;

  if (req.method === 'GET' && url === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(pageHtml());
  }

  if (req.method === 'GET' && url === '/recordings') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(pageRecordings());
  }

  if (req.method === 'GET' && url === '/sessions') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify(sessionList()));
  }

  if (req.method === 'GET' && url === '/state') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify(Object.assign({ session: state.session }, counts())));
  }

  if (req.method === 'POST' && url === '/step') {
    const b = await readBody(req);
    const leg = b.leg === 'L' ? 'L' : 'R';
    state.events.push({ session: state.session, leg, t: Date.now() }); // computer time
    save();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify(Object.assign({ session: state.session }, counts())));
  }

  if (req.method === 'POST' && url === '/session') {
    const b = await readBody(req);
    if (b.name) state.session = String(b.name).slice(0, 100);
    save();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify(Object.assign({ session: state.session }, counts())));
  }

  if (req.method === 'POST' && url === '/undo') {
    for (let i = state.events.length - 1; i >= 0; i--) {
      if (state.events[i].session === state.session) { state.events.splice(i, 1); break; }
    }
    save();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify(Object.assign({ session: state.session }, counts())));
  }

  if (req.method === 'POST' && url === '/save') {
    save();
    // reread the file to confirm it was written to disk
    let saved = 0, ok = false;
    try {
      const disk = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
      saved = Array.isArray(disk.events) ? disk.events.length : 0;
      ok = true;
    } catch (e) { ok = false; }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ ok, saved, file: DATA_FILE }));
  }

  if (req.method === 'POST' && url === '/reset') {
    state.events = state.events.filter((e) => e.session !== state.session);
    save();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify(Object.assign({ session: state.session }, counts())));
  }

  if (req.method === 'GET' && url === '/figure') {
    // session from ?s=; otherwise active session; if it has no steps, use the last session with events
    let session = q.get('s') || state.session;
    if (!state.events.some((e) => e.session === session)) {
      for (let i = state.events.length - 1; i >= 0; i--) { session = state.events[i].session; break; }
    }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(buildFigureHtml(session));
  }

  if (req.method === 'GET' && url === '/export.csv') {
    // ?sel=indices from /sessions, ?session=NAME, or empty = all.
    let names = null, suffix = 'all';
    if (q.get('sel') !== null) {
      const list = sessionList();
      names = q.get('sel').split(',')
        .map((i) => list[parseInt(i, 10)])
        .filter(Boolean)
        .map((x) => x.name);
      suffix = names.length === 1 ? names[0].replace(/[^\w\-]+/g, '_') : 'selection';
    } else if (q.get('session')) {
      names = [q.get('session')];
      suffix = names[0].replace(/[^\w\-]+/g, '_');
    }
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    res.writeHead(200, {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="steps-' + suffix + '-' + stamp + '.csv"',
    });
    return res.end(buildCsv(names));
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not found');
});

server.listen(PORT, '0.0.0.0', () => {
  const ips = localIPs();
  console.log('\n  Steps Counter running\n');
  console.log('  On this computer:  http://localhost:' + PORT);
  if (ips.length) {
    console.log('  From a phone on the same Wi-Fi:');
    ips.forEach((ip) => console.log('      http://' + ip + ':' + PORT));
  } else {
    console.log('  (No network IP detected. Connect the computer to Wi-Fi.)');
  }
  console.log('\n  Press Ctrl+C to stop.\n');
});
