// Track Union - cálculo de tramos de enlace por caminos (BRouter, datos de OpenStreetMap).
// Punto interno: [lat, lon, ele|null, timeIso|null]
// Funciona en el navegador (window.Routing) y en Node (module.exports) para los tests.
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Routing = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const BROUTER_URL = 'https://brouter.de/brouter';

  /** Perfiles estándar del servidor público de BRouter. */
  const PROFILES = [
    { id: 'hiking-mountain', label: 'A pie / senderismo' },
    { id: 'trekking', label: 'Bici (trekking)' },
    { id: 'fastbike', label: 'Bici de carretera' },
    { id: 'car-fast', label: 'Coche' },
    { id: 'shortest', label: 'Más corto (cualquier vía)' },
  ];

  class RoutingError extends Error {
    constructor(msg) { super(msg); this.name = 'RoutingError'; }
  }

  const coord = (p) => `${Number(p[1]).toFixed(6)},${Number(p[0]).toFixed(6)}`;

  function buildUrl(profile, from, to) {
    const q = new URLSearchParams({
      lonlats: `${coord(from)}|${coord(to)}`, profile, alternativeidx: '0', format: 'geojson',
    });
    return `${BROUTER_URL}?${q.toString().replace(/%2C/g, ',').replace(/%7C/g, '|')}`;
  }

  /** Convierte la respuesta GeoJSON de BRouter en {points, dist}. */
  function parseResponse(json) {
    const f = json && json.features && json.features[0];
    const coords = f && f.geometry && f.geometry.coordinates;
    if (!Array.isArray(coords) || coords.length < 2) throw new RoutingError('respuesta sin ruta');
    const points = coords.map((c) => {
      const ele = Number(c[2]);
      return [Number(c[1]), Number(c[0]), c.length > 2 && Number.isFinite(ele) ? ele : null, null];
    });
    const dist = Number(f.properties && f.properties['track-length']);
    return { points, dist: Number.isFinite(dist) ? dist : null };
  }

  /** Pide a BRouter la ruta entre dos puntos. Devuelve {points, dist}. */
  async function fetchRoute(profile, from, to, fetchImpl = globalThis.fetch) {
    let res;
    try {
      res = await fetchImpl(buildUrl(profile, from, to),
        typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? { signal: AbortSignal.timeout(20000) } : {});
    } catch (e) {
      throw new RoutingError(`no se pudo contactar con BRouter (${e.message})`);
    }
    const text = await res.text();
    if (!res.ok) throw new RoutingError(text.trim().split('\n')[0].slice(0, 160) || `error HTTP ${res.status}`);
    let json;
    try { json = JSON.parse(text); } catch { throw new RoutingError('respuesta no válida de BRouter'); }
    return parseResponse(json);
  }

  return { PROFILES, RoutingError, buildUrl, parseResponse, fetchRoute };
});
