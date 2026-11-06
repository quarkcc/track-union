// Track Union - lógica de la interfaz
// Punto: [lat, lon, ele|null, timeIso|null]
'use strict';

const COLORS = ['#e6194b', '#3cb44b', '#4363d8', '#f58231', '#911eb4',
  '#42d4f4', '#f032e6', '#9a6324', '#469990', '#808000'];
const GAP_WARN_M = 50;

const $ = (id) => document.getElementById(id);
const state = { tracks: [], activeId: null, pieces: [], nextId: 1 };

// ---------- Mapa ----------
const map = L.map('map').setView([40.4, -3.7], 6);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19, attribution: '&copy; OpenStreetMap contributors',
}).addTo(map);

const selLayer = L.polyline([], { color: '#ffd400', weight: 9, opacity: 0.85, interactive: false }).addTo(map);
const resultLayer = L.layerGroup().addTo(map);
const pinIcon = (cls, txt) => L.divIcon({ className: '', html: `<div class="pin ${cls}">${txt}</div>`, iconSize: [22, 22], iconAnchor: [11, 11] });
const markerA = L.marker([0, 0], { icon: pinIcon('a', 'A'), draggable: true, zIndexOffset: 1000 });
const markerB = L.marker([0, 0], { icon: pinIcon('b', 'B'), draggable: true, zIndexOffset: 1000 });

// ---------- Utilidades ----------
function haversine(a, b) {
  const R = 6371008.8, rad = Math.PI / 180;
  const dLat = (b[0] - a[0]) * rad, dLon = (b[1] - a[1]) * rad;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}
function cumulative(points) {
  const cum = [0];
  for (let i = 1; i < points.length; i++) cum.push(cum[i - 1] + haversine(points[i - 1], points[i]));
  return cum;
}
const km = (m) => (m / 1000).toFixed(2) + ' km';
const fmtDist = (m) => (m < 1000 ? Math.round(m) + ' m' : km(m));
const length = (pts) => { let d = 0; for (let i = 1; i < pts.length; i++) d += haversine(pts[i - 1], pts[i]); return d; };
const latlngs = (pts) => pts.map((p) => [p[0], p[1]]);
const activeTrack = () => state.tracks.find((t) => t.id === state.activeId);

function el(tag, props = {}, ...children) {
  const e = document.createElement(tag);
  Object.assign(e, props);
  for (const c of children) e.append(c);
  return e;
}

// ---------- Carga de ficheros ----------
async function uploadFiles(files) {
  files = [...files].filter((f) => /\.gpx$/i.test(f.name));
  if (!files.length) return;
  // Todo se procesa en el navegador: los ficheros no salen del equipo.
  const tracks = [], errors = [];
  for (const f of files) {
    try {
      for (const t of Gpx.parseGpx(await f.arrayBuffer(), f.name)) tracks.push(t);
    } catch (e) {
      errors.push(`${f.name}: ${e.message}`);
    }
  }
  const added = tracks.map(addTrack);
  if (errors.length) alert('Algunos ficheros no se pudieron leer:\n' + errors.join('\n'));
  if (added.length) {
    map.fitBounds(L.featureGroup(added.map((t) => t.layer)).getBounds(), { padding: [30, 30] });
    if (state.activeId === null) activate(added[0].id);
  }
  renderTracks();
}

function addTrack(t) {
  const id = state.nextId++;
  const track = {
    id, name: t.name, points: t.points, cum: cumulative(t.points),
    color: COLORS[(id - 1) % COLORS.length],
  };
  track.layer = L.polyline(latlngs(t.points), { color: track.color, weight: 4, opacity: 0.75 })
    .addTo(map)
    .bindTooltip(t.name, { sticky: true })
    .on('click', (ev) => {
      if (state.activeId !== id) activate(id);
      L.DomEvent.stopPropagation(ev);
    });
  state.tracks.push(track);
  return track;
}

function removeTrack(id) {
  const t = state.tracks.find((x) => x.id === id);
  if (!t) return;
  map.removeLayer(t.layer);
  state.tracks = state.tracks.filter((x) => x.id !== id);
  if (state.activeId === id) activate(state.tracks.length ? state.tracks[0].id : null);
  renderTracks();
}

function renderTracks() {
  const ul = $('tracks');
  ul.replaceChildren();
  for (const t of state.tracks) {
    const del = el('button', { className: 'icon', textContent: '✕', title: 'Quitar track' });
    del.onclick = (e) => { e.stopPropagation(); removeTrack(t.id); };
    const li = el('li', { className: t.id === state.activeId ? 'active' : '' },
      el('span', { className: 'dot', style: `background:${t.color}` }),
      el('span', { className: 'name', textContent: t.name, title: t.name }),
      el('span', { className: 'meta', textContent: km(t.cum.at(-1)) }),
      del);
    li.onclick = () => activate(t.id);
    ul.append(li);
  }
}

