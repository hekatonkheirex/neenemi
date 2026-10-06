import { useEffect, useMemo, useRef, useState } from 'react';
import { analyzeDay, applyRoads, idleByDay, needsRoad, routePairs, siteKey } from './analysis';
import { normalizeIdentity, normalizeTrackingSerial } from './parser';
import RouteMap from './RouteMap';
import TrackingTables from './TrackingTables';
import type { Coordinate, DayAnalysis, GeocodingCandidate, RoadRoute, TrackingState, TrackingVisit } from './types';
import './tracking.css';

async function fetchState(path: string, method = 'GET', body?: unknown): Promise<TrackingState> {
  const response = await fetch(path, { method, headers: body === undefined ? undefined : { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const result = await response.json() as TrackingState & { error?: string };
  if (!response.ok) throw new Error(result.error ?? `No se pudo completar la operación (HTTP ${response.status}).`);
  return result;
}
async function uploadSource(file: File) {
  if (file.size > 18 * 1024 * 1024) throw new Error(`${file.name}: máximo 18 MB por archivo.`);
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = '';
  for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  return { fileName: file.name, contentBase64: btoa(binary) };
}

export default function TrackingModule() {
  const [state, setState] = useState<TrackingState>({ snapshot: null, sites: [] });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [reportsFile, setReportsFile] = useState<File | null>(null);
  const [gpsFile, setGpsFile] = useState<File | null>(null);
  const [technician, setTechnician] = useState('');
  const [day, setDay] = useState('');
  const [onsiteOnly, setOnsiteOnly] = useState(true);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const [address, setAddress] = useState('');
  const [serialNumber, setSerialNumber] = useState('');
  const [geocodingResults, setGeocodingResults] = useState<GeocodingCandidate[]>([]);
  const geocodingRequest = useRef<AbortController | null>(null);
  const snapshot = state.snapshot;
  const visits = snapshot?.visits;
  const technicians = useMemo(() => [...new Set((visits ?? []).map(v => v.technician).filter(Boolean))].sort((a, b) => a.localeCompare(b)), [visits]);
  const days = useMemo(() => [...new Set((visits ?? []).filter(v => normalizeIdentity(v.technician) === normalizeIdentity(technician) && (!onsiteOnly || normalizeIdentity(v.serviceType) === 'en sitio')).flatMap(v => [v.checkIn?.slice(0, 10), v.checkOut?.slice(0, 10)]).filter((value): value is string => Boolean(value)))].sort().reverse(), [visits, technician, onsiteOnly]);
  const idleDays = useMemo(() => idleByDay(visits ?? [], technician, onsiteOnly), [visits, technician, onsiteOnly]);
  const straightAnalysis = useMemo(() => analyzeDay(visits ?? [], technician, day, onsiteOnly), [visits, technician, day, onsiteOnly]);
  const [roads, setRoads] = useState<{ source: DayAnalysis; routes: Record<string, RoadRoute | null> | 'failed' } | null>(null);
  const analysis = useMemo(() => roads?.source === straightAnalysis && roads.routes !== 'failed' ? applyRoads(straightAnalysis, roads.routes) : straightAnalysis, [roads, straightAnalysis]);
  const roadStatus = !routePairs(straightAnalysis).length ? 'none' : roads?.source !== straightAnalysis ? 'loading' : roads.routes === 'failed' ? 'failed' : 'ready';
  const selected = visits?.find(v => v.key === selectedKey) ?? null;
  const selectedSite = selected ? state.sites.find(site => site.key === siteKey(selected)) : undefined;
  const serialSite = state.sites.find(site => site.serialNumber && site.serialNumber === normalizeTrackingSerial(serialNumber));
  const visibleSiteKeys = new Set(analysis.visits.map(siteKey));
  const mapSites = state.sites.filter(site => visibleSiteKeys.has(site.key));
  const lat = latitude.trim() === '' ? NaN : Number(latitude);
  const lon = longitude.trim() === '' ? NaN : Number(longitude);
  const candidate: Coordinate | null = Number.isFinite(lat) && Math.abs(lat) <= 85.05112878 && Number.isFinite(lon) && Math.abs(lon) <= 180 ? { latitude: lat, longitude: lon } : null;

  useEffect(() => {
    let cancelled = false;
    fetchState('/api/tracking').then(value => { if (!cancelled) setState(value); }).catch(err => { if (!cancelled) setError(err.message); }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);
  useEffect(() => {
    const pairs = routePairs(straightAnalysis);
    if (!pairs.length) return;
    const controller = new AbortController();
    fetch('/api/tracking/route', {
      method: 'POST', headers: { 'content-type': 'application/json' }, signal: controller.signal,
      body: JSON.stringify({ legs: pairs.map(({ from, to }) => ({ from, to })) }),
    }).then(async response => {
      const result = await response.json() as { routes?: (RoadRoute | null)[] };
      if (!response.ok || !result.routes) throw new Error('route');
      setRoads({ source: straightAnalysis, routes: Object.fromEntries(pairs.map((pair, position) => [pair.key, result.routes![position] ?? null])) });
    }).catch(() => { if (!controller.signal.aborted) setRoads({ source: straightAnalysis, routes: 'failed' }); });
    return () => controller.abort();
  }, [straightAnalysis]);
  useEffect(() => { if (!technicians.includes(technician)) setTechnician(technicians[0] ?? ''); }, [technicians, technician]);
  useEffect(() => { if (!days.includes(day)) setDay(days[0] ?? ''); }, [days, day]);
  useEffect(() => { setSelectedKey(null); setEditing(false); setLatitude(''); setLongitude(''); setSerialNumber(''); }, [technician, day, onsiteOnly]);
  useEffect(() => {
    setGeocodingResults([]);
    return () => { geocodingRequest.current?.abort(); };
  }, [selectedKey, address]);

  async function searchAddress() {
    if (!selected || busy || address.trim().length < 5) return;
    const controller = new AbortController();
    geocodingRequest.current = controller;
    setBusy(true); setError(''); setNotice(''); setGeocodingResults([]);
    try {
      const response = await fetch('/api/tracking/geocode', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ address }), signal: controller.signal,
      });
      const result = await response.json() as { candidates: GeocodingCandidate[]; error?: string };
      if (controller.signal.aborted) return;
      if (!response.ok) throw new Error(result.error ?? 'No se pudo buscar la dirección.');
      setGeocodingResults(result.candidates);
      setNotice(result.candidates.length ? 'Selecciona una ubicación propuesta y verifica que corresponda al equipo antes de confirmar la sede.' : 'Sin coincidencias en Paraguay. Agrega ciudad, calle y número, o ubica la sede manualmente.');
    } catch (err) {
      if (!controller.signal.aborted) setError(err instanceof Error ? err.message : 'No se pudo buscar la dirección.');
    } finally { setBusy(false); }
  }

  function selectVisit(visit: TrackingVisit) {
    const reference = state.sites.find(site => site.key === siteKey(visit));
    setSelectedKey(visit.key); setEditing(false);
    setSerialNumber(visit.serialNumber);
    // Never seed a reference from the technician's observed GPS coordinates.
    setLatitude(reference ? String(reference.latitude) : ''); setLongitude(reference ? String(reference.longitude) : '');
    setAddress(reference?.address ?? visit.address); setNotice('');
  }
  async function importFiles() {
    if (!reportsFile || !gpsFile) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const [reports, geolocation] = await Promise.all([uploadSource(reportsFile), uploadSource(gpsFile)]);
      setState(await fetchState('/api/tracking/import', 'POST', { reports, geolocation }));
      setSelectedKey(null); setEditing(false); setLatitude(''); setLongitude(''); setSerialNumber('');
      setNotice('Carga guardada en SQLite. Los originales y sus filas están disponibles en el archivo de importaciones.');
    } catch (err) { setError(err instanceof Error ? err.message : 'No se pudo importar.'); }
    finally { setBusy(false); }
  }
  async function saveSite() {
    if (!selected || !candidate) return;
    setBusy(true); setError('');
    try {
      const result = await fetchState('/api/tracking/sites', 'PUT', { visitKey: selected.key, ...candidate, address, serialNumber });
      setState(result);
      setSerialNumber(normalizeTrackingSerial(serialNumber));
      setEditing(false);
      const serial = normalizeTrackingSerial(serialNumber);
      const count = result.snapshot?.visits.filter(visit => visit.serialNumber === serial).length ?? 0;
      setNotice(serial
        ? `Sede guardada para la serie ${serial}. Aplicada automáticamente a ${count} registros de esta carga y disponible para futuras cargas con la misma serie.`
        : 'Sede confirmada sin serie. Se conserva el alcance por cliente/sucursal o I.S.; no se puede autoasignar por equipo.');
    } catch (err) { setError(err instanceof Error ? err.message : 'No se pudo guardar la sede.'); }
    finally { setBusy(false); }
  }
  async function removeSite() {
    if (!selectedSite) return;
    setBusy(true); setError('');
    try {
      setState(await fetchState(`/api/tracking/sites/${encodeURIComponent(selectedSite.key)}`, 'DELETE'));
      setLatitude(''); setLongitude(''); setNotice('Referencia retirada: las marcaciones ya no se consideran verificables.');
    } catch (err) { setError(err instanceof Error ? err.message : 'No se pudo retirar la referencia.'); }
    finally { setBusy(false); }
  }
  const linkedIds = new Set((visits ?? []).filter(v => v.matchedReport).flatMap(v => [
    JSON.stringify([v.reportId, normalizeIdentity(v.customer), normalizeIdentity(v.technician)]),
    JSON.stringify([v.reportId, normalizeIdentity(v.customer), '']),
  ]));
  const unmatchedReports = snapshot?.reports.filter(report => !linkedIds.has(JSON.stringify([report.reportId, normalizeIdentity(report.customer), normalizeIdentity(report.technician)]))) ?? [];
  const undated = (visits ?? []).filter(v => !v.checkIn && !v.checkOut);
  return <div className="page-content tracking-module">
    <section className="catalog-header"><div><div className="eyebrow">OPERACIONES / TRAZABILIDAD</div><h1>Tracking de técnicos</h1><p className="lead">Marcaciones diarias, intervalos entre visitas y proximidad a la sede del cliente.</p></div></section>
    <section className="tracking-card"><h2>Cargar fuentes originales</h2><p>Selecciona el detalle de informes y las marcaciones de geolocalización. Se vinculan por Nº I.S., técnico y cliente; las filas sin coincidencia se conservan. Una nueva carga reemplaza el análisis vigente, no el archivo histórico ni las sedes confirmadas.</p>
      <div className="tracking-import-grid">
        <div className="tracking-file"><span>1. Informes de servicio</span><label className="secondary-button file-button"><span>{reportsFile ? reportsFile.name : 'Seleccionar archivo'}</span><input type="file" accept=".csv,.xlsx" aria-label="1. Informes de servicio" aria-describedby="tracking-reports-source" disabled={busy || loading} onChange={e => setReportsFile(e.target.files?.[0] ?? null)} /></label><small id="tracking-reports-source">Superset &gt; SGS - Tecnicos asignados &gt; Detalle de Servicios</small></div>
        <div className="tracking-file"><span>2. Geolocalización</span><label className="secondary-button file-button"><span>{gpsFile ? gpsFile.name : 'Seleccionar archivo'}</span><input type="file" accept=".csv,.xlsx" aria-label="2. Geolocalización" aria-describedby="tracking-gps-source" disabled={busy || loading} onChange={e => setGpsFile(e.target.files?.[0] ?? null)} /></label><small id="tracking-gps-source">Superset &gt; SGS - I.S Pendientes y Asignados - Tracking &gt; Del mobile</small></div>
        <button type="button" className="primary-button" disabled={!reportsFile || !gpsFile || busy || loading} onClick={() => void importFiles()}>{busy ? 'Guardando…' : 'Cargar y analizar'}</button>
      </div>
      <small>CSV UTF-8 o XLSX · máximo 18 MB por archivo · horas locales literales de SGS, sin convertir de zona horaria.</small>
    </section>
    {error && <p className="tracking-error" role="alert">{error}<button type="button" className="secondary-button" disabled={busy} onClick={() => { setLoading(true); fetchState('/api/tracking').then(value => { setState(value); setError(''); }).catch(err => setError(err.message)).finally(() => setLoading(false)); }}>Reintentar consulta</button></p>}
    {notice && <p className="tracking-notice" role="status">{notice}</p>}
    {loading && <p role="status">Consultando la carga local…</p>}
    {!loading && !snapshot && <section className="tracking-card"><h2>Sin carga de tracking</h2><p>Carga ambos archivos para consultar el recorrido. No se generan datos de ejemplo ni ubicaciones inferidas.</p></section>}
    {snapshot && <>
      <section className="summary-grid" aria-label="Cobertura de fuentes"><div className="summary-card accent"><span className="summary-value">{technicians.length}</span><span className="summary-label">técnicos con marcaciones</span></div><div className="summary-card"><span className="summary-value">{snapshot.visits.length.toLocaleString('es-PY')}</span><span className="summary-label">registros de geolocalización</span></div><div className="summary-card"><span className="summary-value">{snapshot.matchedVisits.toLocaleString('es-PY')}</span><span className="summary-label">registros con detalle de informe vinculado</span></div></section>
      <section className="tracking-card tracking-source-summary"><strong>{snapshot.reportFile} + {snapshot.geolocationFile}</strong><small>Carga: {new Date(snapshot.importedAt).toLocaleString('es-PY')} · {snapshot.reports.length} filas de informes</small>{snapshot.warnings.length > 0 && <ul>{snapshot.warnings.map(warning => <li key={warning}>{warning}</li>)}</ul>}</section>
      <section className="tracking-card tracking-filters" aria-label="Filtros de recorrido"><label>Técnico<select value={technician} disabled={busy} onChange={e => setTechnician(e.target.value)}>{technicians.map(name => <option key={name} value={name}>{name}</option>)}</select></label><label>Día de marcación<select value={day} disabled={busy} onChange={e => setDay(e.target.value)}>{days.length ? days.map(date => <option key={date} value={date}>{date.split('-').reverse().join('/')}</option>) : <option value="">Sin fechas utilizables</option>}</select></label><label className="tracking-checkbox"><input type="checkbox" checked={onsiteOnly} disabled={busy} onChange={e => setOnsiteOnly(e.target.checked)} /> Sólo servicios en sitio</label><span>{analysis.visits.length} registros · {analysis.events.filter(e => e.coordinate).length}/{analysis.events.length} eventos con GPS</span></section>
      {!onsiteOnly && <p className="tracking-notice">Incluye servicios remotos, internos, de taller o sin tipo. Sus puntos no demuestran desplazamientos a clientes.</p>}
      {analysis.suspectVisitKeys.length > 0 && <p className="tracking-error" role="alert">GPS dudoso en {analysis.suspectVisitKeys.length} servicio(s): {analysis.visits.filter(v => analysis.suspectVisitKeys.includes(v.key)).map(v => `I.S. ${v.reportId}`).join(', ')}. Su entrada y su salida están a más de 5 km entre sí, por lo que no describen un solo lugar (marcación remota o ubicación errónea). Los tramos entre marcaciones de servicios dudosos se muestran en rojo discontinuo; los que tocan solo uno se dibujan normales. Esas rutas rojas y su distancia no son confiables.</p>}
      <div className="tracking-map-layout">
        <RouteMap events={analysis.events} roadSegments={analysis.roadSegments} suspectVisitKeys={analysis.suspectVisitKeys} sites={mapSites} selectedVisit={selectedKey} candidate={selected ? candidate : null} editing={editing && !busy} onPick={point => { setLatitude(point.latitude.toFixed(7)); setLongitude(point.longitude.toFixed(7)); }} onSelect={key => { const visit = visits?.find(v => v.key === key); if (visit) selectVisit(visit); }} />
        <section className="tracking-card tracking-site-editor" aria-label="Confirmación manual de sede"><h2>Sede de referencia</h2>
          {!selected ? <p>Selecciona un I.S. en la tabla o un punto del mapa. La ubicación debe confirmarse con una fuente independiente de las marcaciones del técnico.</p> : <><strong>{selected.customer}</strong><span>I.S. {selected.reportId} · {selected.branch || 'Sucursal no informada'}</span>
            <label>Número de serie del equipo<input value={serialNumber} maxLength={100} disabled={busy} onChange={event => {
              const value = event.target.value;
              setSerialNumber(value);
              const reference = state.sites.find(site => site.serialNumber && site.serialNumber === normalizeTrackingSerial(value));
              if (reference) {
                setLatitude(String(reference.latitude)); setLongitude(String(reference.longitude)); setAddress(reference.address);
              }
            }} placeholder="Serie verificada del equipo" /></label>
            <p>{normalizeTrackingSerial(serialNumber)
              ? 'La sede se guardará por serie y se aplicará a todos los informes de ese equipo, incluso en futuras cargas. Si el equipo se traslada, reconfirma su sede.'
              : selected.branch ? 'Sin serie, esta referencia se reutiliza para el mismo cliente y sucursal.'
              : 'Sin serie ni sucursal, la referencia se aplica sólo a este Nº I.S. y cliente. Completa la serie para reutilizarla entre informes.'}</p>
            {serialSite && <small>Esta serie ya tiene una sede confirmada. Se cargó su ubicación; confirmar vinculará este I.S. al mismo equipo.</small>}
            {selectedSite && <small>Confirmada: {new Date(selectedSite.confirmedAt).toLocaleString('es-PY')}</small>}
            <button type="button" className="secondary-button" disabled={busy} onClick={() => setEditing(value => !value)}>{editing ? 'Terminar selección en mapa' : 'Elegir ubicación en el mapa'}</button>
            {editing && <p role="status">Haz clic en la sede real, no en el GPS del técnico. Arrastra para desplazar el mapa.</p>}
            <label>Dirección de referencia<input value={address} maxLength={500} disabled={busy} onChange={e => setAddress(e.target.value)} placeholder="Dirección verificada del cliente" /></label>
            {!selected.branch && <small>Sin sucursal informada: esta dirección podría ser de casa matriz. Verifica que sea la ubicación del equipo.</small>}
            <button type="button" className="secondary-button" disabled={busy || address.trim().length < 5} onClick={() => void searchAddress()}>Buscar dirección en Paraguay</button>
            <small>Sólo al pulsar Buscar se envía esta dirección a Photon/Komoot. No se envían series ni marcaciones. Las coincidencias son aproximadas, no sedes confirmadas. Incluye ciudad, calle y número; no envíes datos confidenciales.</small>
            {geocodingResults.length > 0 && <div className="tracking-geocoding-results" aria-label="Ubicaciones propuestas">{geocodingResults.map((result, index) => <button type="button" className="secondary-button" disabled={busy} key={index} onClick={() => {
              setLatitude(String(result.latitude)); setLongitude(String(result.longitude)); setEditing(false);
              setNotice(`Ubicación propuesta: ${result.label}. Revisa el mapa; aún no se confirmó ni se usa para validar marcaciones.`);
            }}>{result.label}<small>{result.kind} · {result.latitude.toFixed(6)}, {result.longitude.toFixed(6)}</small></button>)}</div>}
            <small>Geocodificación: <a href="https://github.com/komoot/photon" target="_blank" rel="noreferrer">Photon/Komoot</a> · Datos <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap contributors</a>. Servicio público sin garantía de disponibilidad.</small>
            <label>Latitud<input type="number" step="any" min="-85.05112878" max="85.05112878" value={latitude} disabled={busy} onChange={e => setLatitude(e.target.value)} /></label><label>Longitud<input type="number" step="any" min="-180" max="180" value={longitude} disabled={busy} onChange={e => setLongitude(e.target.value)} /></label>
            <small>El pin propuesto no se usa para validar hasta confirmar. Radio fijo: 100 metros.</small>
            <button type="button" className="primary-button" disabled={!candidate || busy} onClick={() => void saveSite()}>Confirmar sede verificada</button>
            {selectedSite && <button type="button" className="secondary-button" disabled={busy} onClick={() => void removeSite()}>Retirar referencia</button>}
          </>}
        </section>
      </div>
      <details className="tracking-card"><summary>Cronología de eventos ({analysis.events.length})</summary><ol className="tracking-timeline">{analysis.events.map((event, index) => <li key={event.key}><button type="button" onClick={() => { const visit = visits?.find(v => v.key === event.visitKey); if (visit) selectVisit(visit); }}>{index + 1}. {event.timestamp.slice(11, 19)} · {event.kind === 'in' ? 'Entrada' : 'Salida'} · I.S. {event.reportId} · {event.customer}{!event.coordinate ? ' · Sin GPS' : ''}</button></li>)}</ol></details>
      <TrackingTables analysis={analysis} idleDays={idleDays} day={day} roadStatus={roadStatus} sites={state.sites} selectedKey={selectedKey} onSelect={selectVisit} />
      <details className="tracking-card"><summary>Informes sin marcaciones vinculadas ({unmatchedReports.length})</summary><div className="tracking-table-scroll"><table><thead><tr><th>I.S.</th><th>Cliente / sede</th><th>Técnico</th><th>Estado / servicio</th></tr></thead><tbody>{unmatchedReports.map(report => <tr key={`${report.sourceSheet}:${report.sourceRow}`}><td>{report.reportId}</td><td>{report.customer}<small>{report.branch || 'Sucursal no informada'} · {report.address || 'Dirección no informada'}</small></td><td>{report.technician || 'Sin técnico'}</td><td>{report.status}<small>{report.requestedService}</small></td></tr>)}</tbody></table></div></details>
      {undated.length > 0 && <details className="tracking-card"><summary>Registros sin fecha de marcación utilizable ({undated.length})</summary><ul>{undated.map(visit => <li key={visit.key}>I.S. {visit.reportId} · {visit.customer} · {visit.technician} · {visit.issues.join(', ') || 'Sin check-in ni check-out'}</li>)}</ul></details>}
    </>}
  </div>;
}
