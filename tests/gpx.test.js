'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { DOMParser } = require('@xmldom/xmldom');
const Gpx = require('../static/gpx.js');

const parse = (content, name = 'track') => Gpx.parseGpx(content, name, DOMParser);

const SAMPLE = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="test" xmlns="http://www.topografix.com/GPX/1/1">
  <trk><name>Ruta ejemplo</name>
    <trkseg>
      <trkpt lat="40.0" lon="-3.0"><ele>600</ele><time>2026-01-01T10:00:00Z</time></trkpt>
      <trkpt lat="40.001" lon="-3.001"><ele>605</ele><time>2026-01-01T10:01:00Z</time></trkpt>
    </trkseg>
    <trkseg>
      <trkpt lat="40.002" lon="-3.002"><ele>610</ele></trkpt>
    </trkseg>
  </trk>
  <rte><rtept lat="41.0" lon="-4.0"/><rtept lat="41.1" lon="-4.1"/></rte>
</gpx>`;

test('aplana segmentos y lee rutas', () => {
  const tracks = parse(SAMPLE, 'ejemplo.gpx');
  assert.equal(tracks.length, 2);
  assert.equal(tracks[0].name, 'Ruta ejemplo');
  assert.equal(tracks[0].points.length, 3);
  assert.deepEqual(tracks[0].points[0], [40, -3, 600, '2026-01-01T10:00:00Z']);
  assert.equal(tracks[1].name, 'ejemplo (ruta 1)');
  assert.equal(tracks[1].points.length, 2);
});

test('acepta bytes UTF-8 con BOM y Latin-1', () => {
  const bom = new Uint8Array([0xef, 0xbb, 0xbf, ...Buffer.from(SAMPLE, 'utf-8')]);
  assert.equal(parse(bom)[0].name, 'Ruta ejemplo');
  const latin = Buffer.from(SAMPLE.replace('Ruta ejemplo', 'Señal').replace('UTF-8', 'ISO-8859-1'), 'latin1');
  assert.equal(parse(new Uint8Array(latin))[0].name, 'Señal');
});

test('GPX 1.0 sin namespace y sólo waypoints', () => {
  const t = parse('<gpx version="1.0"><wpt lat="1" lon="2"/><wpt lat="3" lon="4"/></gpx>', 'w.gpx');
  assert.equal(t[0].name, 'w (waypoints)');
  assert.deepEqual(t[0].points[1], [3, 4, null, null]);
});

test('rechaza ficheros no válidos', () => {
  assert.throws(() => parse('esto no es xml'), Gpx.GpxError);
  assert.throws(() => parse('<roto'), Gpx.GpxError);
  assert.throws(() => parse('<html></html>'), Gpx.GpxError);
  assert.throws(() => parse('<gpx></gpx>'), Gpx.GpxError);
});

test('exporta en un segmento continuo o uno por trozo', () => {
  const [a, b] = parse(SAMPLE).map((t) => t.points);

  const one = parse(Gpx.buildGpx({ name: 'Unido', pieces: [a, b] }));
  assert.equal(one.length, 1);
  assert.equal(one[0].name, 'Unido');
  assert.equal(one[0].points.length, 5);
  assert.equal(one[0].points[0][3], null);

  const xml = Gpx.buildGpx({ name: 'Unido', pieces: [a, b], keepTime: true, splitSegments: true });
  assert.equal((xml.match(/<trkseg>/g) || []).length, 2);
  const split = parse(xml);
  assert.equal(split[0].points[0][3], '2026-01-01T10:00:00Z');
  assert.equal(split[0].points[0][2], 600);
});

test('escapa el nombre del track', () => {
  const xml = Gpx.buildGpx({ name: 'A & B <x>', pieces: [[[1, 2, null, null]]] });
  assert.equal(parse(xml)[0].name, 'A & B <x>');
});

test('rechaza puntos no válidos o sin trozos', () => {
  assert.throws(() => Gpx.buildGpx({ name: 'x', pieces: [[[100, 0, null, null]]] }), Gpx.GpxError);
  assert.throws(() => Gpx.buildGpx({ name: 'x', pieces: [[['a', 0]]] }), Gpx.GpxError);
  assert.throws(() => Gpx.buildGpx({ name: 'x', pieces: [] }), Gpx.GpxError);
});
