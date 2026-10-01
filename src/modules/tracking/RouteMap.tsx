import { useEffect, useMemo, useRef, useState } from 'react';
import type { Coordinate, RouteEvent, SiteReference } from './types';

const WIDTH = 900;
const HEIGHT = 500;
export function project(coordinate: Coordinate): { x: number; y: number } {
  const latitude = Math.max(-85.05112878, Math.min(85.05112878, coordinate.latitude)) * Math.PI / 180;
  return { x: (coordinate.longitude + 180) / 360, y: (1 - Math.log(Math.tan(latitude) + 1 / Math.cos(latitude)) / Math.PI) / 2 };
}
export function unproject(x: number, y: number): Coordinate {
  return { longitude: ((x * 360) % 360 + 360) % 360 - 180, latitude: Math.atan(Math.sinh(Math.PI * (1 - 2 * Math.max(0, Math.min(1, y))))) * 180 / Math.PI };
}

export default function RouteMap({ events, sites, selectedVisit, candidate, editing, onPick, onSelect }: {
  events: RouteEvent[]; sites: SiteReference[]; selectedVisit: string | null;
  candidate: Coordinate | null; editing: boolean; onPick: (point: Coordinate) => void; onSelect: (key: string) => void;
}) {
  const [center, setCenter] = useState(() => project({ latitude: -25.3, longitude: -57.6 }));
  const [zoom, setZoom] = useState(12);
  const [tilesFailed, setTilesFailed] = useState(false);
  const drag = useRef<{ x: number; y: number; center: { x: number; y: number }; moved: boolean } | null>(null);
  const points = useMemo(() => events.filter(event => event.coordinate).map(event => project(event.coordinate!)), [events]);
  function fit() {
    const all = [...points, ...sites.map(project)];
    if (!all.length) return;
    const xs = all.map(p => p.x); const ys = all.map(p => p.y);
    const minX = Math.min(...xs); const maxX = Math.max(...xs); const minY = Math.min(...ys); const maxY = Math.max(...ys);
    setCenter({ x: (minX + maxX) / 2, y: (minY + maxY) / 2 });
    const scale = Math.min((WIDTH - 100) / Math.max(maxX - minX, 0.00001), (HEIGHT - 100) / Math.max(maxY - minY, 0.00001));
    setZoom(Math.max(2, Math.min(18, Math.floor(Math.log2(scale / 256)))));
  }
  useEffect(() => { fit(); }, [points]);
  useEffect(() => {
    if (candidate && !editing) setCenter(project(candidate));
  }, [candidate?.latitude, candidate?.longitude, editing]);
  const world = 256 * 2 ** zoom;
  const left = center.x * world - WIDTH / 2;
  const top = center.y * world - HEIGHT / 2;
  const tiles: { x: number; y: number; url: string }[] = [];
  for (let x = Math.floor(left / 256); x <= Math.floor((left + WIDTH) / 256); x += 1) {
    for (let y = Math.floor(top / 256); y <= Math.floor((top + HEIGHT) / 256); y += 1) {
      if (y < 0 || y >= 2 ** zoom) continue;
      const tileX = ((x % 2 ** zoom) + 2 ** zoom) % 2 ** zoom;
      tiles.push({ x: x * 256 - left, y: y * 256 - top, url: `https://tile.openstreetmap.org/${zoom}/${tileX}/${y}.png` });
    }
  }
  const paths: string[] = [];
  let segment: string[] = [];
  for (const event of events) {
    if (!event.coordinate) { if (segment.length > 1) paths.push(segment.join(' ')); segment = []; continue; }
    const p = project(event.coordinate); segment.push(`${p.x * world - left},${p.y * world - top}`);
  }
  if (segment.length > 1) paths.push(segment.join(' '));
  const mapCenter = unproject(center.x, center.y);
  return <section className="tracking-map-panel" aria-label="Mapa de recorrido diario">
    <div className="tracking-map-toolbar">
      <strong>Secuencia de marcaciones</strong>
      <div className="tracking-button-row">
        <button type="button" className="secondary-button" aria-label="Alejar mapa" onClick={() => setZoom(z => Math.max(2, z - 1))}>−</button>
        <button type="button" className="secondary-button" aria-label="Acercar mapa" onClick={() => setZoom(z => Math.min(18, z + 1))}>+</button>
        <button type="button" className="secondary-button" onClick={fit}>Ajustar recorrido</button>
      </div>
    </div>
    <svg className={`tracking-map ${editing ? 'is-editing' : ''}`} viewBox={`0 0 ${WIDTH} ${HEIGHT}`} preserveAspectRatio="none" role="application" aria-label="Mapa geográfico. Flechas para desplazar, más o menos para zoom. Selecciona una sede con clic en modo edición o usa el centro del mapa." tabIndex={0}
      onKeyDown={event => {
        const steps: Record<string, [number, number]> = { ArrowLeft: [-100, 0], ArrowRight: [100, 0], ArrowUp: [0, -100], ArrowDown: [0, 100] };
        const step = steps[event.key];
        if (step) { event.preventDefault(); setCenter(c => ({ x: c.x + step[0] / world, y: Math.max(0, Math.min(1, c.y + step[1] / world)) })); }
        if (event.key === '+' || event.key === '-') { event.preventDefault(); setZoom(z => Math.max(2, Math.min(18, z + (event.key === '+' ? 1 : -1)))); }
      }}
      onPointerDown={event => {
        if (event.button !== 0) return;
        drag.current = { x: event.clientX, y: event.clientY, center, moved: false };
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={event => {
        const start = drag.current; if (!start) return;
        const rect = event.currentTarget.getBoundingClientRect();
        const dx = (event.clientX - start.x) * WIDTH / rect.width;
        const dy = (event.clientY - start.y) * HEIGHT / rect.height;
        if (Math.abs(dx) + Math.abs(dy) > 5) start.moved = true;
        if (start.moved) setCenter({ x: start.center.x - dx / world, y: Math.max(0, Math.min(1, start.center.y - dy / world)) });
      }}
      onPointerUp={event => {
        const start = drag.current; drag.current = null;
        if (!start || start.moved || !editing) return;
        const rect = event.currentTarget.getBoundingClientRect();
        onPick(unproject((left + (event.clientX - rect.left) * WIDTH / rect.width) / world, (top + (event.clientY - rect.top) * HEIGHT / rect.height) / world));
      }} onPointerCancel={() => { drag.current = null; }}>
      <rect width={WIDTH} height={HEIGHT} className="tracking-map-background" />
      {tiles.map(tile => <image key={tile.url + tile.x} href={tile.url} x={tile.x} y={tile.y} width="256" height="256" onError={() => setTilesFailed(true)} />)}
      {tilesFailed && Array.from({ length: 7 }, (_, index) => {
        const x = index * WIDTH / 6; const y = index * HEIGHT / 6;
        const longitude = unproject((left + x) / world, center.y).longitude;
        const latitude = unproject(center.x, (top + y) / world).latitude;
        return <g key={index} className="tracking-map-grid"><path d={`M${x} 0 V${HEIGHT} M0 ${y} H${WIDTH}`} /><text x={x + 4} y={18}>{longitude.toFixed(4)}°</text><text x="4" y={y + 18}>{latitude.toFixed(4)}°</text></g>;
      })}
      {paths.map((path, index) => <polyline key={index} points={path} className="tracking-route-line" />)}
      {sites.map(site => {
        const p = project(site); const radius = 100 / (40_075_017 * Math.cos(site.latitude * Math.PI / 180)) * world;
        return <g key={site.key}><circle cx={p.x * world - left} cy={p.y * world - top} r={radius} className="tracking-site-radius" /><path transform={`translate(${p.x * world - left} ${p.y * world - top})`} d="M0 -10 L10 0 L0 10 L-10 0 Z" className="tracking-site-pin"><title>{`Sede confirmada: ${site.customer} ${site.branch}`}</title></path></g>;
      })}
      {events.filter(event => event.coordinate).map((event, index) => {
        const p = project(event.coordinate!);
        return <g key={event.key} transform={`translate(${p.x * world - left} ${p.y * world - top})`} className={`tracking-event-pin ${event.kind} ${selectedVisit === event.visitKey ? 'selected' : ''}`} role="button" tabIndex={0} aria-label={`${index + 1}. ${event.kind === 'in' ? 'Entrada' : 'Salida'} I.S. ${event.reportId}, ${event.timestamp.slice(11, 16)}`}
          onPointerDown={e => { if (!editing) e.stopPropagation(); }} onClick={e => { if (!editing) { e.stopPropagation(); onSelect(event.visitKey); } }} onKeyDown={e => { if ((e.key === 'Enter' || e.key === ' ') && !editing) { e.preventDefault(); onSelect(event.visitKey); } }}>
          <circle r="13" /><text textAnchor="middle" dominantBaseline="central">{index + 1}</text><title>{`${event.customer} · I.S. ${event.reportId} · ${event.timestamp.replace('T', ' ')}`}</title>
        </g>;
      })}
      {candidate && (() => { const p = project(candidate); return <g transform={`translate(${p.x * world - left} ${p.y * world - top})`} className="tracking-candidate-pin"><circle r="12" /><path d="M-18 0 H18 M0 -18 V18" /><title>Ubicación propuesta, todavía no confirmada</title></g>; })()}
    </svg>
    <div className="tracking-map-footer"><span>Azul: entrada · Naranja: salida · Rombo: sede confirmada (100 m). Líneas directas, no calles recorridas.</span><span>Centro: {mapCenter.latitude.toFixed(6)}, {mapCenter.longitude.toFixed(6)}</span></div>
    {editing && <button type="button" className="secondary-button" onClick={() => onPick(mapCenter)}>Usar centro del mapa como sede propuesta</button>}
    <small>Fondo de calles activo automáticamente · requiere internet; envía la zona visible, no los archivos, nombres ni direcciones. © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap contributors</a></small>
    {tilesFailed && <p role="status">No se pudo cargar parte del mapa base. Los puntos y cálculos locales siguen disponibles.</p>}
    {!points.length && <p role="status">No hay coordenadas de marcaciones en este día. Puedes ubicar la sede con el mapa o introducir sus coordenadas verificadas.</p>}
  </section>;
}
