import { isSuspectLeg, legDistance, legTravelMinutes, siteKey, summarizeDay, validateEvent, WORK_END_HOUR, WORK_MINUTES, WORK_START_HOUR } from './analysis';
import type { IdleDay } from './analysis';
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
export default function TrackingTables({ analysis, idleDays, day, roadStatus, sites, selectedKey, onSelect }: { analysis: DayAnalysis; idleDays: IdleDay[]; day: string; roadStatus: RoadStatus; sites: SiteReference[]; selectedKey: string | null; onSelect: (visit: TrackingVisit) => void }) {
  const siteIndex = new Map(sites.map(site => [site.key, site]));
  const summary = summarizeDay(analysis);
  const idle = idleDays.find(row => row.day === day);
  const parts = idle ? idle.serviceMinutes + (summary.travelMinutes ?? 0) + idle.idleMinutes : 0;
  const weekend = [0, 6].includes(new Date(`${day}T00:00:00Z`).getUTCDay());
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
        {analysis.legs.map((leg, index) => <tr key={`${leg.from.key}:${leg.to.key}:${index}`}><td>{leg.from.customer}<small>I.S. {leg.from.reportId} · salida {leg.from.checkOut?.slice(11, 16) ?? 'sin marcación'}</small></td><td>{leg.to.customer}<small>I.S. {leg.to.reportId} · entrada {leg.to.checkIn?.slice(11, 16)}</small></td><td>{formatDistance(legDistance(leg))}{legDistance(leg) !== null && <small className={isSuspectLeg(analysis, leg) ? 'tracking-issue' : undefined}>{isSuspectLeg(analysis, leg) ? `${leg.road ? 'Posible ruta tomada' : 'Línea recta'} · GPS dudoso` : leg.road ? 'Posible ruta tomada' : 'Línea recta'}</small>}</td><td>{leg.elapsedMinutes === null ? 'No calculable' : `${leg.elapsedMinutes.toLocaleString('es-PY', { maximumFractionDigits: 1 })} min`}{legTravelMinutes(leg)! < leg.elapsedMinutes! && <small className="tracking-issue">Traslado estimado {formatDuration(legTravelMinutes(leg))}; el resto es espera o pausa</small>}</td><td>{leg.issue ?? 'Ambos eventos con hora y GPS'}</td></tr>)}
      </tbody></table></div>{!analysis.legs.length && <p>No hay dos entradas consecutivas en este día para calcular un tramo.</p>}
    </section>
    <section className="tracking-card tracking-daily-summary"><h2>Resumen general</h2><p>Totales del técnico y día seleccionados, respetando el filtro de servicios.</p>
      <div className="tracking-table-scroll"><table><thead><tr><th>Kilometraje total entre visitas</th><th>Tiempo total estimado de traslado</th><th>Tiempo efectivo de servicios registrado</th></tr></thead><tbody><tr>
        <td><strong>{summary.distanceMeters === null ? 'No calculable' : `${(summary.distanceMeters / 1000).toLocaleString('es-PY', { maximumFractionDigits: 2 })} km`}</strong><small>{summary.measuredLegs} de {analysis.legs.length} tramos con distancia calculable{summary.missingLegs ? ' · Total parcial' : ''}. {summary.roadLegs} por posible ruta tomada, {summary.measuredLegs - summary.roadLegs} en línea recta{summary.measuredLegs > summary.roadLegs ? ' · Mezcla de métodos' : ''}.{summary.suspectLegs > 0 && <span className="tracking-issue"> {summary.suspectLegs} tramo(s) con GPS dudoso incluidos: el total no es confiable.</span>} Es una estimación de la ruta más probable, no el recorrido real, y no incluye el traslado inicial o final de la jornada.</small></td>
        <td><strong>{formatDuration(summary.travelMinutes)}</strong><small>{summary.timedLegs} de {analysis.legs.length} tramos con intervalo calculable{summary.missingTimedLegs ? ' · Total parcial' : ''}. Suma de salida a siguiente entrada, sin incluir servicios. Cada tramo se limita a un viaje plausible según su distancia; el exceso se cuenta como espera o pausa.</small></td>
        <td><strong>{formatDuration(summary.serviceMinutes)}</strong><small>Intervalos completos de check-in a check-out, sin sumar dos veces solapamientos o duplicados. Los servicios que cruzan medianoche se limitan a este día.</small>{summary.excludedServices > 0 && <small className="tracking-issue">{summary.excludedServices} registros excluidos por marcaciones incompletas o inconsistentes · Total parcial.</small>}</td>
      </tr></tbody></table></div>
      <p>El tiempo de servicios se basa en las marcaciones, no demuestra horas de trabajo real ni presencia dentro del cliente. La proximidad a la sede se verifica por separado en la tabla de visitas.</p>
      <h3>Horas no efectivas estimadas del día</h3>
      {!idle ? <p role="status">{weekend ? 'Fin de semana: fuera de la jornada laboral, no se calculan horas no efectivas estimadas.' : 'Sin marcaciones para este día.'}</p> : <>
        <p>Jornada de lunes a viernes, {String(WORK_START_HOUR).padStart(2, '0')}:00 a {WORK_END_HOUR}:00 ({WORK_MINUTES / 60} h efectivas, descontada 1 h de almuerzo). No efectivo estimado = jornada menos almuerzo, menos servicios registrados dentro de ese horario (sin sumar dos veces solapamientos) y menos el tiempo total estimado de traslado. Es una estimación porque el traslado es estimado. Incluye esperas y marcaciones faltantes. Respeta el filtro de servicios.</p>
        {idle.excludedServices > 0 && <small className="tracking-issue">{idle.excludedServices} registro(s) excluidos por marcaciones incompletas o inconsistentes · Puede sobrestimar.</small>}
        <div className="tracking-table-scroll"><table><thead><tr><th><i className="tracking-dot bar-effective" />Horas efectivas trabajadas</th><th><i className="tracking-dot bar-total" />Tiempo total estimado de traslado</th><th><i className="tracking-dot bar-idle" />Horas no efectivas estimadas</th></tr></thead><tbody><tr>
          {([['effective', idle.serviceMinutes, 'Servicios registrados dentro de la jornada.'], ['total', summary.travelMinutes ?? 0, 'Mismo valor del resumen general.'], ['idle', idle.idleMinutes, 'Jornada efectiva menos servicios y traslado.']] as const).map(([kind, minutes, note]) => <td key={kind}><strong>{formatDuration(minutes)}</strong><small>{note} {Math.round(minutes / Math.max(WORK_MINUTES, parts) * 100)} % de las {WORK_MINUTES / 60} h.</small></td>)}
        </tr></tbody></table></div>
        <div className="tracking-storage" role="img" aria-label={`Jornada de ${WORK_MINUTES / 60} h: ${formatDuration(idle.serviceMinutes)} efectivas, ${formatDuration(summary.travelMinutes ?? 0)} de traslado, ${formatDuration(idle.idleMinutes)} no efectivas estimadas`}>
          {([['effective', idle.serviceMinutes], ['total', summary.travelMinutes ?? 0], ['idle', idle.idleMinutes]] as const).map(([kind, minutes]) => minutes > 0 && <span key={kind} className={`bar-${kind}`} style={{ flexGrow: minutes }} />)}
          {parts < WORK_MINUTES && <span className="storage-free" style={{ flexGrow: WORK_MINUTES - parts }} />}
        </div>
        {idle.overtimeMinutes > 0 && <p className="tracking-error" role="alert">Excede la jornada efectiva en {formatDuration(idle.overtimeMinutes)}: servicios más traslado estimado superan las {WORK_MINUTES / 60} h. Horas no efectivas estimadas: 0. Revisa si hay esperas largas entre servicios contadas como traslado.</p>}
      </>}
    </section>
  </>;
}
