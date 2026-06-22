#!/usr/bin/env node
/*
 * Contador de pasos — servidor web local
 * --------------------------------------
 * Sirve una pagina para el movil con dos botones grandes (pierna izquierda /
 * pierna derecha). Cada pulsacion se guarda con la HORA DEL ORDENADOR (no la
 * del movil) y bajo el nombre de la sesion activa. Se puede exportar a CSV.
 *
 * Uso:
 *   node contador-pasos.js
 * Luego abre en el movil:  http://IP-DEL-ORDENADOR:3000
 * (el ordenador y el movil deben estar en la misma red wifi)
 *
 * Sin dependencias: solo Node.js.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'pasos.json');

// ---- Estado / persistencia -------------------------------------------------

let state = { session: 'Sesion 1', events: [] };

function load() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      state = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
      if (!Array.isArray(state.events)) state.events = [];
      if (!state.session) state.session = 'Sesion 1';
    }
  } catch (e) {
    console.error('No se pudo leer pasos.json, empezando vacio:', e.message);
    state = { session: 'Sesion 1', events: [] };
  }
}

function save() {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(state, null, 2));
  } catch (e) {
    console.error('No se pudo guardar pasos.json:', e.message);
  }
}

load();

// ---- Utilidades ------------------------------------------------------------

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
  const header = ['n', 'sesion', 'pierna', 'fecha_hora_local', 'iso', 'epoch_ms'];
  const rows = [header.join(',')];
  evs.forEach((e, i) => {
    const d = new Date(e.t);
    rows.push([
      i + 1,
      e.session,
      e.leg === 'L' ? 'izquierda' : 'derecha',
      d.toLocaleString(),
      d.toISOString(),
      e.t,
    ].map(csvCell).join(','));
  });
  return '﻿' + rows.join('\r\n') + '\r\n'; // BOM para Excel
}

// Lista de grabaciones (sesiones con eventos) con sus metricas, en orden de aparicion.
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

// Construye una figura (HTML con SVG) de la linea temporal de pasos de una sesion.
function buildFigureHtml(sesion) {
  const ev = state.events.filter((e) => e.session === sesion).sort((a, b) => a.t - b.t);
  if (ev.length === 0) {
    return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Figura</title><style>body{margin:0;background:#0f172a;color:#e2e8f0;font-family:system-ui,sans-serif;
display:flex;align-items:center;justify-content:center;height:100vh;text-align:center;padding:24px;}</style></head>
<body><div><h2>«${escapeHtml(sesion)}»</h2><p>Esta sesion todavia no tiene pasos.<br>Da algunos pasos y vuelve a guardar.</p></div></body></html>`;
  }

  const t0 = ev[0].t, t1 = ev[ev.length - 1].t;
  const durS = Math.max(1, (t1 - t0) / 1000);
  const L = ev.filter((e) => e.leg === 'L');
  const R = ev.filter((e) => e.leg === 'R');
  const ints = [];
  for (let i = 1; i < ev.length; i++) ints.push((ev[i].t - ev[i - 1].t) / 1000);
  const intMedia = ints.reduce((s, x) => s + x, 0) / (ints.length || 1);
  const cadencia = (ev.length / durS) * 60;

  const W = 960, H = 380, m = { l: 90, r: 30, t: 70, b: 70 };
  const plotW = W - m.l - m.r;
  const yIzq = m.t + 40, yDer = m.t + 130;
  const x = (t) => m.l + ((t - t0) / 1000 / durS) * plotW;

  let svg = '';
  svg += `<line x1="${m.l}" y1="${yIzq}" x2="${m.l + plotW}" y2="${yIzq}" stroke="#334155" stroke-width="1.5"/>`;
  svg += `<line x1="${m.l}" y1="${yDer}" x2="${m.l + plotW}" y2="${yDer}" stroke="#334155" stroke-width="1.5"/>`;
  svg += `<text x="${m.l - 12}" y="${yIzq + 5}" fill="#2563eb" font-size="15" font-weight="700" text-anchor="end">Izquierda</text>`;
  svg += `<text x="${m.l - 12}" y="${yDer + 5}" fill="#16a34a" font-size="15" font-weight="700" text-anchor="end">Derecha</text>`;

  const stepSec = durS <= 20 ? 2 : durS <= 60 ? 5 : 10;
  for (let s = 0; s <= durS + 0.001; s += stepSec) {
    const xx = m.l + (s / durS) * plotW;
    svg += `<line x1="${xx}" y1="${yIzq - 30}" x2="${xx}" y2="${yDer + 30}" stroke="#1e293b" stroke-width="1"/>`;
    svg += `<text x="${xx}" y="${yDer + 50}" fill="#64748b" font-size="12" text-anchor="middle">${s}s</text>`;
  }
  svg += `<text x="${m.l + plotW / 2}" y="${H - 12}" fill="#94a3b8" font-size="13" text-anchor="middle">Tiempo desde el inicio (segundos)</text>`;

  const pathPts = ev.map((e) => `${x(e.t).toFixed(1)},${e.leg === 'L' ? yIzq : yDer}`).join(' ');
  svg += `<polyline points="${pathPts}" fill="none" stroke="#475569" stroke-width="1" opacity="0.5"/>`;
  ev.forEach((e) => {
    const cy = e.leg === 'L' ? yIzq : yDer;
    const col = e.leg === 'L' ? '#2563eb' : '#16a34a';
    svg += `<circle cx="${x(e.t).toFixed(1)}" cy="${cy}" r="7" fill="${col}" stroke="#0f172a" stroke-width="1.5"/>`;
  });

  const fecha = new Date(t0).toLocaleString();
  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Figura — ${escapeHtml(sesion)}</title>
<style>
 body{margin:0;background:#0f172a;color:#e2e8f0;font-family:system-ui,-apple-system,sans-serif;padding:20px;}
 h1{font-size:20px;margin:0 0 4px;} .sub{color:#94a3b8;margin:0 0 14px;font-size:13px;}
 .cards{display:flex;flex-wrap:wrap;gap:10px;margin:14px 0;}
 .card{background:#1e293b;border:1px solid #334155;border-radius:12px;padding:10px 14px;min-width:100px;}
 .card .k{color:#94a3b8;font-size:12px;} .card .v{font-size:20px;font-weight:800;}
 svg{background:#0b1220;border:1px solid #1e293b;border-radius:14px;max-width:100%;height:auto;}
 a{display:inline-block;margin-top:16px;color:#94a3b8;font-size:14px;}
</style></head><body>
 <h1>Línea temporal de pasos — «${escapeHtml(sesion)}»</h1>
 <p class="sub">Inicio: ${fecha} · Duración: ${durS.toFixed(1)} s</p>
 <div class="cards">
   <div class="card"><div class="k">Total pasos</div><div class="v">${ev.length}</div></div>
   <div class="card"><div class="k">Izquierda</div><div class="v" style="color:#3b82f6">${L.length}</div></div>
   <div class="card"><div class="k">Derecha</div><div class="v" style="color:#22c55e">${R.length}</div></div>
   <div class="card"><div class="k">Cadencia</div><div class="v">${cadencia.toFixed(0)} <span style="font-size:12px;font-weight:500;color:#94a3b8">p/min</span></div></div>
   <div class="card"><div class="k">Intervalo medio</div><div class="v">${intMedia.toFixed(2)} <span style="font-size:12px;font-weight:500;color:#94a3b8">s</span></div></div>
 </div>
 <svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">${svg}</svg>
 <br><a href="/">← Volver al contador</a>
</body></html>`;
}

// Pagina para revisar las grabaciones y descargar los CSV que se quieran.
function pageGrabaciones() {
  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Grabaciones</title>
<style>
 body{margin:0;background:#0f172a;color:#e2e8f0;font-family:system-ui,-apple-system,sans-serif;padding:16px;}
 h1{font-size:20px;margin:0 0 12px;}
 .actions{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 14px;}
 button,a.btn{padding:10px 14px;font-size:14px;border-radius:10px;border:none;font-weight:600;cursor:pointer;text-decoration:none;display:inline-block;}
 .primary{background:#166534;color:#fff;} .sec{background:#334155;color:#e2e8f0;}
 .list{display:flex;flex-direction:column;gap:10px;}
 .row{background:#1e293b;border:1px solid #334155;border-radius:12px;padding:12px;display:flex;gap:12px;align-items:center;flex-wrap:wrap;}
 .row.act{border-color:#16a34a;}
 .chk{width:22px;height:22px;flex:0 0 auto;}
 .info{flex:1;min-width:160px;}
 .name{font-size:16px;font-weight:700;}
 .meta{color:#94a3b8;font-size:13px;margin-top:2px;}
 .badge{display:inline-block;background:#166534;color:#fff;font-size:11px;padding:1px 7px;border-radius:8px;margin-left:6px;vertical-align:middle;}
 .rowbtns{display:flex;gap:6px;}
 .rowbtns a{background:#334155;color:#e2e8f0;padding:8px 10px;font-size:13px;border-radius:8px;text-decoration:none;}
 .rowbtns a.csv{background:#1d4ed8;color:#fff;}
 .empty{color:#94a3b8;}
 .back{color:#94a3b8;font-size:14px;display:inline-block;margin-bottom:12px;}
</style></head><body>
 <a class="back" href="/">← Volver al contador</a>
 <h1>Grabaciones</h1>
 <div class="actions">
   <a class="btn primary" href="/export.csv">⬇ Descargar TODAS (un CSV)</a>
   <button class="primary" id="dlSel">⬇ Descargar seleccionadas</button>
   <button class="sec" id="all">Marcar todas</button>
   <button class="sec" id="none">Ninguna</button>
 </div>
 <div class="list" id="list"><p class="empty">Cargando…</p></div>
<script>
 const fmt = (ms) => new Date(ms).toLocaleString();
 const enc = encodeURIComponent;
 let SESS = [];
 function render() {
   const c = document.getElementById('list');
   if (!SESS.length) { c.innerHTML = '<p class="empty">Aún no hay grabaciones con datos.</p>'; return; }
   c.innerHTML = SESS.map((s, i) => {
     const dur = s.dur >= 60 ? (s.dur/60).toFixed(1)+' min' : s.dur.toFixed(0)+' s';
     return '<div class="row'+(s.active?' act':'')+'">' +
       '<input class="chk" type="checkbox" data-i="'+i+'">' +
       '<div class="info"><div class="name">'+s.name.replace(/</g,'&lt;')+(s.active?'<span class="badge">activa</span>':'')+'</div>' +
       '<div class="meta">'+s.count+' pasos (I:'+s.L+' / D:'+s.R+') · '+dur+' · '+fmt(s.start)+'</div></div>' +
       '<div class="rowbtns">' +
         '<a href="/figura?s='+enc(s.name)+'" target="_blank">Figura</a>' +
         '<a class="csv" href="/export.csv?sel='+i+'">CSV</a>' +
       '</div></div>';
   }).join('');
 }
 function checked() {
   return [...document.querySelectorAll('.chk')].filter(c=>c.checked).map(c=>c.dataset.i);
 }
 document.getElementById('dlSel').addEventListener('click', () => {
   const sel = checked();
   if (!sel.length) { alert('Marca al menos una grabación.'); return; }
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
  for (const e of state.events) {
    if (e.session !== state.session) continue;
    if (e.leg === 'L') L++; else R++;
  }
  return { L, R, total: L + R };
}

// ---- Pagina HTML -----------------------------------------------------------

function pageHtml() {
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
<title>Contador de pasos</title>
<style>
  :root { --izq:#2563eb; --der:#16a34a; }
  * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
  html, body { margin:0; height:100%; font-family: system-ui, -apple-system, sans-serif; background:#0f172a; color:#e2e8f0; overflow:hidden; }
  .top { display:flex; flex-direction:column; gap:8px; padding:10px 12px; }
  .session { display:flex; gap:8px; align-items:center; }
  .session input { flex:1; min-width:0; padding:10px 12px; font-size:16px; border-radius:10px; border:1px solid #334155; background:#1e293b; color:#e2e8f0; }
  .session button, .bar button { padding:10px 14px; font-size:15px; border-radius:10px; border:none; background:#334155; color:#e2e8f0; font-weight:600; }
  .stats { display:flex; justify-content:space-between; gap:8px; font-size:14px; color:#94a3b8; }
  .stats b { color:#e2e8f0; font-size:20px; }
  .pads { display:flex; flex:1; gap:8px; padding:0 12px 12px; min-height:0; }
  .pad { flex:1; border-radius:18px; border:none; color:#fff; font-size:26px; font-weight:800; letter-spacing:.5px;
         display:flex; flex-direction:column; align-items:center; justify-content:center; gap:10px; user-select:none; touch-action:manipulation; }
  .pad .n { font-size:64px; line-height:1; }
  .pad.izq { background:var(--izq); }
  .pad.der { background:var(--der); }
  .pad:active { filter:brightness(.8); transform:scale(.99); }
  .bar { display:flex; gap:8px; padding:0 12px 12px; }
  .bar button { flex:1; }
  .danger { background:#7f1d1d !important; }
  .ok { background:#166534 !important; }
  .toast { position:fixed; left:50%; bottom:80px; transform:translateX(-50%); background:#000a; padding:8px 14px; border-radius:20px; font-size:14px; opacity:0; transition:opacity .2s; pointer-events:none; }
  .toast.show { opacity:1; }
</style>
</head>
<body>
  <div class="top">
    <div class="session">
      <input id="session" placeholder="Nombre de la sesion" autocomplete="off">
      <button id="newSession" class="ok">Nueva sesion</button>
    </div>
    <div class="stats">
      <span>Izquierda <b id="cL">0</b></span>
      <span>Total <b id="cT">0</b></span>
      <span>Derecha <b id="cR">0</b></span>
    </div>
  </div>

  <div class="pads">
    <button class="pad izq" data-leg="L"><span class="n" id="nL">0</span><span>IZQUIERDA</span></button>
    <button class="pad der" data-leg="R"><span class="n" id="nR">0</span><span>DERECHA</span></button>
  </div>

  <div class="bar">
    <button id="undo">Deshacer</button>
    <button id="save" class="ok">Guardar datos</button>
    <button id="reset" class="danger">Borrar sesion</button>
  </div>
  <div class="bar">
    <button id="grab">Ver grabaciones</button>
    <button id="export" class="ok">Exportar CSV</button>
  </div>

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
    if (document.activeElement !== $('session')) $('session').value = s.session;
  }
  async function api(url, body) {
    const r = await fetch(url, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body||{}) });
    return r.json();
  }
  async function step(leg) {
    if (navigator.vibrate) navigator.vibrate(20);
    render(await api('/step', { leg }));
  }
  document.querySelectorAll('.pad').forEach((p) => {
    p.addEventListener('click', () => step(p.dataset.leg));
  });
  $('newSession').addEventListener('click', async () => {
    const name = ($('session').value.trim()) || 'Sesion ' + new Date().toLocaleString();
    render(await api('/session', { name }));
    $('session').blur(); toast('Nueva sesion: ' + name);
  });
  $('undo').addEventListener('click', async () => { render(await api('/undo')); toast('Deshecho'); });
  $('grab').addEventListener('click', () => { window.location = '/grabaciones'; });
  $('save').addEventListener('click', async () => {
    const w = window.open('/figura', '_blank'); // abrir aqui (gesto del usuario) para evitar bloqueo
    const r = await api('/save');
    if (r.ok) {
      toast('Guardado: ' + r.saved + ' eventos · figura abierta');
      if (!w) window.location = '/figura'; // si el navegador bloqueo la pestana, ir a la figura
    } else {
      toast('ERROR al guardar');
    }
  });
  $('reset').addEventListener('click', async () => {
    if (confirm('Borrar todos los pasos de esta sesion?')) { render(await api('/reset')); toast('Sesion borrada'); }
  });
  $('export').addEventListener('click', () => { window.location = '/export.csv'; });
  // estado inicial
  fetch('/state').then(r => r.json()).then(render);
</script>
</body>
</html>`;
}

// ---- Servidor --------------------------------------------------------------

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://localhost');
  const url = u.pathname;
  const q = u.searchParams;

  if (req.method === 'GET' && url === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(pageHtml());
  }

  if (req.method === 'GET' && url === '/grabaciones') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(pageGrabaciones());
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
    state.events.push({ session: state.session, leg, t: Date.now() }); // hora del ordenador
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
    // releer el archivo para confirmar que de verdad esta en disco
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

  if (req.method === 'GET' && url === '/figura') {
    // sesion indicada en ?s= ; si no, la activa; si esa no tiene pasos, la ultima con eventos
    let sesion = q.get('s') || state.session;
    if (!state.events.some((e) => e.session === sesion)) {
      for (let i = state.events.length - 1; i >= 0; i--) { sesion = state.events[i].session; break; }
    }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(buildFigureHtml(sesion));
  }

  if (req.method === 'GET' && url === '/export.csv') {
    // ?sel=indices (segun /sessions), o ?session=NOMBRE, o nada = todas
    let names = null, suffix = 'todas';
    if (q.get('sel') !== null) {
      const list = sessionList();
      names = q.get('sel').split(',')
        .map((i) => list[parseInt(i, 10)])
        .filter(Boolean)
        .map((x) => x.name);
      suffix = names.length === 1 ? names[0].replace(/[^\w\-]+/g, '_') : 'seleccion';
    } else if (q.get('session')) {
      names = [q.get('session')];
      suffix = names[0].replace(/[^\w\-]+/g, '_');
    }
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    res.writeHead(200, {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="pasos-' + suffix + '-' + stamp + '.csv"',
    });
    return res.end(buildCsv(names));
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('No encontrado');
});

server.listen(PORT, '0.0.0.0', () => {
  const ips = localIPs();
  console.log('\n  Contador de pasos en marcha\n');
  console.log('  En este ordenador:  http://localhost:' + PORT);
  if (ips.length) {
    console.log('  Desde el movil (misma wifi):');
    ips.forEach((ip) => console.log('      http://' + ip + ':' + PORT));
  } else {
    console.log('  (No se detecto IP de red. Conecta el ordenador a la wifi.)');
  }
  console.log('\n  Pulsa Ctrl+C para detener.\n');
});