// ---------- Selección ----------
function activate(id) {
  state.activeId = id;
  const t = activeTrack();
  $('sel').hidden = !t;
  $('sel-empty').hidden = !!t;
  for (const tr of state.tracks) tr.layer.setStyle({ weight: tr.id === id ? 6 : 4, opacity: tr.id === id ? 0.95 : 0.5 });
  if (!t) {
    selLayer.setLatLngs([]);
    markerA.remove(); markerB.remove();
    renderTracks();
    return;
  }
  t.layer.bringToFront();
  $('sel-name').textContent = t.name;
  $('sel-dot').style.background = t.color;
  const max = t.points.length - 1;
  for (const s of [$('start'), $('end')]) s.max = max;
  $('start').value = 0;
  $('end').value = max;
  markerA.addTo(map); markerB.addTo(map);
  updateSelection();
  renderTracks();
}

function getSel() {
  return { start: +$('start').value, end: +$('end').value };
}

function selectedPoints() {
  const t = activeTrack();
  const { start, end } = getSel();
  const lo = Math.min(start, end), hi = Math.max(start, end);
  const pts = t.points.slice(lo, hi + 1);
  return start <= end ? pts : pts.reverse();
}

function updateSelection() {
  const t = activeTrack();
  if (!t) return;
  const { start, end } = getSel();
  const lo = Math.min(start, end), hi = Math.max(start, end);
  selLayer.setLatLngs(latlngs(t.points.slice(lo, hi + 1)));
  markerA.setLatLng(t.points[start].slice(0, 2));
  markerB.setLatLng(t.points[end].slice(0, 2));
  $('start-lbl').textContent = `km ${(t.cum[start] / 1000).toFixed(2)} · punto ${start}`;
  $('end-lbl').textContent = `km ${(t.cum[end] / 1000).toFixed(2)} · punto ${end}`;
  const len = t.cum[hi] - t.cum[lo];
  $('sel-info').textContent = `Trozo: ${km(len)} · ${hi - lo + 1} puntos` + (start > end ? ' · sentido inverso' : '');
}

function nearestIndex(t, latlng) {
  const p = [latlng.lat, latlng.lng];
  let best = 0, bestD = Infinity;
  t.points.forEach((q, i) => { const d = haversine(p, q); if (d < bestD) { bestD = d; best = i; } });
  return best;
}

function onMarkerDrag(marker, slider) {
  const t = activeTrack();
  if (!t) return;
  slider.value = nearestIndex(t, marker.getLatLng());
  updateSelection();
}
markerA.on('drag', () => onMarkerDrag(markerA, $('start')));
markerB.on('drag', () => onMarkerDrag(markerB, $('end')));
markerA.on('dragend', updateSelection);
markerB.on('dragend', updateSelection);
$('start').oninput = updateSelection;
$('end').oninput = updateSelection;

$('btn-all').onclick = () => { const t = activeTrack(); $('start').value = 0; $('end').value = t.points.length - 1; updateSelection(); };
$('btn-swap').onclick = () => { const s = $('start').value; $('start').value = $('end').value; $('end').value = s; updateSelection(); };

// ---------- Composición ----------
$('btn-add').onclick = () => {
  const t = activeTrack();
  if (!t) return;
  const pts = selectedPoints();
  if (pts.length < 2) { alert('El trozo debe tener al menos 2 puntos.'); return; }
  const { start, end } = getSel();
  state.pieces.push({
    id: state.nextId++, trackName: t.name, color: t.color, points: pts,
    fromKm: t.cum[start] / 1000, toKm: t.cum[end] / 1000,
  });
  renderPieces();
};

function reversePiece(p) {
  p.points = [...p.points].reverse();
  [p.fromKm, p.toKm] = [p.toKm, p.fromKm];
}

function movePiece(i, delta) {
  const j = i + delta;
  if (j < 0 || j >= state.pieces.length) return;
  [state.pieces[i], state.pieces[j]] = [state.pieces[j], state.pieces[i]];
  renderPieces();
}

