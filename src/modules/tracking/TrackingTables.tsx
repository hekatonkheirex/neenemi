import { Badge } from '../../core/ui/badge';
import { Button } from '../../core/ui/button';
import { Card, CardHeader, Muted } from '../../core/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../core/ui/table';
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
  return <div className="grid min-w-0 justify-items-start gap-2 [overflow-wrap:anywhere]">
    <div className="font-semibold tabular-nums text-navy dark:text-white">{time ? time.replace('T', ' ') : 'Sin marcación'}</div>
    <Badge tone={validation.status === 'inside' ? 'success' : validation.status === 'outside' ? 'danger' : 'neutral'}>{validationLabels[validation.status]}</Badge>
    {validation.distanceMeters !== null && <div>{formatDistance(validation.distanceMeters)} de la sede</div>}
    <Muted className="font-mono tabular-nums">{gps ? `${gps.latitude.toFixed(6)}, ${gps.longitude.toFixed(6)}` : 'Sin coordenadas GPS'}</Muted>
  </div>;
}
export type RoadStatus = 'none' | 'loading' | 'ready' | 'failed';
export default function TrackingTables({ analysis, idleDays, day, roadStatus, sites, selectedKey, onSelect }: { analysis: DayAnalysis; idleDays: IdleDay[]; day: string; roadStatus: RoadStatus; sites: SiteReference[]; selectedKey: string | null; onSelect: (visit: TrackingVisit) => void }) {
  const siteIndex = new Map(sites.map(site => [site.key, site]));
  const summary = summarizeDay(analysis);
  const idle = idleDays.find(row => row.day === day);
  const parts = idle ? idle.serviceMinutes + (summary.travelMinutes ?? 0) + idle.idleMinutes : 0;
  const weekend = [0, 6].includes(new Date(`${day}T00:00:00Z`).getUTCDay());
  return <>
    <Card className="min-w-0 grid-cols-1 [overflow-wrap:anywhere]">
      <CardHeader title="Visitas y marcaciones" aside={<Badge>{analysis.visits.length} visitas</Badge>} />
      <Muted className="leading-relaxed">La validación demuestra proximidad a una sede confirmada, no el ingreso físico al edificio. No es concluyente sobre la conducta del técnico.</Muted>
      <Table className="min-w-[960px] table-fixed" wrapperClassName="min-w-0 overflow-auto" aria-label="Visitas y marcaciones">
        <TableHeader><TableRow>
          <TableHead className="w-[25%]">I.S. / cliente</TableHead>
          <TableHead className="w-[22%]">Check-in</TableHead>
          <TableHead className="w-[22%]">Check-out</TableHead>
          <TableHead className="w-[31%]">Detalle y sede</TableHead>
        </TableRow></TableHeader>
        <TableBody>
          {analysis.visits.map(visit => <TableRow key={visit.key} className={visit.key === selectedKey ? 'bg-sky/10 dark:bg-sky/15' : undefined}>
            <TableCell>
              <div className="grid min-w-0 justify-items-start gap-2">
                <Button variant="ghost" size="sm" className="h-auto max-w-full whitespace-normal text-left [overflow-wrap:anywhere]" aria-pressed={visit.key === selectedKey} onClick={() => onSelect(visit)}>I.S. {visit.reportId}</Button>
                <div className="font-semibold text-navy dark:text-white">{visit.customer}</div>
                <Muted>Serie: {visit.serialNumber || 'No informada'}</Muted>
                <Muted>{visit.branch || 'Sucursal no informada'} · {visit.serviceType || 'Tipo no informado'}</Muted>
                {visit.serialNumber && siteIndex.has(siteKey(visit)) && <Muted>Sede asignada por serie</Muted>}
              </div>
            </TableCell>
            <TableCell><EventEvidence visit={visit} kind="in" site={siteIndex.get(siteKey(visit))} /></TableCell>
            <TableCell><EventEvidence visit={visit} kind="out" site={siteIndex.get(siteKey(visit))} /></TableCell>
            <TableCell>
              <div className="grid min-w-0 justify-items-start gap-2">
                <div>{visit.requestedService || 'Sin descripción'}</div>
                <Muted>{visit.matchedReport ? 'Detalle de informe vinculado' : 'Sólo detalle de geolocalización'}</Muted>
                <Muted>{visit.sourceSheet} · fila {visit.sourceRow}</Muted>
                {analysis.suspectVisitKeys.includes(visit.key) && <Muted className="tracking-issue">GPS dudoso: entrada y salida a más de 5 km entre sí</Muted>}
                {visit.issues.map(issue => <Muted className="tracking-issue" key={issue}>{issue}</Muted>)}
                <Button variant="outline" size="sm" onClick={() => onSelect(visit)}>Confirmar sede</Button>
              </div>
            </TableCell>
          </TableRow>)}
        </TableBody>
      </Table>
      {!analysis.visits.length && <Muted role="status">Sin marcaciones para estos filtros. Ajusta el técnico, el día o los servicios seleccionados para consultar otras visitas.</Muted>}
    </Card>
    <Card className="min-w-0 grid-cols-1 [overflow-wrap:anywhere]">
      <CardHeader title="Traslados entre visitas" aside={<Badge>{analysis.legs.length} tramos</Badge>} />
      <Muted className="leading-relaxed">Salida registrada → siguiente entrada. La distancia es la de la posible ruta tomada por carretera (estimada con OSRM, vehículo; no es el recorrido GPS real); si no hay ruta se muestra la distancia directa. {roadStatus === 'loading' && 'Calculando rutas…'}{roadStatus === 'failed' && 'No se pudo consultar el servicio de rutas: se muestran distancias directas.'} El intervalo puede incluir esperas o paradas; no es tiempo efectivo de conducción. Informes simultáneos se muestran como solapados.</Muted>
      <Table className="min-w-[960px] table-fixed" wrapperClassName="min-w-0 overflow-auto" aria-label="Traslados entre visitas">
        <TableHeader><TableRow>
          <TableHead className="w-[22%]">Desde</TableHead><TableHead className="w-[22%]">Hasta</TableHead>
          <TableHead className="w-[17%]">Distancia</TableHead><TableHead className="w-[20%]">Intervalo</TableHead>
          <TableHead className="w-[19%]">Evidencia</TableHead>
        </TableRow></TableHeader>
        <TableBody>
          {analysis.legs.map((leg, index) => <TableRow key={`${leg.from.key}:${leg.to.key}:${index}`}>
            <TableCell><div className="grid gap-2"><div className="font-semibold">{leg.from.customer}</div><Muted>I.S. {leg.from.reportId} · salida {leg.from.checkOut?.slice(11, 16) ?? 'sin marcación'}</Muted></div></TableCell>
            <TableCell><div className="grid gap-2"><div className="font-semibold">{leg.to.customer}</div><Muted>I.S. {leg.to.reportId} · entrada {leg.to.checkIn?.slice(11, 16)}</Muted></div></TableCell>
            <TableCell><div className="grid gap-2">
              <div className="font-semibold tabular-nums">{formatDistance(legDistance(leg))}</div>
              {legDistance(leg) !== null && <Muted className={isSuspectLeg(analysis, leg) ? 'tracking-issue' : undefined}>{isSuspectLeg(analysis, leg) ? `${leg.road ? 'Posible ruta tomada' : 'Línea recta'} · GPS dudoso` : leg.road ? 'Posible ruta tomada' : 'Línea recta'}</Muted>}
            </div></TableCell>
            <TableCell><div className="grid gap-2">
              <div className="font-semibold tabular-nums">{leg.elapsedMinutes === null ? 'No calculable' : `${leg.elapsedMinutes.toLocaleString('es-PY', { maximumFractionDigits: 1 })} min`}</div>
              {legTravelMinutes(leg)! < leg.elapsedMinutes! && <Muted className="tracking-issue">Traslado estimado {formatDuration(legTravelMinutes(leg))}; el resto es espera o pausa</Muted>}
            </div></TableCell>
            <TableCell>{leg.issue ?? 'Ambos eventos con hora y GPS'}</TableCell>
          </TableRow>)}
        </TableBody>
      </Table>
      {!analysis.legs.length && <Muted role="status">No hay dos entradas consecutivas en este día para calcular un tramo. Selecciona otro día o ajusta el filtro de servicios para consultar más marcaciones.</Muted>}
    </Card>
    <Card className="min-w-0 grid-cols-1 [overflow-wrap:anywhere]">
      <CardHeader title="Resumen general" />
      <Muted>Totales del técnico y día seleccionados, respetando el filtro de servicios.</Muted>
      <Table className="min-w-[760px] table-fixed" wrapperClassName="min-w-0 overflow-auto" aria-label="Resumen general">
        <TableHeader><TableRow>
          <TableHead className="whitespace-normal!">Kilometraje total entre visitas</TableHead>
          <TableHead className="whitespace-normal!">Tiempo total estimado de traslado</TableHead>
          <TableHead className="whitespace-normal!">Tiempo efectivo de servicios registrado</TableHead>
        </TableRow></TableHeader>
        <TableBody><TableRow>
          <TableCell><div className="grid gap-3">
            <div className="text-lg font-bold tabular-nums text-navy dark:text-white">{summary.distanceMeters === null ? 'No calculable' : `${(summary.distanceMeters / 1000).toLocaleString('es-PY', { maximumFractionDigits: 2 })} km`}</div>
            <Muted className="leading-relaxed">{summary.measuredLegs} de {analysis.legs.length} tramos con distancia calculable{summary.missingLegs ? ' · Total parcial' : ''}. {summary.roadLegs} por posible ruta tomada, {summary.measuredLegs - summary.roadLegs} en línea recta{summary.measuredLegs > summary.roadLegs ? ' · Mezcla de métodos' : ''}.{summary.suspectLegs > 0 && <span className="tracking-issue"> {summary.suspectLegs} tramo(s) con GPS dudoso incluidos: el total no es confiable.</span>} Es una estimación de la ruta más probable, no el recorrido real, y no incluye el traslado inicial o final de la jornada.</Muted>
          </div></TableCell>
          <TableCell><div className="grid gap-3">
            <div className="text-lg font-bold tabular-nums text-navy dark:text-white">{formatDuration(summary.travelMinutes)}</div>
            <Muted className="leading-relaxed">{summary.timedLegs} de {analysis.legs.length} tramos con intervalo calculable{summary.missingTimedLegs ? ' · Total parcial' : ''}. Suma de salida a siguiente entrada, sin incluir servicios. Cada tramo se limita a un viaje plausible según su distancia; el exceso se cuenta como espera o pausa.</Muted>
          </div></TableCell>
          <TableCell><div className="grid gap-3">
            <div className="text-lg font-bold tabular-nums text-navy dark:text-white">{formatDuration(summary.serviceMinutes)}</div>
            <Muted className="leading-relaxed">Intervalos completos de check-in a check-out, sin sumar dos veces solapamientos o duplicados. Los servicios que cruzan medianoche se limitan a este día.</Muted>
            {summary.excludedServices > 0 && <Muted className="tracking-issue">{summary.excludedServices} registros excluidos por marcaciones incompletas o inconsistentes · Total parcial.</Muted>}
          </div></TableCell>
        </TableRow></TableBody>
      </Table>
      <Muted className="leading-relaxed">El tiempo de servicios se basa en las marcaciones, no demuestra horas de trabajo real ni presencia dentro del cliente. La proximidad a la sede se verifica por separado en la tabla de visitas.</Muted>
      <div className="grid min-w-0 gap-4 border-t border-navy/10 pt-4 dark:border-sky/20">
        <h3 className="text-base font-bold text-navy dark:text-white">Horas no efectivas estimadas del día</h3>
        {!idle ? <Muted role="status">{weekend ? 'Fin de semana: fuera de la jornada laboral, no se calculan horas no efectivas estimadas.' : 'Sin marcaciones para este día.'}</Muted> : <>
          <Muted className="leading-relaxed">Jornada de lunes a viernes, {String(WORK_START_HOUR).padStart(2, '0')}:00 a {WORK_END_HOUR}:00 ({WORK_MINUTES / 60} h efectivas, descontada 1 h de almuerzo). No efectivo estimado = jornada menos almuerzo, menos servicios registrados dentro de ese horario (sin sumar dos veces solapamientos) y menos el tiempo total estimado de traslado. Es una estimación porque el traslado es estimado. Incluye esperas y marcaciones faltantes. Respeta el filtro de servicios.</Muted>
          {idle.excludedServices > 0 && <Muted className="tracking-issue">{idle.excludedServices} registro(s) excluidos por marcaciones incompletas o inconsistentes · Puede sobrestimar.</Muted>}
          <Table className="min-w-[760px] table-fixed" wrapperClassName="min-w-0 overflow-auto" aria-label="Horas no efectivas estimadas del día">
            <TableHeader><TableRow>
              <TableHead className="whitespace-normal!"><div className="flex items-start gap-2"><i className="tracking-dot bar-effective shrink-0" aria-hidden="true" />Horas efectivas trabajadas</div></TableHead>
              <TableHead className="whitespace-normal!"><div className="flex items-start gap-2"><i className="tracking-dot bar-total shrink-0" aria-hidden="true" />Tiempo total estimado de traslado</div></TableHead>
              <TableHead className="whitespace-normal!"><div className="flex items-start gap-2"><i className="tracking-dot bar-idle shrink-0" aria-hidden="true" />Horas no efectivas estimadas</div></TableHead>
            </TableRow></TableHeader>
            <TableBody><TableRow>
              {([['effective', idle.serviceMinutes, 'Servicios registrados dentro de la jornada.'], ['total', summary.travelMinutes ?? 0, 'Mismo valor del resumen general.'], ['idle', idle.idleMinutes, 'Jornada efectiva menos servicios y traslado.']] as const).map(([kind, minutes, note]) => <TableCell key={kind}><div className="grid gap-3">
                <div className="text-lg font-bold tabular-nums text-navy dark:text-white">{formatDuration(minutes)}</div>
                <Muted className="leading-relaxed">{note} {Math.round(minutes / Math.max(WORK_MINUTES, parts) * 100)} % de las {WORK_MINUTES / 60} h.</Muted>
              </div></TableCell>)}
            </TableRow></TableBody>
          </Table>
          <div className="tracking-storage" role="img" aria-label={`Jornada de ${WORK_MINUTES / 60} h: ${formatDuration(idle.serviceMinutes)} efectivas, ${formatDuration(summary.travelMinutes ?? 0)} de traslado, ${formatDuration(idle.idleMinutes)} no efectivas estimadas`}>
            {([['effective', idle.serviceMinutes], ['total', summary.travelMinutes ?? 0], ['idle', idle.idleMinutes]] as const).map(([kind, minutes]) => minutes > 0 && <span key={kind} className={`bar-${kind}`} style={{ flexGrow: minutes }} />)}
            {parts < WORK_MINUTES && <span className="storage-free" style={{ flexGrow: WORK_MINUTES - parts }} />}
          </div>
          {idle.overtimeMinutes > 0 && <div className="rounded-xl border border-status-danger/30 bg-status-danger/10 p-3 text-sm text-status-danger-ink dark:text-status-danger-ink-dark" role="alert">Excede la jornada efectiva en {formatDuration(idle.overtimeMinutes)}: servicios más traslado estimado superan las {WORK_MINUTES / 60} h. Horas no efectivas estimadas: 0. Revisa si hay esperas largas entre servicios contadas como traslado.</div>}
        </>}
      </div>
    </Card>
  </>;
}
