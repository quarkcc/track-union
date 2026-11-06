'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Routing = require('../static/routing.js');

const A = [40.4168, -3.7038, 650, null];
const B = [40.42, -3.71, null, null];

const GEOJSON = {
  type: 'FeatureCollection',
  features: [{
    type: 'Feature',
    properties: { 'track-length': '812' },
    geometry: { type: 'LineString', coordinates: [[-3.7038, 40.4168, 650.5], [-3.705, 40.418, 652], [-3.71, 40.42]] },
  }],
};

test('construye la URL de BRouter (lon,lat)', () => {
  const url = Routing.buildUrl('hiking-mountain', A, B);
  assert.match(url, /^https:\/\/brouter\.de\/brouter\?/);
  assert.match(url, /lonlats=-3\.703800,40\.416800\|-3\.710000,40\.420000/);
  assert.match(url, /profile=hiking-mountain/);
  assert.match(url, /format=geojson/);
});

test('convierte la respuesta GeoJSON en puntos [lat, lon, ele, time]', () => {
  const r = Routing.parseResponse(GEOJSON);
  assert.equal(r.dist, 812);
  assert.equal(r.points.length, 3);
  assert.deepEqual(r.points[0], [40.4168, -3.7038, 650.5, null]);
  assert.deepEqual(r.points[2], [40.42, -3.71, null, null]);
  assert.throws(() => Routing.parseResponse({ features: [] }), Routing.RoutingError);
});

test('fetchRoute devuelve la ruta o un error legible', async () => {
  const ok = async () => ({ ok: true, status: 200, text: async () => JSON.stringify(GEOJSON) });
  assert.equal((await Routing.fetchRoute('trekking', A, B, ok)).points.length, 3);

  const bad = async () => ({ ok: false, status: 400, text: async () => 'from-position not mapped in existing datafile\n' });
  await assert.rejects(Routing.fetchRoute('trekking', A, B, bad), /from-position not mapped/);

  const down = async () => { throw new Error('offline'); };
  await assert.rejects(Routing.fetchRoute('trekking', A, B, down), Routing.RoutingError);
});