$('btn-orient').onclick = () => {
  for (let i = 1; i < state.pieces.length; i++) {
    const prevEnd = state.pieces[i - 1].points.at(-1);
    const p = state.pieces[i];
    if (haversine(prevEnd, p.points.at(-1)) < haversine(prevEnd, p.points[0])) reversePiece(p);
  }
  // Primer trozo: orientarlo para que su final quede junto al segundo
  if (state.pieces.length > 1) {
    const [a, b] = state.pieces;
    const dEnd = Math.min(haversine(a.points.at(-1), b.points[0]), haversine(a.points.at(-1), b.points.at(-1)));
    const dStart = Math.min(haversine(a.points[0], b.points[0]), haversine(a.points[0], b.points.at(-1)));
    if (dStart < dEnd) { reversePiece(a); $('btn-orient').onclick(); return; }
  }
  renderPieces();
};
$('btn-clear').onclick = () => { if (!state.pieces.length || confirm('¿Vaciar la composición?')) { state.pieces = []; renderPieces(); } };

function renderPieces() {
  const ol = $('pieces');
  ol.replaceChildren();
  resultLayer.clearLayers();
  let distPieces = 0, distGaps = 0, maxGap = 0;

  state.pieces.forEach((p, i) => {
    if (i > 0) {
      const a = state.pieces[i - 1].points.at(-1), b = p.points[0];
      const g = haversine(a, b);
      distGaps += g; maxGap = Math.max(maxGap, g);
      ol.append(el('div', { className: 'gap' + (g > GAP_WARN_M ? ' warn' : ''), textContent: `↕ salto de ${fmtDist(g)}` }));
      if (g > 1) L.polyline([a.slice(0, 2), b.slice(0, 2)], { color: '#c0392b', weight: 3, dashArray: '4 6', interactive: false }).addTo(resultLayer);
    }
    const len = length(p.points);
    distPieces += len;
    const btn = (txt, title, fn) => { const b = el('button', { className: 'icon', textContent: txt, title }); b.onclick = fn; return b; };
    ol.append(el('li', {},
      el('span', { className: 'num', textContent: i + 1 }),
      el('span', { className: 'dot', style: `background:${p.color}` }),
      el('span', { className: 'name', textContent: p.trackName, title: `${p.trackName}: km ${p.fromKm.toFixed(2)} → ${p.toKm.toFixed(2)}` }),
      el('span', { className: 'meta', textContent: `${p.fromKm.toFixed(1)}→${p.toKm.toFixed(1)} · ${km(len)}` }),
      btn('▲', 'Subir', () => movePiece(i, -1)),
      btn('▼', 'Bajar', () => movePiece(i, 1)),
      btn('⇄', 'Invertir sentido', () => { reversePiece(p); renderPieces(); }),
      btn('✕', 'Quitar', () => { state.pieces.splice(i, 1); renderPieces(); })));

    L.polyline(latlngs(p.points), { color: '#111', weight: 2.5, dashArray: '8 6', interactive: false }).addTo(resultLayer);
    L.marker(p.points[0].slice(0, 2), {
      interactive: false,
      icon: L.divIcon({ className: '', html: `<span class="pnum">${i + 1}</span>`, iconSize: [18, 16], iconAnchor: [9, 8] }),
    }).addTo(resultLayer);
  });

  $('total').textContent = state.pieces.length
    ? `Total: ${km(distPieces + distGaps)} (${state.pieces.length} trozos, saltos ${fmtDist(distGaps)}` +
      (maxGap > GAP_WARN_M ? `, ⚠ salto máx. ${fmtDist(maxGap)})` : ')')
    : 'Añade trozos desde el paso 2.';
}

// ---------- Exportar ----------
$('btn-export').onclick = () => {
  if (!state.pieces.length) { alert('No hay trozos en la composición.'); return; }
  const name = $('out-name').value.trim() || 'Track unido';
  try {
    const xml = Gpx.buildGpx({
      name, keepTime: $('keep-time').checked, splitSegments: $('split-seg').checked,
      pieces: state.pieces.map((p) => p.points),
    });
    const blob = new Blob([xml], { type: 'application/gpx+xml' });
    const a = el('a', { href: URL.createObjectURL(blob), download: name.replace(/[\\/:*?"<>|]+/g, '_') + '.gpx' });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  } catch (e) {
    alert('Error al exportar: ' + e.message);
  }
};

// ---------- Drag & drop ----------
const drop = $('drop');
$('file').onchange = (e) => { uploadFiles(e.target.files); e.target.value = ''; };
['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); }));
['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('over'); }));
drop.addEventListener('drop', (e) => uploadFiles(e.dataTransfer.files));
// Permitir soltar ficheros también sobre el mapa
document.addEventListener('dragover', (e) => e.preventDefault());
document.addEventListener('drop', (e) => { e.preventDefault(); if (e.target !== drop && !drop.contains(e.target)) uploadFiles(e.dataTransfer.files); });

renderPieces();
