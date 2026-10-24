import type { Location } from './types';

export type GeoPoint = { lat: number; lng: number };
export type RouteGeometry = [number, number][];
export type GpsTrackAssessment = { distanceKm: number | null; acceptedPoints: number; rejectedPoints: number; gaps: number; segments: number };
export type RouteFileSource = 'kml' | 'gpx' | 'geojson';
export type RouteFileCandidate = {
  id: string; name: string; geometry: RouteGeometry; source: RouteFileSource;
  pointCount: number; distanceKm: number; altitudeIgnored: boolean;
  bounds: { south: number; west: number; north: number; east: number };
};
export type RouteFileResult = { candidates: RouteFileCandidate[]; source: RouteFileSource; fileName: string; warnings: string[] };

const EARTH_METERS = 6_371_008.8;
const radians = (degrees: number) => degrees * Math.PI / 180;
const validPoint = (p: GeoPoint) => Number.isFinite(p.lat) && Number.isFinite(p.lng) && Math.abs(p.lat) <= 90 && Math.abs(p.lng) <= 180;

/** Surface distance on a WGS84 mean-radius sphere. Elevation is never included. */
export function haversineMeters(a: GeoPoint, b: GeoPoint): number {
  if (!validPoint(a) || !validPoint(b)) throw new RangeError('Coordenada fora dos limites de latitude/longitude.');
  const dLat = radians(b.lat - a.lat), dLng = radians(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(radians(a.lat)) * Math.cos(radians(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_METERS * Math.asin(Math.sqrt(Math.max(0, Math.min(1, h))));
}

export function geometryDistanceKm(points: RouteGeometry): number {
  let meters = 0;
  for (const point of points) if (!validPoint({ lat: point[0], lng: point[1] })) throw new RangeError('Coordenada inválida no traçado.');
  for (let i = 1; i < points.length; i++) meters += haversineMeters({ lat: points[i - 1][0], lng: points[i - 1][1] }, { lat: points[i][0], lng: points[i][1] });
  return meters / 1000;
}

function bearing(a: GeoPoint, b: GeoPoint) {
  const aLat = radians(a.lat), bLat = radians(b.lat), dLng = radians(b.lng - a.lng);
  return Math.atan2(Math.sin(dLng) * Math.cos(bLat), Math.cos(aLat) * Math.sin(bLat) - Math.sin(aLat) * Math.cos(bLat) * Math.cos(dLng));
}

/** Minimum distance to a bounded great-circle segment, with endpoint clamping. No coordinate snapping. */
export function pointToPolylineMeters(point: GeoPoint, geometry: RouteGeometry): number {
  if (!validPoint(point) || !geometry.length) return Infinity;
  let minimum = Infinity;
  for (let i = 0; i < geometry.length; i++) {
    const a = { lat: geometry[i][0], lng: geometry[i][1] };
    if (!validPoint(a)) continue;
    minimum = Math.min(minimum, haversineMeters(point, a));
    if (i === geometry.length - 1) continue;
    const b = { lat: geometry[i + 1][0], lng: geometry[i + 1][1] };
    if (!validPoint(b)) continue;
    const segment = haversineMeters(a, b) / EARTH_METERS;
    if (segment < 1e-12 || Math.abs(segment - Math.PI) < 1e-9) continue;
    const toPoint = haversineMeters(a, point) / EARTH_METERS;
    const angle = bearing(a, point) - bearing(a, b);
    const along = Math.atan2(Math.sin(toPoint) * Math.cos(angle), Math.cos(toPoint));
    if (along >= 0 && along <= segment) {
      const cross = Math.asin(Math.max(-1, Math.min(1, Math.sin(toPoint) * Math.sin(angle))));
      minimum = Math.min(minimum, Math.abs(cross) * EARTH_METERS);
    }
  }
  return minimum;
}

/**
 * Estimates distance from raw samples in received order, independently per trip.
 * Uses deviceAt when present, otherwise server at. Never sorts, interpolates or snaps.
 * A gap >120s starts a new segment. A jump exceeds 130km/h after subtracting both accuracy radii.
 */
export function assessGpsTrack(locations: Location[]): GpsTrackAssessment {
  const result: GpsTrackAssessment = { distanceKm: null, acceptedPoints: 0, rejectedPoints: 0, gaps: 0, segments: 0 };
  const tracks = new Map<string, { lastSeen: number; anchor?: { location: Location; time: number } }>();
  let distanceMeters = 0, pairs = 0;
  for (const location of locations) {
    if (location.simulated || !validPoint(location) || !Number.isFinite(location.accuracy) || location.accuracy < 0 || location.accuracy > 60 || location.quality === 'poor_accuracy' || location.quality === 'jump') {
      result.rejectedPoints++; continue;
    }
    const time = Date.parse(location.deviceAt ?? location.at);
    const track = tracks.get(location.tripId) ?? { lastSeen: -Infinity };
    if (!Number.isFinite(time) || time <= track.lastSeen) { result.rejectedPoints++; continue; }
    track.lastSeen = time;
    tracks.set(location.tripId, track);
    if (!track.anchor) {
      result.acceptedPoints++; result.segments++;
      track.anchor = { location, time }; continue;
    }
    const elapsed = (time - track.anchor.time) / 1000;
    if (elapsed > 120) {
      result.gaps++; result.segments++; result.acceptedPoints++;
      track.anchor = { location, time }; continue;
    }
    const distance = haversineMeters(track.anchor.location, location);
    const minimumMovement = Math.max(0, distance - track.anchor.location.accuracy - location.accuracy);
    if (minimumMovement / elapsed > 130 / 3.6) { result.rejectedPoints++; continue; }
    result.acceptedPoints++; pairs++; distanceMeters += distance;
    track.anchor = { location, time };
  }
  if (pairs) result.distanceKm = distanceMeters / 1000;
  return result;
}

const MAX_FILE_BYTES = 2 * 1024 * 1024;
const MAX_POINTS = 5000;
const numericText = (value: string | null) => {
  if (value === null || !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(value.trim())) throw new Error('O arquivo contém uma coordenada numérica inválida.');
  const n = Number(value);
  if (!Number.isFinite(n)) throw new Error('O arquivo contém uma coordenada não finita.');
  return n;
};
// Avoid the Cloudflare HTMLRewriter global Element type in this shared browser/server module.
type XmlElement = ReturnType<Document['createElementNS']>;
const children = (element: XmlElement, localName: string) => Array.from(element.childNodes)
  .filter((node) => node.nodeType === 1 && (node as XmlElement).localName === localName)
  .map((node) => node as XmlElement);
const elements = (element: Document | XmlElement, localName: string) => Array.from(element.getElementsByTagNameNS('*', localName));
const elementName = (element: XmlElement) => children(element, 'name')[0]?.textContent?.trim().slice(0, 140);

/** Parses only data; XML nodes/HTML/links are never inserted into the document. Multiple paths remain separate candidates. */
export function parseRouteFile(text: string, filename: string): RouteFileResult {
  if (typeof text !== 'string' || !text.trim()) throw new Error('O arquivo está vazio.');
  if (new TextEncoder().encode(text).byteLength > MAX_FILE_BYTES) throw new Error('O arquivo ultrapassa o limite de 2 MB.');
  const extension = filename.split('.').pop()?.toLowerCase();
  if (extension === 'kmz') throw new Error('KMZ não é suportado. Exporte o percurso como KML, GPX ou GeoJSON.');
  if (!['kml', 'gpx', 'geojson', 'json'].includes(extension ?? '')) throw new Error('Escolha um arquivo .kml, .gpx ou .geojson.');
  const source: RouteFileSource = extension === 'kml' ? 'kml' : extension === 'gpx' ? 'gpx' : 'geojson';
  const candidates: RouteFileCandidate[] = [];
  const warnings = ['Distância geodésica estimada em 2D; altitude, trânsito e tempos de viagem não são calculados.'];
  let totalPoints = 0;
  function add(name: string, positions: unknown[], altitude = false) {
    if (positions.length < 2) throw new Error('Cada traçado precisa ter pelo menos duas coordenadas.');
    totalPoints += positions.length;
    if (totalPoints > MAX_POINTS) throw new Error('O arquivo ultrapassa o limite de 5.000 pontos. Divida o percurso em arquivos menores.');
    const geometry: RouteGeometry = positions.map((position) => {
      if (!Array.isArray(position) || position.length < 2 || position.some((value) => typeof value !== 'number' || !Number.isFinite(value))) throw new Error('Coordenadas inválidas: use números no formato longitude, latitude.');
      const [lng, lat] = position as number[];
      if (!validPoint({ lat, lng })) throw new Error('Latitude ou longitude fora dos limites WGS84.');
      if (position.length > 2) altitude = true;
      return [lat, lng];
    });
    const latitudes = geometry.map(([lat]) => lat), longitudes = geometry.map(([, lng]) => lng);
    candidates.push({ id: `path-${candidates.length + 1}`, name: (name || `Traçado ${candidates.length + 1}`).slice(0, 140), source, geometry, pointCount: geometry.length, distanceKm: geometryDistanceKm(geometry), altitudeIgnored: altitude, bounds: { south: Math.min(...latitudes), north: Math.max(...latitudes), west: Math.min(...longitudes), east: Math.max(...longitudes) } });
  }

  if (source === 'geojson') {
    let data: unknown;
    try { data = JSON.parse(text); } catch { throw new Error('O GeoJSON contém JSON malformado.'); }
    function visit(value: unknown, fallbackName: string, depth = 0) {
      if (depth > 12 || !value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Estrutura GeoJSON inválida.');
      const object = value as Record<string, unknown>;
      if (object.crs) throw new Error('Use GeoJSON WGS84 (longitude/latitude), sem um sistema de coordenadas alternativo.');
      if (object.type === 'FeatureCollection') {
        if (!Array.isArray(object.features)) throw new Error('FeatureCollection sem lista de feições.');
        object.features.forEach((feature, i) => visit(feature, `Traçado ${i + 1}`, depth + 1));
      } else if (object.type === 'Feature') {
        const properties = object.properties as Record<string, unknown> | null;
        const name = typeof properties?.name === 'string' ? properties.name : fallbackName;
        if (object.geometry) visit(object.geometry, name, depth + 1);
      } else if (object.type === 'LineString') {
        if (!Array.isArray(object.coordinates)) throw new Error('LineString sem coordenadas.');
        add(fallbackName, object.coordinates);
      } else if (object.type === 'MultiLineString') {
        if (!Array.isArray(object.coordinates)) throw new Error('MultiLineString sem coordenadas.');
        object.coordinates.forEach((line, i) => {
          if (!Array.isArray(line)) throw new Error('Trecho inválido em MultiLineString.');
          add(`${fallbackName} · trecho ${i + 1}`, line);
        });
      } else if (object.type === 'GeometryCollection') {
        if (!Array.isArray(object.geometries)) throw new Error('GeometryCollection inválida.');
        object.geometries.forEach((geometry, i) => visit(geometry, `${fallbackName} · ${i + 1}`, depth + 1));
      } else if (!['Point', 'MultiPoint', 'Polygon', 'MultiPolygon'].includes(String(object.type))) throw new Error('Tipo GeoJSON não reconhecido.');
    }
    visit(data, filename.replace(/\.[^.]+$/, ''));
  } else {
    if (/<!\s*(?:DOCTYPE|ENTITY)\b/i.test(text)) throw new Error('Declarações DTD e entidades XML não são permitidas.');
    if (typeof DOMParser === 'undefined') throw new Error('A importação XML precisa de um navegador com DOMParser.');
    const document = new DOMParser().parseFromString(text, 'application/xml');
    if (elements(document, 'parsererror').length || !document.documentElement) throw new Error('O XML está malformado. Corrija o arquivo e tente novamente.');
    const expectedRoot = source === 'kml' ? 'kml' : 'gpx';
    if (document.documentElement.localName !== expectedRoot) throw new Error(`O arquivo não possui uma raiz ${expectedRoot.toUpperCase()} válida.`);
    if (source === 'kml') {
      const lines = Array.from(document.getElementsByTagName('*')).filter((element) => element.localName === 'LineString' || element.localName === 'Track');
      lines.forEach((line, index) => {
        let owner = line as XmlElement | null;
        while (owner && owner.localName !== 'Placemark') owner = owner.parentElement;
        const name = (owner && elementName(owner)) || `Traçado ${index + 1}`;
        const raw = line.localName === 'Track'
          ? children(line, 'coord').map((element) => (element.textContent ?? '').trim().split(/\s+/).map(numericText))
          : (children(line, 'coordinates')[0]?.textContent ?? '').trim().split(/\s+/).filter(Boolean).map((tuple) => tuple.split(',').map(numericText));
        if (raw.some((position) => position.length < 2 || position.length > 3)) throw new Error('Uma coordenada KML precisa de longitude, latitude e altitude opcional. Valores ausentes não são interpolados.');
        add(name, raw);
      });
    } else {
      const paths = Array.from(document.getElementsByTagName('*')).filter((element) => element.localName === 'trkseg' || element.localName === 'rte');
      paths.forEach((path, index) => {
        const owner = path.localName === 'trkseg' ? path.parentElement : path;
        const name = (owner && elementName(owner)) || `Traçado ${index + 1}`;
        const points = children(path, path.localName === 'rte' ? 'rtept' : 'trkpt');
        const positions = points.map((point) => {
          const position = [numericText(point.getAttribute('lon')), numericText(point.getAttribute('lat'))];
          const altitude = children(point, 'ele')[0];
          if (altitude) position.push(numericText(altitude.textContent));
          return position;
        });
        add(`${name}${path.localName === 'trkseg' ? ` · segmento ${index + 1}` : ''}`, positions);
      });
    }
  }
  if (!candidates.length) throw new Error('Nenhum traçado linear encontrado. Inclua LineString/gx:Track no KML, trkseg/rte no GPX ou LineString no GeoJSON.');
  if (candidates.length > 1) warnings.push('Há vários traçados independentes. Selecione apenas um; os segmentos não serão conectados automaticamente.');
  if (candidates.some((candidate) => candidate.altitudeIgnored)) warnings.push('O arquivo contém altitude. Ela foi ignorada no mapa e na distância 2D.');
  return { candidates, source, fileName: filename, warnings };
}
