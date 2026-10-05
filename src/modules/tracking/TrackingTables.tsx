import { isSuspectLeg, legDistance, siteKey, summarizeDay, validateEvent } from './analysis';
import type { DayAnalysis, EventValidation, SiteReference, TrackingVisit } from './types';

const validationLabels: Record<EventValidation['status'], string> = { inside: 'Dentro de 100 m', outside: 'Fuera de 100 m', 'missing-gps': 'Sin GPS', 'missing-event': 'Sin marcación', unconfirmed: 'Sin sede confirmada' };
const distanceFormat = new Intl.NumberFormat('es-PY', { maximumFractionDigits: 0 });
export function formatDistance(meters: number | null): string {
  if (meters === null) return 'No calculable';
  return meters >= 1000 ? `${(meters / 1000).toLocaleString('es-PY', { maximumFractionDigits: 2 })} km` : `${distanceFormat.format(meters)} m`;
}
function formatDuration(minutes: number | null): string {
  if (minutes === null) return 'No calculable';
  const seconds = Math.round(minutes * 60);
  return `${Math.floor(seconds / 3600)} h ${Math.floor(seconds % 3600 / 60)} min${seconds % 60 ? ` ${seconds % 60} s` : ''}`;
}
function EventEvidence({ visit, kind, site }: { visit: TrackingVisit; kind: 'in' | 'out'; site: SiteReference | undefined }) {
  const time = kind === 'in' ? visit.checkIn : visit.checkOut;
  const gps = kind === 'in' ? visit.gpsIn : visit.gpsOut;
  const validation = validateEvent(time, gps, site);
  return <div className="tracking-event-evidence"><strong>{time ? time.replace('T', ' ') : 'Sin marcación'}</strong><span className={`tracking-status ${validation.status}`}>{validationLabels[validation.status]}</span>
    {validation.distanceMeters !== null && <span>{formatDistance(validation.distanceMeters)} de la sede</span>}
    <small>{gps ? `${gps.latitude.toFixed(6)}, ${gps.longitude.toFixed(6)}` : 'Sin coordenadas GPS'}</small></div>;
}
export type RoadStatus = 'none' | 'loading' | 'ready' | 'failed';
export default function TrackingTables({ analysis, roadStatus, sites, selectedKey, onSelect }: { analysis: DayAnalysis; roadStatus: RoadStatus; sites: SiteReference[]; selectedKey: string | null; onSelect: (visit: TrackingVisit) => void }) {
  const siteIndex = new Map(sites.map(site => [site.key, site]));
  const summary = summarizeDay(analysis);
  return <>
    <section className="tracking-card"><h2>Visitas y marcaciones</h2><p>La validación demuestra proximidad a una sede confirmada, no el ingreso físico al edificio. No es concluyente sobre la conducta del técnico.</p>
      <div className="tracking-table-scroll"><table><thead><tr><th>I.S. / cliente</th><th>Check-in</th><th>Check-out</th><th>Detalle y sede</th></tr></thead><tbody>
        {analysis.visits.map(visit => <tr key={visit.key} className={visit.key === selectedKey ? 'tracking-selected-row' : ''}>
          <td><button type="button" className="tracking-report-button" onClick={() => onSelect(visit)}>I.S. {visit.reportId}</button><strong>{visit.customer}</strong><small>Serie: {visit.serialNumber || 'No informada'}</small><small>{visit.branch || 'Sucursal no informada'} · {visit.serviceType || 'Tipo no informado'}</small>{visit.serialNumber && siteIndex.has(siteKey(visit)) && <small>Sede asignada por serie</small>}</td>
          <td><EventEvidence visit={visit} kind="in" site={siteIndex.get(siteKey(visit))} /></td><td><EventEvidence visit={visit} kind="out" site={siteIndex.get(siteKey(visit))} /></td>
          <td><span>{visit.requestedService || 'Sin descripción'}</span><small>{visit.matchedReport ? 'Detalle de informe vinculado' : 'Sólo detalle de geolocalización'}</small><small>{visit.sourceSheet} · fila {visit.sourceRow}</small>{analysis.suspectVisitKeys.includes(visit.key) && <small className="tracking-issue">GPS dudoso: entrada y salida a más de 5 km entre sí</small>}{visit.issues.map(issue => <small className="tracking-issue" key={issue}>{issue}</small>)}<button type="button" className="secondary-button" onClick={() => onSelect(visit)}>Confirmar sede</button></td>
        </tr>)}
      </tbody></table></div>{!analysis.visits.length && <p role="status">Sin marcaciones para estos filtros.</p>}
    </section>
    <section className="tracking-card"><h2>Traslados entre visitas</h2><p>Salida registrada → siguiente entrada. La distancia es la de la posible ruta tomada por carretera (estimada con OSRM, vehículo; no es el recorrido GPS real); si no hay ruta se muestra la distancia directa. {roadStatus === 'loading' && 'Calculando rutas…'}{roadStatus === 'failed' && 'No se pudo consultar el servicio de rutas: se muestran distancias directas.'} El intervalo puede incluir esperas o paradas; no es tiempo efectivo de conducción. Informes simultáneos se muestran como solapados.</p>
      <div className="tracking-table-scroll"><table><thead><tr><th>Desde</th><th>Hasta</th><th>Distancia</th><th>Intervalo</th><th>Evidencia</th></tr></thead><tbody>
        {analysis.legs.map((leg, index) => <tr key={`${leg.from.key}:${leg.to.key}:${index}`}><td>{leg.from.customer}<small>I.S. {leg.from.reportId} · salida {leg.from.checkOut?.slice(11, 16) ?? 'sin marcación'}</small></td><td>{leg.to.customer}<small>I.S. {leg.to.reportId} · entrada {leg.to.checkIn?.slice(11, 16)}</small></td><td>{formatDistance(legDistance(leg))}{legDistance(leg) !== null && <small className={isSuspectLeg(analysis, leg) ? 'tracking-issue' : undefined}>{isSuspectLeg(analysis, leg) ? 'Línea recta · GPS dudoso' : leg.road ? 'Posible ruta tomada' : 'Línea recta'}</small>}</td><td>{leg.elapsedMinutes === null ? 'No calculable' : `${leg.elapsedMinutes.toLocaleString('es-PY', { maximumFractionDigits: 1 })} min`}</td><td>{leg.issue ?? 'Ambos eventos con hora y GPS'}</td></tr>)}
      </tbody></table></div>{!analysis.legs.length && <p>No hay dos entradas consecutivas en este día para calcular un tramo.</p>}
    </section>
    <section className="tracking-card tracking-daily-summary"><h2>Resumen general</h2><p>Totales del técnico y día seleccionados, respetando el filtro de servicios.</p>
      <div className="tracking-table-scroll"><table><thead><tr><th>Kilometraje total entre visitas</th><th>Tiempo total estimado de traslado</th><th>Tiempo efectivo de servicios registrado</th></tr></thead><tbody><tr>
        <td><strong>{summary.distanceMeters === null ? 'No calculable' : `${(summary.distanceMeters / 1000).toLocaleString('es-PY', { maximumFractionDigits: 2 })} km`}</strong><small>{summary.measuredLegs} de {analysis.legs.length} tramos con distancia calculable{summary.missingLegs ? ' · Total parcial' : ''}. {summary.roadLegs} por posible ruta tomada, {summary.measuredLegs - summary.roadLegs} en línea recta{summary.measuredLegs > summary.roadLegs ? ' · Mezcla de métodos' : ''}.{summary.suspectLegs > 0 && <span className="tracking-issue"> {summary.suspectLegs} tramo(s) con GPS dudoso incluidos en línea recta: el total no es confiable.</span>} Es una estimación de la ruta más probable, no el recorrido real, y no incluye el traslado inicial o final de la jornada.</small></td>
        <td><strong>{formatDuration(summary.travelMinutes)}</strong><small>{summary.timedLegs} de {analysis.legs.length} tramos con intervalo calculable{summary.missingTimedLegs ? ' · Total parcial' : ''}. Suma de salida a siguiente entrada, sin incluir servicios. Puede incluir esperas o pausas; no es tiempo efectivo de conducción.</small></td>
        <td><strong>{formatDuration(summary.serviceMinutes)}</strong><small>Intervalos completos de check-in a check-out, sin sumar dos veces solapamientos o duplicados. Los servicios que cruzan medianoche se limitan a este día.</small>{summary.excludedServices > 0 && <small className="tracking-issue">{summary.excludedServices} registros excluidos por marcaciones incompletas o inconsistentes · Total parcial.</small>}</td>
      </tr></tbody></table></div>
      <p>El tiempo de servicios se basa en las marcaciones, no demuestra horas de trabajo real ni presencia dentro del cliente. La proximidad a la sede se verifica por separado en la tabla de visitas.</p>
    </section>
  </>;
}
