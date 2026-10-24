'use client';

import { useEffect, useId, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { Check, FileUp, MapPin, Route as RouteIcon, TriangleAlert, X } from 'lucide-react';
import type { Route } from './types';
import { geometryDistanceKm, parseRouteFile, type RouteFileCandidate, type RouteFileResult, type RouteGeometry } from './geo';
import './route-import.css';

type Props = { route: Partial<Route>; onChange: (patch: Partial<Route>) => void };
const distanceLabel = (km: number) => new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(km);

function GeometryPreview({ geometry }: { geometry: RouteGeometry }) {
  const plot = useMemo(() => {
    if (geometry.length < 2) return null;
    const meanLat = geometry.reduce((sum, point) => sum + point[0], 0) / geometry.length;
    const latitudeScale = Math.max(.01, Math.cos(meanLat * Math.PI / 180));
    const xs = geometry.map(([, lng]) => lng * latitudeScale), ys = geometry.map(([lat]) => -lat);
    const minX = Math.min(...xs), minY = Math.min(...ys), width = Math.max(...xs) - minX, height = Math.max(...ys) - minY;
    const scale = Math.min(300 / Math.max(width, 1e-9), 112 / Math.max(height, 1e-9));
    const offsetX = (332 - width * scale) / 2, offsetY = (144 - height * scale) / 2;
    const points = geometry.map((_, i) => [offsetX + (xs[i] - minX) * scale, offsetY + (ys[i] - minY) * scale]);
    return { path: points.map((point) => point.join(',')).join(' '), start: points[0], end: points[points.length - 1] };
  }, [geometry]);
  if (!plot) return null;
  return <svg className="imp-preview" viewBox="0 0 332 144" role="img" aria-label="Prévia do traçado na ordem original, com início e fim destacados">
    <defs><pattern id="imp-preview-grid" width="20" height="20" patternUnits="userSpaceOnUse"><path d="M20 0H0V20" fill="none" stroke="currentColor" strokeWidth=".5" /></pattern></defs>
    <rect width="332" height="144" fill="url(#imp-preview-grid)" />
    <polyline points={plot.path} fill="none" stroke="#45e3ac" strokeWidth="8" opacity=".08" strokeLinejoin="round" />
    <polyline points={plot.path} fill="none" stroke="#45e3ac" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    <circle cx={plot.start[0]} cy={plot.start[1]} r="4" fill="#102d22" stroke="#8cf4cb" strokeWidth="2" />
    <circle cx={plot.end[0]} cy={plot.end[1]} r="4" fill="#8cf4cb" stroke="#102d22" strokeWidth="2" />
  </svg>;
}

export function RouteImport({ route, onChange }: Props) {
  const inputId = useId();
  const request = useRef(0);
  const [result, setResult] = useState<RouteFileResult | null>(null);
  const [selectedId, setSelectedId] = useState('');
  const [importName, setImportName] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [toleranceDraft, setToleranceDraft] = useState(String(route.gpsToleranceMeters ?? 100));
  useEffect(() => { setToleranceDraft(String(route.gpsToleranceMeters ?? 100)); }, [route.gpsToleranceMeters]);
  const selected = result?.candidates.find((candidate) => candidate.id === selectedId);
  const geometry = selected?.geometry ?? (!result ? route.geometry : undefined);
  const stored = !result && (route.geometry?.length ?? 0) >= 2;
  const distanceKm = selected?.distanceKm ?? (geometry ? geometryDistanceKm(geometry) : null);
  const bounds = selected?.bounds ?? (geometry?.length ? {
    south: Math.min(...geometry.map(([lat]) => lat)), north: Math.max(...geometry.map(([lat]) => lat)),
    west: Math.min(...geometry.map(([, lng]) => lng)), east: Math.max(...geometry.map(([, lng]) => lng)),
  } : null);

  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const generation = ++request.current;
    setLoading(true); setError(''); setMessage(''); setResult(null); setSelectedId('');
    try {
      if (file.size > 2 * 1024 * 1024) throw new Error('O arquivo ultrapassa o limite de 2 MB.');
      const text = await file.text();
      if (generation !== request.current) return;
      const parsed = parseRouteFile(text, file.name);
      setResult(parsed);
      if (parsed.candidates.length === 1) {
        setSelectedId(parsed.candidates[0].id); setImportName(parsed.candidates[0].name);
      } else setImportName('');
    } catch (caught) {
      if (generation === request.current) setError(caught instanceof Error ? caught.message : 'Não foi possível ler o arquivo.');
    } finally { if (generation === request.current) setLoading(false); }
  }

  function choose(candidate: RouteFileCandidate) {
    setSelectedId(candidate.id); setImportName(candidate.name); setMessage('');
  }

  function apply() {
    if (!selected) return;
    onChange({ geometry: selected.geometry.map(([lat, lng]) => [lat, lng]), geometrySource: selected.source,
      geometryName: importName.trim() || selected.name, distance: Number(selected.distanceKm.toFixed(3)), gpsToleranceMeters: route.gpsToleranceMeters ?? 100 });
    setMessage('Traçado aplicado ao formulário. Os pontos de embarque foram preservados. Salve a rota para confirmar.');
  }

  function useEndpoints() {
    if (!geometry || geometry.length < 2) return;
    const start = geometry[0], end = geometry[geometry.length - 1];
    const stops = route.stops ?? [];
    const freshId = (suffix: string) => `stop-${crypto.randomUUID()}-${suffix}`;
    onChange({ stops: [
      { id: stops[0]?.id ?? freshId('start'), name: route.origin || stops[0]?.name || 'Início do traçado', lat: start[0], lng: start[1], time: route.departure ?? stops[0]?.time ?? '07:00' },
      { id: stops.length > 1 ? stops[stops.length - 1].id : freshId('end'), name: route.destination || (stops.length > 1 ? stops[stops.length - 1].name : '') || 'Fim do traçado', lat: end[0], lng: end[1], time: stops.length > 1 ? stops[stops.length - 1].time : route.departure ?? '07:00' },
    ] });
    setMessage('Extremos copiados para os pontos do formulário. Revise nomes, horários e paradas antes de salvar.');
  }

  return <section className="imp-panel" aria-labelledby={`${inputId}-title`}>
    <div className="imp-heading"><span className="imp-heading-icon"><RouteIcon size={17} /></span><div><h3 id={`${inputId}-title`}>Traçado da rota</h3><p>Importe o percurso real e mantenha as paradas sob seu controle.</p></div>{stored && <span className="imp-tag"><Check size={11} />{route.geometrySource?.toUpperCase() ?? 'TRAÇADO'}</span>}</div>
    <label className={`imp-upload${loading ? ' imp-upload-busy' : ''}`} htmlFor={`${inputId}-file`}><FileUp size={22} /><span><strong>{loading ? 'Lendo o percurso…' : 'Escolher arquivo de percurso'}</strong><small>KML, GPX ou GeoJSON · até 2 MB e 5.000 pontos</small></span><input id={`${inputId}-file`} className="imp-file" type="file" accept=".kml,.gpx,.geojson,.json" onChange={upload} disabled={loading} /></label>
    {error && <p className="imp-error" role="alert"><TriangleAlert size={15} />{error}</p>}
    {result && <div className="imp-file-info"><span>{result.fileName}</span><button type="button" aria-label="Descartar arquivo selecionado" onClick={() => { request.current++; setResult(null); setSelectedId(''); setError(''); setMessage(''); }}><X size={14} /></button></div>}
    {result && result.candidates.length > 1 && <fieldset className="imp-candidates"><legend>Escolha um dos {result.candidates.length} traçados independentes</legend><p>Os trechos não serão unidos. Selecione o percurso que pertence a esta rota.</p>{result.candidates.map((candidate) => <label key={candidate.id}><input type="radio" name={`${inputId}-candidate`} checked={selectedId === candidate.id} onChange={() => choose(candidate)} /><span><strong>{candidate.name}</strong><small>{candidate.pointCount.toLocaleString('pt-BR')} pontos · {distanceLabel(candidate.distanceKm)} km</small></span></label>)}</fieldset>}
    {(selected || stored) && geometry && <div className="imp-details"><GeometryPreview geometry={geometry} /><div className="imp-metrics"><div><span>PONTOS</span><strong>{geometry.length.toLocaleString('pt-BR')}</strong></div><div><span>DISTÂNCIA 2D</span><strong>{distanceKm === null ? '—' : distanceLabel(distanceKm)} <small>km</small></strong></div><div><span>ORDEM ORIGINAL</span><strong>Início → fim</strong></div></div><label className="imp-field" htmlFor={`${inputId}-name`}>Nome do traçado<input id={`${inputId}-name`} value={result ? importName : route.geometryName ?? ''} maxLength={140} onChange={(event) => result ? setImportName(event.target.value) : onChange({ geometryName: event.target.value })} placeholder="Nome para identificar o percurso" /></label>{bounds && <p className="imp-bounds"><MapPin size={12} /><span>Limites: {bounds.south.toFixed(5)}, {bounds.west.toFixed(5)} → {bounds.north.toFixed(5)}, {bounds.east.toFixed(5)} <small>(lat, lng)</small></span></p>}{selected && <button type="button" className="imp-apply" onClick={apply}><Check size={15} />Aplicar traçado ao formulário</button>}<button type="button" className="imp-endpoints" onClick={useEndpoints}><MapPin size={14} />Usar extremos como pontos</button><p className="imp-warning">Este botão substitui a lista de paradas por início e fim. Revise os pontos antes de salvar.</p></div>}
    <label className="imp-field imp-tolerance" htmlFor={`${inputId}-tolerance`}><span>Tolerância de desvio GPS <small>em metros</small></span><input id={`${inputId}-tolerance`} type="number" min={10} max={1000} step={1} value={toleranceDraft} onChange={(event) => { setToleranceDraft(event.target.value); const value = Number(event.target.value); if (Number.isFinite(value) && value >= 10 && value <= 1000) onChange({ gpsToleranceMeters: value }); }} onBlur={() => { const value = Number(toleranceDraft); if (!Number.isFinite(value) || value < 10 || value > 1000) { setToleranceDraft(String(route.gpsToleranceMeters ?? 100)); setError('A tolerância GPS deve estar entre 10 e 1.000 metros.'); } }} /><span className="imp-help">A distância é medida até o traçado. A precisão e a idade do GPS são exibidas separadamente.</span></label>
    <div className="imp-notes">{(result?.warnings ?? ['Distância geodésica estimada em 2D; altitude, trânsito e tempos de viagem não são calculados.']).map((warning) => <p key={warning}>{warning}</p>)}</div>
    {message && <p className="imp-message" role="status"><Check size={14} />{message}</p>}
  </section>;
}

export default RouteImport;
