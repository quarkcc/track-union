// Track Union - lectura y escritura de GPX en el navegador.
// Punto interno: [lat, lon, ele|null, timeIso|null]
// Funciona en el navegador (window.Gpx) y en Node (module.exports) para los tests.
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Gpx = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  class GpxError extends Error {
    constructor(msg) { super(msg); this.name = 'GpxError'; }
  }

  const round = (x, d) => { const f = 10 ** d; return Math.round(x * f) / f; };

  /** Decodifica bytes como UTF-8 y, si no es válido, como Latin-1/Windows-1252. */
  function decode(buffer) {
    try {
      return new TextDecoder('utf-8', { fatal: true }).decode(buffer);
    } catch {
      return new TextDecoder('windows-1252').decode(buffer);
    }
  }

  const elements = (node) => Array.from(node.childNodes).filter((n) => n.nodeType === 1);
  const childrenNamed = (node, name) => elements(node).filter((n) => n.localName === name);
  function childText(node, name) {
    const c = childrenNamed(node, name)[0];
    const t = c && c.textContent.trim();
    return t || null;
  }

  function toPoint(node) {
    const lat = parseFloat(node.getAttribute('lat'));
    const lon = parseFloat(node.getAttribute('lon'));
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      throw new GpxError(`punto sin lat/lon válidos (${node.getAttribute('lat')}, ${node.getAttribute('lon')})`);
    }
    const eleTxt = childText(node, 'ele');
    const ele = eleTxt === null ? NaN : parseFloat(eleTxt);
    return [round(lat, 7), round(lon, 7), Number.isFinite(ele) ? round(ele, 2) : null, childText(node, 'time')];
  }

  function parseXml(text, DOMParserImpl) {
    // La declaración <?xml encoding=...?> ya no aplica: el texto está decodificado.
    text = text.replace(/^\s*<\?xml[^>]*\?>/, '');
    let doc;
    try {
      doc = new DOMParserImpl().parseFromString(text, 'application/xml');
    } catch (e) {
      throw new GpxError(`GPX no válido: ${e.message}`);
    }
    const root = doc && doc.documentElement;
    if (!root || doc.getElementsByTagName('parsererror').length) throw new GpxError('GPX no válido: XML mal formado');
    if (root.localName !== 'gpx') throw new GpxError(`GPX no válido: el elemento raíz es <${root.localName}>`);
    return root;
  }

  /**
   * Devuelve una lista de tracks {name, points} a partir del contenido de un GPX.
   * Cada <trk> se aplana (todos sus <trkseg> seguidos) y cada <rte> se trata
   * también como un track. Si sólo hay waypoints se devuelven como un track.
   * @param {string|ArrayBuffer|Uint8Array} content
   */
  function parseGpx(content, filename = 'track', DOMParserImpl = globalThis.DOMParser) {
    const text = typeof content === 'string' ? content : decode(content);
    const gpx = parseXml(text, DOMParserImpl);
    const base = filename.replace(/\.[^.]*$/, '');
    const tracks = [];

    const trks = childrenNamed(gpx, 'trk');
    trks.forEach((trk, i) => {
      const pts = childrenNamed(trk, 'trkseg').flatMap((seg) => childrenNamed(seg, 'trkpt').map(toPoint));
      if (pts.length) {
        const name = childText(trk, 'name') || (trks.length === 1 ? base : `${base} #${i + 1}`);
        tracks.push({ name, points: pts });
      }
    });

    childrenNamed(gpx, 'rte').forEach((rte, i) => {
      const pts = childrenNamed(rte, 'rtept').map(toPoint);
      if (pts.length) tracks.push({ name: childText(rte, 'name') || `${base} (ruta ${i + 1})`, points: pts });
    });

    if (!tracks.length) {
      const wpts = childrenNamed(gpx, 'wpt').map(toPoint);
      if (wpts.length) tracks.push({ name: `${base} (waypoints)`, points: wpts });
    }

    if (!tracks.length) throw new GpxError('El fichero no contiene tracks, rutas ni waypoints');
    return tracks;
  }

  const escapeXml = (s) => String(s).replace(/[<>&"']/g, (c) => (
    { '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[c]));

  function normTime(value) {
    if (!value) return null;
    const ms = Date.parse(value);
    return Number.isNaN(ms) ? null : new Date(ms).toISOString().replace('.000Z', 'Z');
  }

  /**
   * Construye un GPX 1.1 con un único <trk> a partir de los trozos.
   * @param {object} opts
   * @param {string} opts.name
   * @param {Array<Array<Array>>} opts.pieces  lista de trozos (listas de puntos)
   * @param {boolean} [opts.keepTime]  conservar los tiempos originales
   * @param {boolean} [opts.splitSegments]  un <trkseg> por trozo (si no, uno continuo)
   */
  function buildGpx({ name, pieces, keepTime = false, splitSegments = false }) {
    if (!pieces || !pieces.some((p) => p && p.length)) throw new GpxError('No hay trozos que exportar');

    const segments = [];
    let seg = null;
    for (const piece of pieces) {
      if (seg === null || splitSegments) { seg = []; segments.push(seg); }
      for (const raw of piece) {
        const lat = Number(raw && raw[0]), lon = Number(raw && raw[1]);
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) throw new GpxError(`Punto no válido: ${JSON.stringify(raw)}`);
        if (lat < -90 || lat > 90 || lon < -180 || lon > 180) throw new GpxError(`Coordenadas fuera de rango: ${lat}, ${lon}`);
        let xml = `<trkpt lat="${lat}" lon="${lon}">`;
        const ele = raw[2];
        if (ele !== null && ele !== undefined && Number.isFinite(Number(ele))) xml += `<ele>${Number(ele)}</ele>`;
        const time = keepTime ? normTime(raw[3]) : null;
        if (time) xml += `<time>${time}</time>`;
        seg.push(`      ${xml}</trkpt>`);
      }
    }

    const body = segments.filter((s) => s.length)
      .map((s) => `    <trkseg>\n${s.join('\n')}\n    </trkseg>`).join('\n');
    return '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<gpx xmlns="http://www.topografix.com/GPX/1/1" version="1.1" creator="Track Union">\n' +
      `  <trk>\n    <name>${escapeXml(name || 'Track unido')}</name>\n${body}\n  </trk>\n</gpx>\n`;
  }

  return { GpxError, parseGpx, buildGpx, decode };
});
