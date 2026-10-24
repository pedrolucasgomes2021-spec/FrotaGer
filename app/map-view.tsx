'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { LatLngBounds, Map as LeafletMap, Marker, Polyline, TileLayer } from 'leaflet';
import type { Location, Route, State, Trip } from './types';
import { clock, occupancy } from './types';
import { pointToPolylineMeters } from './geo';
import './map.css';

type MapViewProps = {
  state: State;
  tripId?: string;
  large?: boolean;
  onSelectTrip?: (id: string) => void;
};

type Leaflet = typeof import('leaflet');
type RouteLayer = { line: Polyline; glow: Polyline; stops: Marker[]; signature: string };
type VehicleLayer = { marker: Marker; contentSignature: string };
type VisibleRoute = { key: string; route: Route };

const escapeHtml = (text: string) => text.replace(/[&<>"']/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[char] ?? char));

const validPoint = (point: { lat: number; lng: number }) => Number.isFinite(point.lat)
  && Number.isFinite(point.lng) && Math.abs(point.lat) <= 90 && Math.abs(point.lng) <= 180;

const tripRoute = (state: State, trip: Trip) => trip.routeSnapshot ?? state.routes.find((route) => route.id === trip.routeId);
const hasGeometry = (route?: Route) => Boolean(route?.geometry && route.geometry.length >= 2 && route.geometry.every(([lat, lng]) => validPoint({ lat, lng })));
const importedRoute = (route: Route) => hasGeometry(route) && route.geometrySource !== 'stops';
const routePoints = (route: Route): [number, number][] => hasGeometry(route) ? route.geometry! : route.stops.filter(validPoint).map((stop) => [stop.lat, stop.lng]);

function gpsAssessment(location: Location, route: Route | undefined, now: number) {
  const sampleTime = Date.parse(location.deviceAt ?? location.at);
  const stale = !Number.isFinite(sampleTime) || now - sampleTime > 120_000 || sampleTime > now + 30_000;
  const poor = !Number.isFinite(location.accuracy) || location.accuracy > 60 || location.quality === 'poor_accuracy';
  const jump = location.quality === 'jump';
  const distance = hasGeometry(route) ? pointToPolylineMeters(location, route!.geometry!) : null;
  const offRoute = !location.simulated && distance !== null && distance > (route?.gpsToleranceMeters ?? 100);
  return { stale, poor, jump, distance, offRoute };
}

const busSvg = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="5" y="3" width="14" height="16" rx="4" stroke="currentColor" stroke-width="1.7"/><path d="M5 11h14M9 19v2m6-2v2M8 7h8" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><circle cx="8.5" cy="15.5" r="1" fill="currentColor"/><circle cx="15.5" cy="15.5" r="1" fill="currentColor"/></svg>';

function MapIcon({ kind }: { kind: 'plus' | 'minus' | 'focus' | 'pin' }) {
  return <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
    {kind === 'plus' && <path d="M12 5v14M5 12h14" />}
    {kind === 'minus' && <path d="M5 12h14" />}
    {kind === 'focus' && <><path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5" /><circle cx="12" cy="12" r="3" /></>}
    {kind === 'pin' && <><path d="M19 10c0 5-7 10-7 10S5 15 5 10a7 7 0 1 1 14 0Z" /><circle cx="12" cy="10" r="2" /></>}
  </svg>;
}

export default function MapView({ state, tripId, large = false, onSelectTrip }: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const leafletRef = useRef<Leaflet | null>(null);
  const tileRef = useRef<TileLayer | null>(null);
  const boundsRef = useRef<LatLngBounds | null>(null);
  const routesRef = useRef(new Map<string, RouteLayer>());
  const vehiclesRef = useRef(new Map<string, VehicleLayer>());
  const fitSignatureRef = useRef('');
  const selectRef = useRef(onSelectTrip);
  const [ready, setReady] = useState(false);
  const [mapError, setMapError] = useState(false);
  const [tileError, setTileError] = useState(false);
  const [tileLoading, setTileLoading] = useState(true);
  const [now, setNow] = useState(Date.now());
  selectRef.current = onSelectTrip;
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 15_000); return () => clearInterval(timer); }, []);

  const latestLocations = useMemo(() => {
    const locations = new Map<string, Location>();
    for (const location of state.locations) {
      if (!validPoint(location)) continue;
      const current = locations.get(location.tripId);
      if (!current || location.at >= current.at) locations.set(location.tripId, location);
    }
    return locations;
  }, [state.locations]);

  const visibleTrips = useMemo(() => state.trips.filter((trip) => tripId
    ? trip.id === tripId
    : trip.status === 'in_progress' || (trip.status === 'scheduled' && latestLocations.has(trip.id))),
  [state.trips, tripId, latestLocations]);

  const visibleRoutes = useMemo<VisibleRoute[]>(() => {
    if (tripId) {
      const selected = state.trips.find((trip) => trip.id === tripId);
      const route = selected ? tripRoute(state, selected) : undefined;
      return route ? [{ key: `trip:${tripId}`, route }] : [];
    }
    const entries: VisibleRoute[] = [];
    const occupied = new Set<string>();
    for (const trip of visibleTrips) {
      const route = tripRoute(state, trip);
      if (!route) continue;
      occupied.add(route.id);
      entries.push({ key: `trip:${trip.id}`, route });
    }
    for (const route of state.routes) if (route.active && !occupied.has(route.id)) entries.push({ key: `route:${route.id}`, route });
    return entries;
  }, [state.routes, state.trips, tripId, visibleTrips]);

  const visiblePositions = visibleTrips.map((trip) => latestLocations.get(trip.id)).filter((location): location is Location => Boolean(location));
  const simulated = visiblePositions.some((position) => position.simulated);
  const mostRecent = visiblePositions.reduce<string>((latest, location) => location.at > latest ? location.at : latest, '');
  const positionStatus = !visiblePositions.length ? 'Aguardando localização'
    : simulated ? 'Posição de demonstração' : `GPS atualizado às ${clock(mostRecent)}`;
  const realPositions = visibleTrips.flatMap((trip) => {
    const location = latestLocations.get(trip.id);
    return location && !location.simulated ? [{ location, assessment: gpsAssessment(location, tripRoute(state, trip), now) }] : [];
  });
  const offRouteCount = realPositions.filter(({ assessment }) => assessment.offRoute).length;
  const staleCount = realPositions.filter(({ assessment }) => assessment.stale).length;
  const poorCount = realPositions.filter(({ assessment }) => assessment.poor || assessment.jump).length;
  const importedCount = visibleRoutes.filter(({ route }) => importedRoute(route)).length;
  const sourceNames = [...new Set(visibleRoutes.filter(({ route }) => importedRoute(route)).map(({ route }) => route.geometrySource?.toUpperCase() ?? 'IMPORTADO'))].join('/');
  const legend = importedCount === visibleRoutes.length && importedCount > 0 ? `Traçado ${sourceNames}`
    : importedCount > 0 ? `Traçado ${sourceNames} + aproximações` : 'Aproximação entre pontos';

  useEffect(() => {
    let cancelled = false;
    let observer: ResizeObserver | null = null;
    let map: LeafletMap | null = null;
    let loadedTiles = 0;
    let failedTiles = 0;

    async function initialize() {
      try {
        const L = await import('leaflet');
        if (cancelled || !containerRef.current) return;
        leafletRef.current = L;
        map = L.map(containerRef.current, {
          zoomControl: false,
          attributionControl: true,
          scrollWheelZoom: false,
          minZoom: 3,
          maxZoom: 19,
        }).setView([-23.558, -46.654], 12);
        mapRef.current = map;
        map.attributionControl.setPrefix(false);
        const tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap contributors</a>',
          updateWhenIdle: true,
          keepBuffer: 0,
          maxZoom: 19,
        });
        tiles.on('loading', () => {
          loadedTiles = 0;
          failedTiles = 0;
          if (!cancelled) setTileLoading(true);
        });
        tiles.on('tileload', () => { loadedTiles += 1; });
        tiles.on('tileerror', () => {
          failedTiles += 1;
          if (!cancelled) setTileError(true);
        });
        tiles.on('load', () => {
          if (cancelled) return;
          setTileLoading(false);
          setTileError(failedTiles > 0 && loadedTiles === 0);
        });
        tiles.addTo(map);
        tileRef.current = tiles;
        if (typeof ResizeObserver !== 'undefined') {
          observer = new ResizeObserver(() => map?.invalidateSize({ pan: false }));
          observer.observe(containerRef.current);
        }
        if (!cancelled) setReady(true);
      } catch {
        if (!cancelled) {
          setMapError(true);
          setTileLoading(false);
        }
      }
    }
    void initialize();

    return () => {
      cancelled = true;
      observer?.disconnect();
      map?.remove();
      mapRef.current = null;
      leafletRef.current = null;
      tileRef.current = null;
      routesRef.current.clear();
      vehiclesRef.current.clear();
      fitSignatureRef.current = '';
    };
  }, []);

  useEffect(() => {
    const L = leafletRef.current;
    const map = mapRef.current;
    if (!ready || !L || !map) return;

    const allPoints: [number, number][] = [];
    const routeIds = new Set(visibleRoutes.map(({ key }) => key));
    for (const [id, layer] of routesRef.current) {
      if (routeIds.has(id)) continue;
      layer.line.remove();
      layer.glow.remove();
      layer.stops.forEach((stop) => stop.remove());
      routesRef.current.delete(id);
    }

    for (const { key, route } of visibleRoutes) {
      const stops = route.stops.filter(validPoint);
      const points = routePoints(route);
      allPoints.push(...points);
      allPoints.push(...stops.map((stop): [number, number] => [stop.lat, stop.lng]));
      const color = /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(route.color) ? route.color : '#35e2ad';
      const signature = JSON.stringify([route.name, route.code, route.color, route.geometrySource, points, stops]);
      const existing = routesRef.current.get(key);
      if (existing?.signature === signature) continue;
      if (existing) {
        existing.line.remove();
        existing.glow.remove();
        existing.stops.forEach((stop) => stop.remove());
      }
      const glow = L.polyline(points, { color, weight: 10, opacity: 0.08, interactive: false }).addTo(map);
      const line = L.polyline(points, { color, weight: 3, opacity: 0.85, dashArray: importedRoute(route) ? undefined : '7 6' }).addTo(map);
      const pathLabel = importedRoute(route) ? `Traçado ${route.geometrySource?.toUpperCase() ?? 'importado'}` : 'Aproximação entre pontos';
      line.bindTooltip(escapeHtml(`${route.code} · ${route.name} · ${pathLabel}`), { className: 'map-tooltip', sticky: true });
      const stopMarkers = stops.map((stop, index) => {
        const isEndpoint = index === 0 || index === stops.length - 1;
        const icon = L.divIcon({
          className: 'map-stop-icon',
          html: `<span class="map-stop-dot${isEndpoint ? ' map-stop-endpoint' : ''}" style="--map-route-color:${color}"></span>`,
          iconSize: [14, 14],
          iconAnchor: [7, 7],
        });
        const marker = L.marker([stop.lat, stop.lng], { icon, title: stop.name, keyboard: true }).addTo(map);
        marker.bindTooltip(escapeHtml(stop.name), { className: 'map-tooltip', direction: 'top', offset: [0, -7] });
        marker.bindPopup(`<div class="map-popup-content"><span class="map-popup-eyebrow">${escapeHtml(route.code)} · PONTO ${index + 1}</span><strong>${escapeHtml(stop.name)}</strong><span>Horário previsto: ${escapeHtml(stop.time)}</span></div>`, { className: 'map-popup', closeButton: true });
        return marker;
      });
      routesRef.current.set(key, { line, glow, stops: stopMarkers, signature });
    }

    const currentVehicleIds = new Set<string>();
    for (const trip of visibleTrips) {
      const location = latestLocations.get(trip.id);
      if (!location) continue;
      currentVehicleIds.add(trip.id);
      allPoints.push([location.lat, location.lng]);
      const route = tripRoute(state, trip);
      const vehicle = trip.vehicleSnapshot ?? state.vehicles.find((item) => item.id === trip.vehicleId);
      const inside = occupancy(state, trip.id);
      const vehicleLabel = vehicle?.plate ?? 'Veículo';
      const routeLabel = route ? `${route.code} · ${route.name}` : 'Viagem';
      const gpsLabel = location.simulated ? 'Posição de demonstração' : `GPS às ${clock(location.at)}`;
      const assessment = gpsAssessment(location, route, now);
      const issues = location.simulated ? [] : [assessment.stale ? 'GPS sem atualização há mais de 2 min' : '', assessment.poor ? 'Baixa precisão GPS' : '', assessment.jump ? 'Possível salto de GPS' : '', assessment.offRoute ? `${Math.round(assessment.distance!)} m do traçado (tolerância ${route?.gpsToleranceMeters ?? 100} m)` : ''].filter(Boolean);
      const accuracyLabel = Number.isFinite(location.accuracy) ? `Precisão ±${Math.round(location.accuracy)} m` : 'Precisão não disponível';
      const warningLabel = issues.join(' · ');
      const popup = `<div class="map-popup-content"><span class="map-popup-eyebrow">${escapeHtml(vehicleLabel)}</span><strong>${escapeHtml(routeLabel)}</strong><span>${inside} a bordo${vehicle ? ` · ${vehicle.capacity} lugares` : ''}</span><span class="map-popup-gps">${escapeHtml(gpsLabel)}<br/>${escapeHtml(accuracyLabel)}<br/>Posição bruta do dispositivo${warningLabel ? `<br/><span class="map-popup-warning">${escapeHtml(warningLabel)}</span>` : ''}</span></div>`;
      const contentSignature = `${popup}|${location.simulated}`;
      const existing = vehiclesRef.current.get(trip.id);
      if (existing) {
        existing.marker.setLatLng([location.lat, location.lng]);
        existing.marker.getElement()?.classList.toggle('map-vehicle-warning', issues.length > 0);
        existing.marker.getElement()?.setAttribute('title', `${vehicleLabel}, ${routeLabel}, ${inside} passageiros a bordo. ${gpsLabel}. ${warningLabel}`);
        existing.marker.getElement()?.setAttribute('aria-label', `${vehicleLabel}, ${routeLabel}, ${inside} passageiros a bordo. ${gpsLabel}. ${warningLabel}`);
        if (existing.contentSignature !== contentSignature) {
          existing.marker.setPopupContent(popup);
          existing.marker.setTooltipContent(escapeHtml(`${vehicleLabel} · ${inside} a bordo`));
          existing.contentSignature = contentSignature;
        }
      } else {
        const icon = L.divIcon({
          className: `map-vehicle-icon${issues.length ? ' map-vehicle-warning' : ''}`,
          html: `<span class="map-vehicle-halo"></span><span class="map-vehicle-core">${busSvg}</span>`,
          iconSize: [48, 48],
          iconAnchor: [24, 24],
          popupAnchor: [0, -22],
          tooltipAnchor: [0, -23],
        });
        const marker = L.marker([location.lat, location.lng], {
          icon,
          zIndexOffset: 1000,
          title: `${vehicleLabel}, ${routeLabel}, ${inside} passageiros a bordo. ${gpsLabel}. ${warningLabel}`,
          keyboard: true,
          riseOnHover: true,
        }).addTo(map);
        marker.bindPopup(popup, { className: 'map-popup', closeButton: true });
        marker.bindTooltip(escapeHtml(`${vehicleLabel} · ${inside} a bordo`), { className: 'map-tooltip', direction: 'top' });
        marker.on('click', () => selectRef.current?.(trip.id));
        vehiclesRef.current.set(trip.id, { marker, contentSignature });
      }
    }
    for (const [id, layer] of vehiclesRef.current) {
      if (currentVehicleIds.has(id)) continue;
      layer.marker.remove();
      vehiclesRef.current.delete(id);
    }

    boundsRef.current = allPoints.length ? L.latLngBounds(allPoints) : null;
    const fitSignature = JSON.stringify([tripId, visibleRoutes.map(({ key, route }) => [key, routePoints(route), route.stops.map((stop) => [stop.lat, stop.lng])]), [...currentVehicleIds]]);
    if (fitSignatureRef.current !== fitSignature) {
      fitSignatureRef.current = fitSignature;
      if (boundsRef.current?.isValid()) {
        map.fitBounds(boundsRef.current, { padding: [42, 60], maxZoom: tripId ? 14 : 12, animate: false });
      }
    }
  }, [state, latestLocations, visibleRoutes, visibleTrips, tripId, ready, now]);

  function recenter() {
    const map = mapRef.current;
    const bounds = boundsRef.current;
    if (map && bounds?.isValid()) map.fitBounds(bounds, { padding: [42, 60], maxZoom: tripId ? 14 : 12 });
    else map?.setView([-23.558, -46.654], 12);
  }

  return <div className={`map-shell${large ? ' map-shell-large' : ''}`}>
    <div className="map-canvas" ref={containerRef} aria-label="Mapa das rotas planejadas, pontos de embarque e posições brutas dos veículos" />

    <div className="map-location-label" aria-hidden="true"><MapIcon kind="pin" /><span>{importedCount ? 'Traçado importado' : 'Mapa da operação'}</span></div>
    <div className={`map-status${!visiblePositions.length ? ' map-status-waiting' : ''}`} role="status">
      <span className="map-status-dot" />{positionStatus}
    </div>
    {(offRouteCount > 0 || staleCount > 0 || poorCount > 0) && <div className="map-gps-warnings" role="status">
      {offRouteCount > 0 && <span>{offRouteCount} {offRouteCount === 1 ? 'posição fora' : 'posições fora'} da tolerância do traçado</span>}
      {staleCount > 0 && <span>{staleCount} GPS sem atualização há mais de 2 min</span>}
      {poorCount > 0 && <span>{poorCount} GPS com precisão baixa ou salto detectado</span>}
      <small>Coordenadas brutas; sem ajuste para a rota.</small>
    </div>}

    {mapError && <div className="map-notice map-notice-centered" role="alert">
      <MapIcon kind="pin" /><strong>Não foi possível abrir o mapa</strong>
      <span>Recarregue a página para tentar novamente.</span>
    </div>}

    {!mapError && tileError && <div className="map-notice map-notice-tiles" role="alert">
      <strong>Base cartográfica indisponível</strong><span>Os pontos e as posições continuam visíveis.</span>
      <button type="button" onClick={() => { setTileError(false); tileRef.current?.redraw(); }}>Tentar novamente</button>
    </div>}

    {!mapError && !tileError && tileLoading && <span className="map-loading" role="status">Carregando mapa…</span>}

    {!mapError && !visiblePositions.length && !tileLoading && <div className="map-gps-empty">
      <span className="map-gps-empty-icon"><MapIcon kind="pin" /></span>
      <span><strong>Sem posição GPS disponível</strong><span>O trajeto planejado está no mapa. A posição aparece quando o motorista iniciar o compartilhamento.</span></span>
    </div>}

    <div className="map-controls" aria-label="Controles do mapa">
      <button type="button" aria-label="Aproximar mapa" title="Aproximar" disabled={!ready || mapError} onClick={() => mapRef.current?.zoomIn()}><MapIcon kind="plus" /></button>
      <button type="button" aria-label="Afastar mapa" title="Afastar" disabled={!ready || mapError} onClick={() => mapRef.current?.zoomOut()}><MapIcon kind="minus" /></button>
      <button type="button" aria-label="Centralizar todas as rotas" title="Centralizar rotas" disabled={!ready || mapError} onClick={recenter}><MapIcon kind="focus" /></button>
    </div>

    <div className="map-legend">
      <span className={`map-legend-route${importedCount ? ' map-legend-imported' : ''}`} /><span>{legend}</span>
      {visiblePositions.length > 0 && <span className="map-legend-count"><span />{visiblePositions.length} {visiblePositions.length === 1 ? 'veículo' : 'veículos'}</span>}
    </div>
  </div>;
}
