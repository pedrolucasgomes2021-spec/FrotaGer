import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const source = await readFile(new URL('../app/geo.ts', import.meta.url), 'utf8');
const javascript = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
const { haversineMeters, geometryDistanceKm, pointToPolylineMeters, assessGpsTrack, parseRouteFile } = await import(`data:text/javascript;base64,${Buffer.from(javascript).toString('base64')}`);
const near = (actual, expected, tolerance) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected} ±${tolerance}`);
const base = Date.parse('2026-10-23T12:00:00.000Z');
const sample = (seconds, lat = 0, lng = 0, patch = {}) => ({ id: `gps-${seconds}`, tripId: 't1', lat, lng, accuracy: 5, speed: null, heading: null, at: new Date(base + seconds * 1000).toISOString(), ...patch });

test('haversine and ordered geometry measure 2D distances, including antimeridian', () => {
  assert.equal(haversineMeters({ lat: 0, lng: 0 }, { lat: 0, lng: 0 }), 0);
  near(haversineMeters({ lat: 0, lng: 0 }, { lat: 0, lng: 1 }), 111195.08, .1);
  near(geometryDistanceKm([[0, 0], [0, 1], [1, 1]]), 222.39016, .001);
  near(haversineMeters({ lat: 0, lng: 179.9 }, { lat: 0, lng: -179.9 }), 22239.016, .1);
  assert.throws(() => geometryDistanceKm([[91, 0], [0, 0]]), /inválida/);
});

test('point projection clamps to segment endpoints and does not snap or mutate raw coordinates', () => {
  const point = { lat: .01, lng: .5 }, copy = { ...point };
  near(pointToPolylineMeters(point, [[0, 0], [0, 1]]), 1111.9508, .1);
  near(pointToPolylineMeters({ lat: 0, lng: 2 }, [[0, 0], [0, 1]]), 111195.08, .1);
  near(pointToPolylineMeters({ lat: 0, lng: 180 }, [[0, 179.9], [0, -179.9]]), 0, .001);
  assert.equal(pointToPolylineMeters(point, []), Infinity);
  assert.deepEqual(point, copy);
});

test('GPS estimate excludes demo, poor accuracy and flagged quality', () => {
  const result = assessGpsTrack([sample(0), sample(10, 0, .001), sample(20, 0, .002, { simulated: true }), sample(30, 0, .002, { accuracy: 61 }), sample(40, 0, .002, { quality: 'poor_accuracy' }), sample(50, 0, .002, { quality: 'jump' })]);
  near(result.distanceKm, .11119508, .00001);
  assert.deepEqual({ ...result, distanceKm: 0 }, { distanceKm: 0, acceptedPoints: 2, rejectedPoints: 4, gaps: 0, segments: 1 });
});

test('GPS gaps over 120 seconds start separate segments and never connect missing intervals', () => {
  const result = assessGpsTrack([sample(0), sample(10, 0, .001), sample(131, 0, 1), sample(141, 0, 1.001)]);
  near(result.distanceKm, .22239016, .00001);
  assert.equal(result.gaps, 1); assert.equal(result.segments, 2); assert.equal(result.acceptedPoints, 4);
  assert.equal(assessGpsTrack([sample(0), sample(121, 0, 1)]).distanceKm, null);
});

test('GPS rejects nonascending/duplicate timestamps and implausible jumps without moving the anchor', () => {
  const values = [sample(0), sample(10, 0, .001), sample(10, 0, .002), sample(5, 0, .003), sample(20, 0, 1), sample(30, 0, .002)];
  const original = structuredClone(values), result = assessGpsTrack(values);
  assert.equal(result.rejectedPoints, 3); assert.equal(result.acceptedPoints, 3);
  near(result.distanceKm, .22239016, .00001); assert.deepEqual(values, original);
});

test('GPS uses device sample time, independently per trip, and distinguishes zero from unavailable', () => {
  const duplicateDevice = [sample(0, 0, 0, { deviceAt: sample(0).at }), sample(10, 0, .001, { deviceAt: sample(0).at })];
  assert.equal(assessGpsTrack(duplicateDevice).rejectedPoints, 1);
  assert.equal(assessGpsTrack([sample(0)]).distanceKm, null);
  assert.equal(assessGpsTrack([sample(0), sample(10)]).distanceKm, 0);
  const differentTrips = assessGpsTrack([sample(0), sample(10, 20, 20, { tripId: 't2' })]);
  assert.equal(differentTrips.distanceKm, null); assert.equal(differentTrips.segments, 2);
});

test('GeoJSON preserves longitude/latitude input order as internal [latitude, longitude] and ignores elevation', () => {
  const parsed = parseRouteFile(JSON.stringify({ type: 'Feature', properties: { name: 'Berrini' }, geometry: { type: 'LineString', coordinates: [[-46.7, -23.6, 700], [-46.69, -23.61, 900]] } }), 'trajeto.geojson');
  assert.equal(parsed.candidates.length, 1); assert.equal(parsed.candidates[0].name, 'Berrini');
  assert.deepEqual(parsed.candidates[0].geometry, [[-23.6, -46.7], [-23.61, -46.69]]);
  assert.equal(parsed.candidates[0].altitudeIgnored, true); assert.match(parsed.warnings.join(' '), /altitude/);
});

test('MultiLineString creates candidates without artificial connectors', () => {
  const parsed = parseRouteFile(JSON.stringify({ type: 'MultiLineString', coordinates: [[[0, 0], [.01, 0]], [[10, 10], [10.01, 10]]] }), 'trechos.geojson');
  assert.equal(parsed.candidates.length, 2);
  assert.equal(parsed.candidates[0].pointCount, 2); assert.equal(parsed.candidates[1].pointCount, 2);
  assert.ok(parsed.candidates.every((candidate) => candidate.distanceKm < 2));
  assert.match(parsed.warnings.join(' '), /não serão conectados/);
});

test('route parser rejects oversized files, excess points, invalid numbers, DTD and unsupported KMZ', () => {
  assert.throws(() => parseRouteFile('x'.repeat(2 * 1024 * 1024 + 1), 'x.kml'), /2 MB/);
  assert.throws(() => parseRouteFile(JSON.stringify({ type: 'LineString', coordinates: Array.from({ length: 5001 }, (_, i) => [i / 10000, 0]) }), 'x.geojson'), /5.000/);
  assert.throws(() => parseRouteFile('{', 'x.geojson'), /malformado/);
  assert.throws(() => parseRouteFile('{"type":"LineString","coordinates":[[181,0],[0,0]]}', 'x.geojson'), /limites/);
  assert.throws(() => parseRouteFile('{"type":"LineString","coordinates":[["0",0],[0,0]]}', 'x.geojson'), /inválidas/);
  assert.throws(() => parseRouteFile('<!DOCTYPE kml [<!ENTITY x SYSTEM "file:///x">]><kml/>', 'x.kml'), /DTD/);
  assert.throws(() => parseRouteFile('PK example', 'x.kmz'), /KMZ/);
});

test('XML parser fixtures (requires browser DOMParser)', { skip: typeof DOMParser === 'undefined' ? 'Node has no DOMParser; fixtures exported below for browser verification.' : false }, () => {
  assert.deepEqual(parseRouteFile(xmlFixtures.kml, 'route.kml').candidates[0].geometry, [[-23.6, -46.7], [-23.61, -46.69]]);
  assert.equal(parseRouteFile(xmlFixtures.gpx, 'route.gpx').candidates.length, 2);
  assert.equal(parseRouteFile(xmlFixtures.gxTrack, 'track.kml').candidates[0].geometry.length, 2);
  assert.throws(() => parseRouteFile('<kml><LineString></kml>', 'broken.kml'), /malformado/);
});

export const xmlFixtures = {
  kml: '<kml xmlns="http://www.opengis.net/kml/2.2"><Placemark><name>Berrini</name><LineString><coordinates>-46.7,-23.6,700 -46.69,-23.61,900</coordinates></LineString></Placemark></kml>',
  gpx: '<gpx xmlns="http://www.topografix.com/GPX/1/1" version="1.1" creator="Vértice"><trk><name>Dois trechos</name><trkseg><trkpt lat="-23.6" lon="-46.7"/><trkpt lat="-23.61" lon="-46.69"/></trkseg><trkseg><trkpt lat="-23.7" lon="-46.8"/><trkpt lat="-23.71" lon="-46.79"/></trkseg></trk></gpx>',
  gxTrack: '<kml xmlns="http://www.opengis.net/kml/2.2" xmlns:gx="http://www.google.com/kml/ext/2.2"><Placemark><gx:Track><when>2026-10-23T10:00:00Z</when><when>2026-10-23T10:01:00Z</when><gx:coord>-46.7 -23.6 700</gx:coord><gx:coord>-46.69 -23.61 710</gx:coord></gx:Track></Placemark></kml>',
};
