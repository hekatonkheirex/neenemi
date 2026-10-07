import { useMemo, useState, type ReactNode } from 'react';
import type { ConsumablesFamily, ConsumablesOutputRecord, ConsumablesRecord } from './types';
import type { ServiceRecord } from '../servicios/types';
import { usdToPyg } from './analysis';
import { buildContractCostGroups, buildFamilyAnalysis, buildServiceTrendRows, buildSwapFlags, isServiceConsumable } from './legacy-analysis';
import { LegacyDonutChart, LegacyHorizontalStackedBars, LegacyLineChart, LegacyStackedBarChart } from './LegacyCharts';
import ConsumablesClientRankingChart from './ConsumablesClientRankingChart';
import { addRecordToCostParts, buildClientRows, CONSUMABLES_COST_COLORS, emptyCostParts, formatPygValue, rankClientRows, type CostParts, type RankingClientRow } from './client-ranking';
import { outputOperationalDetail } from './output-display';
import { buildClientHistory, type ClientHistoryEntry } from './client-history';
import { sourceOperationalValues } from '../../core/source-details';
import { cn } from '../../core/cn';
import { Badge } from '../../core/ui/badge';
import { Card, CardHeader, Muted } from '../../core/ui/card';
import { Input } from '../../core/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../core/ui/table';

type SortDirection = 'asc' | 'desc';
type ClassificationFilter = '' | 'original' | 'compatible';
type FamilyFilter = '' | 'T03' | 'T06' | 'GPR53';

const cardClass = 'min-w-0 grid-cols-1 [overflow-wrap:anywhere]';
const fieldClass = 'grid min-w-0 gap-1.5 text-xs font-semibold text-navy dark:text-white';
const selectClass = 'h-10 w-full min-w-0 rounded-xl border border-navy/20 bg-white px-3 text-sm text-navy focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky disabled:opacity-50 dark:border-sky/30 dark:bg-navy/50 dark:text-white';
const summaryGridClass = 'grid min-w-0 grid-cols-2 gap-3 min-[1180px]:grid-cols-3';
const integerFormat = new Intl.NumberFormat('es-PY', { maximumFractionDigits: 0 });
const decimalFormat = new Intl.NumberFormat('es-PY', { maximumFractionDigits: 1 });

const FAMILY_COLORS = {
  ...CONSUMABLES_COST_COLORS,
  other: '#00a3e0',
};

export function ConsumablesFamilyAnalysisPanel({ records, family }: { records: ConsumablesRecord[]; family: ConsumablesFamily }) {
  const analysis = useMemo(() => buildFamilyAnalysis(records, family), [family, records]);
  const tonerQuantity = analysis.originalQuantity + analysis.compatibleQuantity;
  const compatibleShare = tonerQuantity > 0 ? Math.round((analysis.compatibleQuantity / tonerQuantity) * 100) : 0;
  const averageOriginalCostUsd = analysis.originalQuantity > 0 ? analysis.originalCostUsd / analysis.originalQuantity : 0;
  const averageCompatibleCostUsd = analysis.compatibleQuantity > 0 ? analysis.compatibleCostUsd / analysis.compatibleQuantity : 0;
  const savings = averageOriginalCostUsd > 0 && averageCompatibleCostUsd > 0
    ? Math.max(0, Math.round((1 - averageCompatibleCostUsd / averageOriginalCostUsd) * 100))
    : null;
  const monthLabels = analysis.monthly.map((row) => row.month);

  return (
    <div className="@container grid min-w-0 gap-4">
      <section className={summaryGridClass}>
        <SummaryMetric value={integerFormat.format(analysis.records)} label="total de despachos" />
        <SummaryMetric value={integerFormat.format(analysis.originalQuantity)} label="tóner original" />
        <SummaryMetric value={integerFormat.format(analysis.compatibleQuantity)} label="tóner compatible" />
        <SummaryMetric value={integerFormat.format(analysis.otherRecords)} label="otros consumibles" />
        <SummaryMetric value={formatPyg(averageOriginalCostUsd)} label="precio prom. original" />
        <SummaryMetric value={`${compatibleShare}%`} label="proporción compatible" />
      </section>

      {analysis.records === 0 ? <Muted className="text-sm">No hay registros para la familia seleccionada.</Muted> : (
        <>
          <Note label="Lectura de la familia">
            <strong>{familyLabel(family)}:</strong>{' '}
            {analysis.compatibleQuantity > 0
              ? `el ${compatibleShare}% de los tóners son compatibles${savings !== null ? `, con un ahorro estimado del ${savings}% por unidad frente al original` : ''}. `
              : 'no hay tóners compatibles registrados. '}
            Precio promedio original: <strong>{formatPyg(averageOriginalCostUsd)}</strong>{' '}
            {analysis.compatibleQuantity > 0 ? `· compatible: ${formatPyg(averageCompatibleCostUsd)}.` : '.'}
          </Note>

          <div className="grid min-w-0 gap-4 @[44rem]:grid-cols-2">
            <Card className={cardClass}>
              <CardHeader eyebrow="COSTO UNITARIO" title="Precio promedio de tóner" aside={<Badge>PYG por unidad</Badge>} />
              <LegacyStackedBarChart
                labels={['Original', 'Compatible']}
                series={[{ label: 'Precio promedio', color: FAMILY_COLORS.original, values: [averageOriginalCostUsd ? usdToPyg(averageOriginalCostUsd) : 0, averageCompatibleCostUsd ? usdToPyg(averageCompatibleCostUsd) : 0] }]}
                valueFormatter={formatPygValue}
                ariaLabel={`Precio promedio de tóner original y compatible para ${familyLabel(family)}`}
              />
            </Card>
            <Card className={cardClass}>
              <CardHeader eyebrow="VOLUMEN" title="Volumen por tipo" aside={<Badge>unidades registradas</Badge>} />
              <LegacyDonutChart
                segments={[
                  { label: 'Tóner original', color: FAMILY_COLORS.original, value: analysis.originalQuantity },
                  { label: 'Tóner compatible', color: FAMILY_COLORS.compatible, value: analysis.compatibleQuantity },
                  { label: 'Otros consumibles', color: FAMILY_COLORS.other, value: analysis.otherQuantity },
                ]}
                valueFormatter={numberFormat}
                centerLabel="unidades"
                ariaLabel={`Distribución de unidades por tipo para ${familyLabel(family)}`}
              />
            </Card>
          </div>

          <Card className={cardClass}>
            <CardHeader eyebrow="EVOLUCIÓN" title="Tendencia mensual · cantidades" aside={<Badge>líneas por familia</Badge>} />
            <LegacyLineChart
              labels={monthLabels}
              series={[
                { label: 'Tóner original', color: FAMILY_COLORS.original, values: analysis.monthly.map((row) => row.originalQuantity) },
                { label: 'Tóner compatible', color: FAMILY_COLORS.compatible, values: analysis.monthly.map((row) => row.compatibleQuantity) },
                { label: 'Otros consumibles', color: FAMILY_COLORS.other, values: analysis.monthly.map((row) => row.otherQuantity) },
              ]}
              valueFormatter={numberFormat}
              ariaLabel={`Tendencia mensual de cantidades para ${familyLabel(family)}`}
            />
          </Card>

          <Card className={cardClass}>
            <CardHeader eyebrow="EVOLUCIÓN" title="Tendencia mensual · costos" aside={<Badge>importes en guaraníes</Badge>} />
            <LegacyLineChart
              labels={monthLabels}
              series={[
                { label: 'Tóner original', color: FAMILY_COLORS.original, values: analysis.monthly.map((row) => usdToPyg(row.originalCostUsd)) },
                { label: 'Tóner compatible', color: FAMILY_COLORS.compatible, values: analysis.monthly.map((row) => usdToPyg(row.compatibleCostUsd)) },
                { label: 'Otros consumibles', color: FAMILY_COLORS.other, values: analysis.monthly.map((row) => usdToPyg(row.otherCostUsd)) },
              ]}
              valueFormatter={formatPygValue}
              ariaLabel={`Tendencia mensual de costos para ${familyLabel(family)}`}
            />
          </Card>
        </>
      )}
    </div>
  );
}

export function ConsumablesContractsPanel({ records }: { records: ConsumablesRecord[] }) {
  const rows = useMemo(() => buildContractRows(records), [records]);
  const typeGroups = useMemo(() => buildContractCostGroups(records), [records]);
  const totalOriginal = rows.reduce((sum, row) => sum + row.originalCostUsd, 0);
  const totalCompatible = rows.reduce((sum, row) => sum + row.compatibleCostUsd, 0);
  const totalParts = rows.reduce((sum, row) => sum + row.partCostUsd, 0);
  const totalCost = totalOriginal + totalCompatible + totalParts;
  const compatibleContracts = rows.filter((row) => row.compatibleQuantity > 0).length;
  const compatibleContractShare = rows.length > 0 ? Math.round((compatibleContracts / rows.length) * 100) : 0;

  return (
    <div className="@container grid min-w-0 gap-4">
      <section className={summaryGridClass} aria-label="Resumen de contratos">
        <SummaryMetric value={integerFormat.format(rows.length)} label="contratos con consumo" />
        <SummaryMetric value={formatPyg(totalOriginal)} label="costo originales" />
        <SummaryMetric value={formatPyg(totalCompatible)} label="costo compatibles" />
        <SummaryMetric value={formatPyg(totalParts)} label="costo repuestos" />
        <SummaryMetric value={`${compatibleContractShare}%`} label="contratos con compatibles" />
      </section>
      {compatibleContracts > 0 ? <Note label="Lectura de contratos">
        <strong>{integerFormat.format(compatibleContracts)} de {integerFormat.format(rows.length)} contratos</strong> ({compatibleContractShare}%) utilizan consumibles compatibles. El costo compatible representa{' '}
        <strong>{totalOriginal + totalCompatible > 0 ? `${Math.round((totalCompatible / (totalOriginal + totalCompatible)) * 100)}%` : '0%'}</strong> del gasto en consumibles de estos contratos.
      </Note> : null}
      {typeGroups.length > 0 ? <div className="grid min-w-0 gap-4 @[44rem]:grid-cols-2">
        <Card className={cardClass}>
          <CardHeader eyebrow="TIPO DE CONTRATO" title="Costo por tipo" aside={<Badge>PYG · apilado por origen</Badge>} />
          <LegacyStackedBarChart
            labels={typeGroups.map((group) => group.label)}
            series={[
              { label: 'Originales', color: FAMILY_COLORS.original, values: typeGroups.map((group) => usdToPyg(group.originalCostUsd)) },
              { label: 'Compatibles', color: FAMILY_COLORS.compatible, values: typeGroups.map((group) => usdToPyg(group.compatibleCostUsd)) },
              { label: 'Repuestos', color: FAMILY_COLORS.parts, values: typeGroups.map((group) => usdToPyg(group.partCostUsd)) },
            ]}
            valueFormatter={formatPygValue}
            ariaLabel="Costo de consumibles y repuestos por tipo de contrato"
          />
        </Card>
        <Card className={cardClass}>
          <CardHeader eyebrow="DISTRIBUCIÓN" title="Distribución de costos" aside={<Badge>total consolidado</Badge>} />
          <LegacyDonutChart
            segments={[
              { label: 'Originales', color: FAMILY_COLORS.original, value: usdToPyg(totalOriginal) },
              { label: 'Compatibles', color: FAMILY_COLORS.compatible, value: usdToPyg(totalCompatible) },
              { label: 'Repuestos', color: FAMILY_COLORS.parts, value: usdToPyg(totalParts) },
            ]}
            valueFormatter={formatPygValue}
            centerLabel="PYG"
            ariaLabel="Distribución del costo entre originales, compatibles y repuestos"
          />
        </Card>
      </div> : null}
      <Card className={cardClass}>
        <CardHeader eyebrow="IMPACTO EN CONTRATOS" title="Detalle por contrato" aside={<Badge>{integerFormat.format(rows.length)} contratos · total {formatPyg(totalCost)}</Badge>} />
        {rows.length === 0 ? <Muted className="text-sm">No hay registros de consumo para los filtros seleccionados.</Muted> : (
          <Table className="min-w-[48rem] [overflow-wrap:normal]" wrapperClassName="@container max-h-[40rem]">
              <TableHeader><TableRow>
                <TableHead>Contrato / cliente</TableHead><TableHead>Tipo</TableHead><TableHead className="text-right tabular-nums">Equipos</TableHead>
                <TableHead className="text-right tabular-nums">Originales</TableHead><TableHead className="text-right tabular-nums">Compatibles</TableHead>
                <TableHead className="text-right tabular-nums">Repuestos</TableHead><TableHead className="text-right tabular-nums">Total</TableHead>
              </TableRow></TableHeader>
              <TableBody>{rows.map((row) => <TableRow key={row.key}>
                <TableCell><Code>{row.reference}</Code>{formatContractDetails(row.reference, row.orderReference, row.division, row.contractCommercialArea).map((detail) => <Sub key={detail}>{detail}</Sub>)}<Sub>{row.customerName}</Sub><Sub>{formatCustomerClassification(row.customerType, row.commercialArea) || 'Sector y área sin clasificar'}</Sub></TableCell>
                <TableCell>{row.contractType || 'Sin tipo'}</TableCell>
                <TableCell className="text-right tabular-nums">{integerFormat.format(row.equipment)}</TableCell>
                <TableCell className="text-right tabular-nums">{integerFormat.format(row.originalQuantity)}<Sub>{formatPyg(row.originalCostUsd)}</Sub></TableCell>
                <TableCell className="text-right tabular-nums">{integerFormat.format(row.compatibleQuantity)}<Sub>{formatPyg(row.compatibleCostUsd)}</Sub></TableCell>
                <TableCell className="text-right tabular-nums">{integerFormat.format(row.partQuantity)}<Sub>{formatPyg(row.partCostUsd)}</Sub></TableCell>
                <TableCell className="whitespace-nowrap text-right font-semibold tabular-nums">{formatPyg(row.totalCostUsd)}<Sub>{integerFormat.format(row.records)} líneas</Sub></TableCell>
              </TableRow>)}</TableBody>
            </Table>
        )}
      </Card>
    </div>
  );
}

export function ConsumablesFichasPanel({ outputs }: { outputs: ConsumablesOutputRecord[] }) {
  const [search, setSearch] = useState('');
  const [classification, setClassification] = useState<ClassificationFilter>('');
  const [family, setFamily] = useState<FamilyFilter>('');
  const [sortKey, setSortKey] = useState<FichaSortKey>('activity');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [selectedSerial, setSelectedSerial] = useState<string | null>(null);

  const allRows = useMemo(() => buildFichaRows(outputs), [outputs]);
  const familyRows = useMemo(
    () => family ? allRows.filter((row) => row.family === family) : allRows,
    [allRows, family],
  );
  const filteredRows = useMemo(() => {
    const normalized = search.trim().toLocaleLowerCase();
    const rows = familyRows.filter((row) => !normalized || [row.serialNumber, row.modelLabel, row.customerName, row.contractReference, row.orderReference, row.division]
      .join(' ')
      .toLocaleLowerCase()
      .includes(normalized));
    return sortRows(rows, (row) => fichaSortValue(row, sortKey), sortDirection);
  }, [familyRows, search, sortDirection, sortKey]);
  const consumableRows = familyRows.filter((row) => row.consumables > 0);
  const partRows = familyRows.filter((row) => row.parts > 0);
  const bothRows = familyRows.filter((row) => row.consumables > 0 && row.parts > 0);
  const totalConsumableLines = familyRows.reduce((sum, row) => sum + row.consumables, 0);
  const totalPartLines = familyRows.reduce((sum, row) => sum + row.parts, 0);
  const globalRatio = totalPartLines > 0 ? `${decimalFormat.format(totalConsumableLines / totalPartLines)}x` : '—';

  function changeSort(nextKey: FichaSortKey) {
    if (nextKey === sortKey) setSortDirection((value) => value === 'asc' ? 'desc' : 'asc');
    else {
      setSortKey(nextKey);
      setSortDirection(nextKey === 'activity' || nextKey === 'consumables' || nextKey === 'parts' || nextKey === 'ratio' ? 'desc' : 'asc');
    }
  }

  return (
    <div className="@container grid min-w-0 gap-4">
      <section className={summaryGridClass} aria-label="Resumen de fichas">
        <SummaryMetric value={integerFormat.format(consumableRows.length)} label="equipos con consumibles" />
        <SummaryMetric value={integerFormat.format(partRows.length)} label="equipos con repuestos" />
        <SummaryMetric value={integerFormat.format(bothRows.length)} label="con ambas fuentes" />
        <SummaryMetric value={integerFormat.format(totalConsumableLines)} label="líneas de consumibles" />
        <SummaryMetric value={integerFormat.format(totalPartLines)} label="líneas de repuestos" />
        <SummaryMetric value={globalRatio} label="ratio consumibles / rep." />
      </section>
      {bothRows.length > 0 ? <Note label="Cobertura de fichas">
        <strong>{integerFormat.format(bothRows.length)} equipos</strong> ({percentage(bothRows.length, consumableRows.length)}) tienen registros en ambas fuentes, lo que permite correlacionar entregas de insumos con repuestos. Ratio global: <strong>{globalRatio}</strong> consumibles por repuesto.
      </Note> : null}
      <Card className={cardClass}>
        <CardHeader eyebrow="CONSUMIBLES VS REPUESTOS" title="Fichas por equipo" aside={<Badge>Abrí una fila para ver el historial cronológico</Badge>} />
        <div className="grid min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,13rem),1fr))] items-end gap-4">
          <label className={fieldClass}>Buscar equipo<Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Serie, modelo, cliente…" /></label>
          <label className={fieldClass}>Familia<select className={selectClass} value={family} onChange={(event) => setFamily(event.target.value as FamilyFilter)}><option value="">Todas</option><option value="T03">T03</option><option value="T06">T06</option><option value="GPR53">GPR-53</option></select></label>
          <label className={fieldClass}>Tipo dentro del historial<select className={selectClass} value={classification} onChange={(event) => setClassification(event.target.value as ClassificationFilter)}><option value="">Todos</option><option value="original">Originales</option><option value="compatible">Compatibles</option></select></label>
        </div>
        <Muted className="text-sm">{integerFormat.format(filteredRows.length)} equipos visibles · {integerFormat.format(familyRows.reduce((sum, row) => sum + row.totalRecords, 0))} líneas en la selección</Muted>
        {filteredRows.length === 0 ? <Muted className="text-sm">No hay salidas para los filtros seleccionados.</Muted> : (
          <Table className="min-w-[48rem] [overflow-wrap:normal]" wrapperClassName="@container max-h-[40rem]">
              <TableHeader><TableRow>
                <TableHead aria-label="Abrir" />
                <LegacySortableHeader label="N° serie" active={sortKey === 'serial'} direction={sortDirection} onClick={() => changeSort('serial')} />
                <LegacySortableHeader label="Modelo" active={sortKey === 'model'} direction={sortDirection} onClick={() => changeSort('model')} />
                <LegacySortableHeader label="Cliente" active={sortKey === 'customer'} direction={sortDirection} onClick={() => changeSort('customer')} />
                <LegacySortableHeader label="Consumibles" active={sortKey === 'consumables'} direction={sortDirection} onClick={() => changeSort('consumables')} alignRight />
                <LegacySortableHeader label="Repuestos" active={sortKey === 'parts'} direction={sortDirection} onClick={() => changeSort('parts')} alignRight />
                <LegacySortableHeader label="Ratio" active={sortKey === 'ratio'} direction={sortDirection} onClick={() => changeSort('ratio')} alignRight />
              </TableRow></TableHeader>
              <TableBody>{filteredRows.map((row) => {
                const isOpen = selectedSerial === row.serialNumber;
                return <FichaRow key={row.serialNumber} row={row} isOpen={isOpen} classification={classification} onToggle={() => setSelectedSerial(isOpen ? null : row.serialNumber)} />;
              })}</TableBody>
            </Table>
        )}
      </Card>
    </div>
  );
}

export function ConsumablesServicePanel({ serviceRecords, outputs, query }: { serviceRecords: ServiceRecord[]; outputs: ConsumablesOutputRecord[]; query: string }) {
  const [search, setSearch] = useState(query);
  const [family, setFamily] = useState<FamilyFilter>('');
  const [taskType, setTaskType] = useState('');
  const [classification, setClassification] = useState<ClassificationFilter>('');
  const [sortKey, setSortKey] = useState<ServiceSortKey>('activity');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [selectedSerial, setSelectedSerial] = useState<string | null>(null);

  const taskTypes = useMemo(() => [...new Set(serviceRecords.map((record) => record.taskType).filter(Boolean))].sort((left, right) => left.localeCompare(right, 'es')), [serviceRecords]);
  const filteredServices = useMemo(() => serviceRecords.filter((record) => {
    if (family && record.family !== family) return false;
    if (taskType && record.taskType !== taskType) return false;
    const normalized = search.trim().toLocaleLowerCase();
    return !normalized || [record.customerName, record.modelLabel, record.serialNumber, record.orderReference, record.taskType, record.technician, record.taskCompleted, ...sourceOperationalValues(record.sourceOperational), ...record.sourceDetails.flatMap((detail) => [detail.label, detail.value])]
      .join(' ')
      .toLocaleLowerCase()
      .includes(normalized);
  }), [family, search, serviceRecords, taskType]);
  const filteredOutputs = useMemo(() => {
    const normalized = search.trim().toLocaleLowerCase();
    return outputs.filter((record) => {
      if (record.recordKind !== 'consumable' || !isServiceConsumable(record)) return false;
      if (family && record.family !== family) return false;
      if (classification && record.classification !== classification) return false;
      return !normalized || [record.customerName, record.modelLabel, record.serialNumber, record.partCode, record.description, record.technician, record.orderReference, record.division, ...sourceOperationalValues(record.sourceOperational), ...record.sourceDetails.flatMap((detail) => [detail.label, detail.value])]
        .join(' ')
        .toLocaleLowerCase()
        .includes(normalized);
    });
  }, [classification, family, outputs, search]);
  const serialRows = useMemo(() => buildServiceRows(filteredServices, filteredOutputs), [filteredOutputs, filteredServices]);
  const sortedRows = useMemo(() => sortRows(serialRows, (row) => serviceSortValue(row, sortKey), sortDirection), [serialRows, sortDirection, sortKey]);
  const shared = serialRows.filter((row) => row.services > 0 && row.consumables > 0).length;
  const monthly = useMemo(() => buildServiceTrendRows(filteredServices, filteredOutputs), [filteredOutputs, filteredServices]);
  const swapFlags = useMemo(() => buildSwapFlags(filteredServices, filteredOutputs), [filteredOutputs, filteredServices]);
  const topTask = useMemo(() => {
    const counts = new Map<string, number>();
    for (const record of filteredServices) {
      const key = record.taskType || 'Sin especificar';
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return [...counts.entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0], 'es'))[0] ?? null;
  }, [filteredServices]);

  function changeSort(nextKey: ServiceSortKey) {
    if (nextKey === sortKey) setSortDirection((value) => value === 'asc' ? 'desc' : 'asc');
    else {
      setSortKey(nextKey);
      setSortDirection(nextKey === 'serial' || nextKey === 'model' || nextKey === 'customer' ? 'asc' : 'desc');
    }
  }

  return (
    <div className="@container grid min-w-0 gap-4">
      <section className={summaryGridClass} aria-label="Resumen de servicios">
        <SummaryMetric value={integerFormat.format(filteredServices.length)} label="servicios visibles" />
        <SummaryMetric value={integerFormat.format(new Set(filteredServices.map((record) => record.serialNumber)).size)} label="equipos con servicio" />
        <SummaryMetric value={integerFormat.format(shared)} label="equipos con ambas fuentes" />
        <SummaryMetric value={integerFormat.format(filteredOutputs.length)} label="consumibles vinculados" />
        <SummaryMetric value={topTask ? integerFormat.format(topTask[1]) : '—'} label={topTask ? `tarea principal · ${topTask[0]}` : 'tarea principal'} />
        <SummaryMetric value={integerFormat.format(swapFlags.flaggedSerials.size)} label="posibles reemplazos" />
      </section>
      {shared > 0 ? <Note label="Cobertura de servicios">
        <strong>{integerFormat.format(shared)} equipos</strong> tienen servicios y consumibles en la selección. El cruce mensual cuenta servicios solo cuando pertenecen a un equipo con salida de tóner o cilindro en ese mismo mes.
      </Note> : null}
      {swapFlags.flaggedSerials.size > 0 ? <Note warning label="Posibles reemplazos detectados">
        <strong>{integerFormat.format(swapFlags.flaggedSerials.size)} equipos</strong> muestran una señal compatible → original dentro de tres días. Es una alerta de revisión, no una conclusión automática.
      </Note> : null}
      <Card className={cardClass}>
        <CardHeader eyebrow="SERVICIOS VS CONSUMIBLES" title="Relación operativa" aside={<Badge>Origen: Servicios LAM · salidas de consumibles</Badge>} />
        <div className="grid min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,13rem),1fr))] items-end gap-4">
          <label className={fieldClass}>Buscar equipo o servicio<Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Serie, cliente, técnico, tarea…" /></label>
          <label className={fieldClass}>Familia<select className={selectClass} value={family} onChange={(event) => setFamily(event.target.value as FamilyFilter)}><option value="">Todas</option><option value="T03">T03</option><option value="T06">T06</option><option value="GPR53">GPR-53</option></select></label>
          <label className={fieldClass}>Tipo de tarea<select className={selectClass} value={taskType} onChange={(event) => setTaskType(event.target.value)}><option value="">Todas</option>{taskTypes.map((value) => <option value={value} key={value}>{value}</option>)}</select></label>
          <label className={fieldClass}>Consumible<select className={selectClass} value={classification} onChange={(event) => setClassification(event.target.value as ClassificationFilter)}><option value="">Todos</option><option value="original">Originales</option><option value="compatible">Compatibles</option></select></label>
        </div>
        <div className="grid min-w-0 gap-4 @[44rem]:grid-cols-2">
          <section className="min-w-0 rounded-xl border border-navy/10 bg-paper p-4 dark:border-sky/20 dark:bg-navy/30">
            <div className="mb-2 grid gap-0.5"><div className="text-sm font-bold text-navy dark:text-white">Tendencia mensual · servicios vs. consumibles</div><Muted>solo equipos relacionados en el mes</Muted></div>
            <LegacyLineChart
              labels={monthly.map((row) => row.month)}
              series={[
                { label: 'Servicios', color: FAMILY_COLORS.compatible, values: monthly.map((row) => row.services) },
                { label: 'Consumibles · tóner/cilindro', color: FAMILY_COLORS.other, values: monthly.map((row) => row.consumables) },
              ]}
              valueFormatter={numberFormat}
              ariaLabel="Tendencia mensual de servicios y consumibles relacionados"
            />
          </section>
          <section className="min-w-0 rounded-xl border border-navy/10 bg-paper p-4 dark:border-sky/20 dark:bg-navy/30">
            <div className="mb-2 grid gap-0.5"><div className="text-sm font-bold text-navy dark:text-white">Originales vs. compatibles vs. servicios</div><Muted>líneas registradas por mes</Muted></div>
            <LegacyLineChart
              labels={monthly.map((row) => row.month)}
              series={[
                { label: 'Originales', color: FAMILY_COLORS.original, values: monthly.map((row) => row.originals) },
                { label: 'Compatibles', color: FAMILY_COLORS.compatible, values: monthly.map((row) => row.compatibles) },
                { label: 'Servicios relacionados', color: FAMILY_COLORS.parts, values: monthly.map((row) => row.services) },
              ]}
              valueFormatter={numberFormat}
              ariaLabel="Tendencia mensual de originales, compatibles y servicios relacionados"
            />
          </section>
        </div>
        <Muted className="text-sm">{integerFormat.format(sortedRows.length)} equipos visibles · seleccioná una fila para ver servicios y consumibles juntos</Muted>
        {sortedRows.length === 0 ? <Muted className="text-sm">No hay servicios o consumibles que coincidan con los filtros.</Muted> : (
          <Table className="min-w-[48rem] [overflow-wrap:normal]" wrapperClassName="@container max-h-[40rem]">
              <TableHeader><TableRow>
                <TableHead aria-label="Abrir" />
                <LegacySortableHeader label="N° serie" active={sortKey === 'serial'} direction={sortDirection} onClick={() => changeSort('serial')} />
                <LegacySortableHeader label="Modelo" active={sortKey === 'model'} direction={sortDirection} onClick={() => changeSort('model')} />
                <LegacySortableHeader label="Cliente" active={sortKey === 'customer'} direction={sortDirection} onClick={() => changeSort('customer')} />
                <LegacySortableHeader label="Servicios" active={sortKey === 'services'} direction={sortDirection} onClick={() => changeSort('services')} alignRight />
                <LegacySortableHeader label="Consumibles" active={sortKey === 'consumables'} direction={sortDirection} onClick={() => changeSort('consumables')} alignRight />
              </TableRow></TableHeader>
              <TableBody>{sortedRows.map((row) => {
                const isOpen = selectedSerial === row.serialNumber;
                return <ServiceRow key={row.serialNumber} row={row} isOpen={isOpen} classification={classification} swapFlags={swapFlags} onToggle={() => setSelectedSerial(isOpen ? null : row.serialNumber)} />;
              })}</TableBody>
            </Table>
        )}
      </Card>
    </div>
  );
}

export function ConsumablesRankingPanel({ records, query }: { records: ConsumablesRecord[]; query: string }) {
  const [search, setSearch] = useState(query);
  const [sortKey, setSortKey] = useState<RankingSortKey>('cost');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const clientRows = useMemo(() => buildClientRows(records), [records]);
  const equipmentRows = useMemo(() => buildEquipmentRows(records), [records]);
  const filteredClients = useMemo(() => filterRankingRows(clientRows, search), [clientRows, search]);
  const filteredEquipment = useMemo(() => filterRankingRows(equipmentRows, search), [equipmentRows, search]);
  const sortedClients = useMemo(() => sortRows(filteredClients, (row) => rankingSortValue(row, sortKey), sortDirection), [filteredClients, sortDirection, sortKey]);
  const sortedEquipment = useMemo(() => sortRows(filteredEquipment, (row) => rankingSortValue(row, sortKey), sortDirection), [filteredEquipment, sortDirection, sortKey]);
  const rankedClients = useMemo(() => rankClientRows(clientRows), [clientRows]);
  const rankedEquipment = useMemo(() => sortRows(equipmentRows, (row) => row.totalCostUsd, 'desc'), [equipmentRows]);
  const totalCost = records.reduce((sum, record) => sum + record.costUsd, 0);
  const compatibleEquipment = equipmentRows.filter((row) => row.compatibleQuantity > 0).length;
  const topClient = rankedClients[0];
  const topThreeCost = rankedClients.slice(0, 3).reduce((sum, row) => sum + row.totalCostUsd, 0);

  function changeSort(nextKey: RankingSortKey) {
    if (nextKey === sortKey) setSortDirection((value) => value === 'asc' ? 'desc' : 'asc');
    else {
      setSortKey(nextKey);
      setSortDirection(nextKey === 'client' || nextKey === 'model' || nextKey === 'serial' ? 'asc' : 'desc');
    }
  }

  return (
    <div className="@container grid min-w-0 gap-4">
      <section className={summaryGridClass} aria-label="Resumen del ranking">
        <SummaryMetric value={integerFormat.format(clientRows.length)} label="clientes únicos" />
        <SummaryMetric value={integerFormat.format(equipmentRows.length)} label="equipos únicos" />
        <SummaryMetric value={integerFormat.format(compatibleEquipment)} label="equipos con compatibles" />
        <SummaryMetric value={topClient?.clientName || '—'} label="cliente principal" />
        <SummaryMetric value={formatPyg(totalCost)} label="costo acumulado" />
      </section>
      {topClient && totalCost > 0 ? <Note label="Concentración del ranking">
        <strong>{topClient.clientName}</strong> representa {percentage(topClient.totalCostUsd, totalCost)} del costo total ({formatPyg(topClient.totalCostUsd)}).{rankedClients.length >= 3 ? ` Los tres principales acumulan ${percentage(topThreeCost, totalCost)}.` : ''}
      </Note> : null}
      <Card className={cardClass}>
        <CardHeader eyebrow="RANKING" title="Clientes y equipos con mayor costo" aside={<Badge>Los encabezados permiten ordenar ambas tablas</Badge>} />
        <div className="grid min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,13rem),1fr))] items-end gap-4">
          <label className={fieldClass}>Buscar<Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cliente, modelo, serie, OV…" /></label>
        </div>
        <div className="grid min-w-0 gap-4 @[44rem]:grid-cols-2">
          <section className="min-w-0 rounded-xl border border-navy/10 bg-paper p-4 dark:border-sky/20 dark:bg-navy/30">
            <div className="mb-2 grid gap-0.5"><div className="text-sm font-bold text-navy dark:text-white">Top 10 clientes por costo</div><Muted>originales, compatibles y repuestos</Muted></div>
            <ConsumablesClientRankingChart rankedClients={rankedClients} />
          </section>
          <section className="min-w-0 rounded-xl border border-navy/10 bg-paper p-4 dark:border-sky/20 dark:bg-navy/30">
            <div className="mb-2 grid gap-0.5"><div className="text-sm font-bold text-navy dark:text-white">Top 10 equipos por costo</div><Muted>ordenados por total acumulado</Muted></div>
            <LegacyHorizontalStackedBars
              labels={rankedEquipment.slice(0, 10).map((row) => row.serialNumber || row.modelLabel)}
              series={[
                { label: 'Originales', color: FAMILY_COLORS.original, values: rankedEquipment.slice(0, 10).map((row) => usdToPyg(row.originalCostUsd)) },
                { label: 'Compatibles', color: FAMILY_COLORS.compatible, values: rankedEquipment.slice(0, 10).map((row) => usdToPyg(row.compatibleCostUsd)) },
                { label: 'Repuestos', color: FAMILY_COLORS.parts, values: rankedEquipment.slice(0, 10).map((row) => usdToPyg(row.partCostUsd)) },
              ]}
              valueFormatter={formatPygValue}
              ariaLabel="Top 10 equipos por costo de consumibles y repuestos"
            />
          </section>
        </div>
        <h3 className="m-0 mt-2 text-base font-bold text-navy dark:text-white">Ranking de clientes</h3>
        <Table className="min-w-[48rem] [overflow-wrap:normal]" wrapperClassName="@container max-h-[40rem]">
            <TableHeader><TableRow>
              <LegacySortableHeader label="Cliente" active={sortKey === 'client'} direction={sortDirection} onClick={() => changeSort('client')} />
              <LegacySortableHeader label="Equipos" active={sortKey === 'equipment'} direction={sortDirection} onClick={() => changeSort('equipment')} alignRight />
              <LegacySortableHeader label="Originales" active={sortKey === 'original'} direction={sortDirection} onClick={() => changeSort('original')} alignRight />
              <LegacySortableHeader label="Compatibles" active={sortKey === 'compatible'} direction={sortDirection} onClick={() => changeSort('compatible')} alignRight />
              <LegacySortableHeader label="Repuestos" active={sortKey === 'parts'} direction={sortDirection} onClick={() => changeSort('parts')} alignRight />
              <LegacySortableHeader label="Total" active={sortKey === 'cost'} direction={sortDirection} onClick={() => changeSort('cost')} alignRight />
            </TableRow></TableHeader>
            <TableBody>{sortedClients.map((row) => <TableRow key={row.key}>
              <TableCell><Code>{row.clientName}</Code><Sub>{formatCustomerClassification(row.customerType, row.commercialArea) || 'Sector y área sin clasificar'}</Sub></TableCell>
              <TableCell className="text-right tabular-nums">{integerFormat.format(row.equipment)}</TableCell>
              <TableCell className="text-right tabular-nums">{integerFormat.format(row.originalQuantity)}<Sub>{formatPyg(row.originalCostUsd)}</Sub></TableCell>
              <TableCell className="text-right tabular-nums">{integerFormat.format(row.compatibleQuantity)}<Sub>{formatPyg(row.compatibleCostUsd)}</Sub></TableCell>
              <TableCell className="text-right tabular-nums">{integerFormat.format(row.partQuantity)}<Sub>{formatPyg(row.partCostUsd)}</Sub></TableCell>
              <TableCell className="whitespace-nowrap text-right font-semibold tabular-nums">{formatPyg(row.totalCostUsd)}</TableCell>
            </TableRow>)}</TableBody>
          </Table>
        <h3 className="m-0 mt-2 text-base font-bold text-navy dark:text-white">Ranking de equipos</h3>
        <Table className="min-w-[48rem] [overflow-wrap:normal]" wrapperClassName="@container max-h-[40rem]">
            <TableHeader><TableRow>
              <LegacySortableHeader label="Equipo" active={sortKey === 'model'} direction={sortDirection} onClick={() => changeSort('model')} />
              <LegacySortableHeader label="Serie" active={sortKey === 'serial'} direction={sortDirection} onClick={() => changeSort('serial')} />
              <TableHead>Cliente / contrato</TableHead><TableHead>Familia</TableHead>
              <LegacySortableHeader label="Originales" active={sortKey === 'original'} direction={sortDirection} onClick={() => changeSort('original')} alignRight />
              <LegacySortableHeader label="Compatibles" active={sortKey === 'compatible'} direction={sortDirection} onClick={() => changeSort('compatible')} alignRight />
              <LegacySortableHeader label="Repuestos" active={sortKey === 'parts'} direction={sortDirection} onClick={() => changeSort('parts')} alignRight />
              <LegacySortableHeader label="Total" active={sortKey === 'cost'} direction={sortDirection} onClick={() => changeSort('cost')} alignRight />
            </TableRow></TableHeader>
            <TableBody>{sortedEquipment.map((row) => <TableRow key={row.key}>
              <TableCell><Code>{row.modelLabel}</Code></TableCell>
              <TableCell><Code>{row.serialNumber}</Code></TableCell>
              <TableCell><Sub>{row.clientName}</Sub>{formatContractDetails(row.contractReference, row.orderReference, row.division, row.contractCommercialArea).map((detail) => <Sub key={detail}>{detail}</Sub>)}<Sub>{formatCustomerClassification(row.customerType, row.commercialArea) || 'Sector y área sin clasificar'}</Sub></TableCell>
              <TableCell>{row.family}</TableCell>
              <TableCell className="text-right tabular-nums">{integerFormat.format(row.originalQuantity)}<Sub>{formatPyg(row.originalCostUsd)}</Sub></TableCell>
              <TableCell className="text-right tabular-nums">{integerFormat.format(row.compatibleQuantity)}<Sub>{formatPyg(row.compatibleCostUsd)}</Sub></TableCell>
              <TableCell className="text-right tabular-nums">{integerFormat.format(row.partQuantity)}<Sub>{formatPyg(row.partCostUsd)}</Sub></TableCell>
              <TableCell className="whitespace-nowrap text-right font-semibold tabular-nums">{formatPyg(row.totalCostUsd)}</TableCell>
            </TableRow>)}</TableBody>
          </Table>
        {sortedClients.length === 0 && sortedEquipment.length === 0 ? <Muted className="text-sm">No hay resultados para la búsqueda.</Muted> : null}
      </Card>
    </div>
  );
}

export function ConsumablesEquipmentPanel({ records, query }: { records: ConsumablesRecord[]; query: string }) {
  const [search, setSearch] = useState(query);
  const [sortKey, setSortKey] = useState<RankingSortKey>('cost');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const allRows = useMemo(() => buildEquipmentRows(records), [records]);
  const rows = useMemo(() => filterRankingRows(allRows, search), [allRows, search]);
  const sortedRows = useMemo(() => sortRows(rows, (row) => rankingSortValue(row, sortKey), sortDirection), [rows, sortDirection, sortKey]);
  const totalOriginal = allRows.reduce((sum, row) => sum + row.originalCostUsd, 0);
  const totalCompatible = allRows.reduce((sum, row) => sum + row.compatibleCostUsd, 0);
  const totalParts = allRows.reduce((sum, row) => sum + row.partCostUsd, 0);
  const compatibleEquipment = allRows.filter((row) => row.compatibleQuantity > 0).length;

  function changeSort(nextKey: RankingSortKey) {
    if (nextKey === sortKey) setSortDirection((value) => value === 'asc' ? 'desc' : 'asc');
    else {
      setSortKey(nextKey);
      setSortDirection(nextKey === 'model' || nextKey === 'serial' || nextKey === 'client' ? 'asc' : 'desc');
    }
  }

  return (
    <div className="@container grid min-w-0 gap-4">
      <section className={summaryGridClass} aria-label="Resumen de equipos">
        <SummaryMetric value={integerFormat.format(allRows.length)} label="total de equipos" />
        <SummaryMetric value={formatPyg(totalOriginal)} label="costo originales" />
        <SummaryMetric value={formatPyg(totalCompatible)} label="costo compatibles" />
        <SummaryMetric value={formatPyg(totalParts)} label="costo repuestos" />
        <SummaryMetric value={integerFormat.format(compatibleEquipment)} label="equipos con compatibles" />
      </section>
      <Card className={cardClass}>
        <CardHeader eyebrow="EQUIPOS" title="Equipos con consumo" aside={<Badge>{integerFormat.format(sortedRows.length)} equipos visibles</Badge>} />
        <div className="grid min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,13rem),1fr))] items-end gap-4">
          <label className={fieldClass}>Buscar equipo<Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Serie, modelo o cliente…" /></label>
        </div>
        <Table className="min-w-[48rem] [overflow-wrap:normal]" wrapperClassName="@container max-h-[40rem]">
            <TableHeader><TableRow>
              <LegacySortableHeader label="N° serie" active={sortKey === 'serial'} direction={sortDirection} onClick={() => changeSort('serial')} />
              <LegacySortableHeader label="Modelo" active={sortKey === 'model'} direction={sortDirection} onClick={() => changeSort('model')} />
              <LegacySortableHeader label="Cliente" active={sortKey === 'client'} direction={sortDirection} onClick={() => changeSort('client')} />
              <TableHead>OV / contrato</TableHead><TableHead>Familia</TableHead>
              <LegacySortableHeader label="Originales" active={sortKey === 'original'} direction={sortDirection} onClick={() => changeSort('original')} alignRight />
              <LegacySortableHeader label="Compatibles" active={sortKey === 'compatible'} direction={sortDirection} onClick={() => changeSort('compatible')} alignRight />
              <LegacySortableHeader label="Repuestos" active={sortKey === 'parts'} direction={sortDirection} onClick={() => changeSort('parts')} alignRight />
              <LegacySortableHeader label="Total" active={sortKey === 'cost'} direction={sortDirection} onClick={() => changeSort('cost')} alignRight />
            </TableRow></TableHeader>
            <TableBody>{sortedRows.map((row) => <TableRow key={row.key}>
              <TableCell><Code>{row.serialNumber}</Code></TableCell>
              <TableCell>{row.modelLabel}</TableCell>
              <TableCell>{row.clientName}</TableCell>
              <TableCell><span>{formatContractLabel(row.contractReference, row.orderReference) || '—'}</span>{row.contractCommercialArea ? <Sub>Área contrato: {row.contractCommercialArea}</Sub> : null}{row.division ? <Sub>División: {row.division}</Sub> : null}</TableCell>
              <TableCell>{row.family}</TableCell>
              <TableCell className="text-right tabular-nums">{integerFormat.format(row.originalQuantity)}<Sub>{formatPyg(row.originalCostUsd)}</Sub></TableCell>
              <TableCell className="text-right tabular-nums">{integerFormat.format(row.compatibleQuantity)}<Sub>{formatPyg(row.compatibleCostUsd)}</Sub></TableCell>
              <TableCell className="text-right tabular-nums">{integerFormat.format(row.partQuantity)}<Sub>{formatPyg(row.partCostUsd)}</Sub></TableCell>
              <TableCell className="whitespace-nowrap text-right font-semibold tabular-nums">{formatPyg(row.totalCostUsd)}</TableCell>
            </TableRow>)}</TableBody>
          </Table>
      </Card>
    </div>
  );
}

function FichaRow({ row, isOpen, classification, onToggle }: { row: FichaRowData; isOpen: boolean; classification: ClassificationFilter; onToggle: () => void }) {
  return <>
    <TableRow className={cn('cursor-pointer', isOpen && 'bg-sky/10')} onClick={onToggle}>
      <TableCell className="w-8 text-center text-lg" aria-label={isOpen ? 'Cerrar detalle' : 'Abrir detalle'}>{isOpen ? '⌄' : '›'}</TableCell>
      <TableCell className="whitespace-nowrap"><Code>{row.serialNumber}</Code></TableCell>
      <TableCell>{row.modelLabel}</TableCell>
      <TableCell className="min-w-[12rem]"><div>{row.customerName || 'Sin cliente'}</div>{formatContractLabel(row.contractReference, row.orderReference) ? <Sub>{formatContractLabel(row.contractReference, row.orderReference)}</Sub> : null}{formatContractDetails(row.contractReference, row.orderReference, row.division, row.contractCommercialArea).map((detail) => <Sub key={detail}>{detail}</Sub>)}</TableCell>
      <TableCell className="text-right tabular-nums">{integerFormat.format(row.consumables)}</TableCell>
      <TableCell className="text-right tabular-nums">{integerFormat.format(row.parts)}</TableCell>
      <TableCell className="text-right tabular-nums">{row.parts > 0 ? `${decimalFormat.format(row.consumables / row.parts)}x` : '—'}</TableCell>
    </TableRow>
    {isOpen ? <DetailRow colSpan={7}><OutputTimeline serialNumber={row.serialNumber} outputs={row.outputs} classification={classification} /></DetailRow> : null}
  </>;
}

function ServiceRow({ row, isOpen, classification, swapFlags, onToggle }: { row: ServiceRowData; isOpen: boolean; classification: ClassificationFilter; swapFlags: ReturnType<typeof buildSwapFlags>; onToggle: () => void }) {
  return <>
    <TableRow className={cn('cursor-pointer', isOpen && 'bg-sky/10')} onClick={onToggle}>
      <TableCell className="w-8 text-center text-lg" aria-label={isOpen ? 'Cerrar detalle' : 'Abrir detalle'}>{isOpen ? '⌄' : '›'}</TableCell>
      <TableCell className="whitespace-nowrap"><span className="inline-flex items-center gap-2"><Code>{row.serialNumber}</Code>{swapFlags.flaggedSerials.has(row.serialNumber) ? <SwapFlag /> : null}</span></TableCell>
      <TableCell>{row.modelLabel}</TableCell>
      <TableCell className="min-w-[12rem]"><div>{row.customerName || 'Sin cliente'}</div>{row.clientHistory.length > 0 ? <Sub>Historial de cliente</Sub> : null}</TableCell>
      <TableCell className="text-right tabular-nums">{integerFormat.format(row.services)}</TableCell>
      <TableCell className="text-right tabular-nums">{integerFormat.format(row.consumables)}</TableCell>
    </TableRow>
    {isOpen ? <DetailRow colSpan={6}><ServiceTimeline serialNumber={row.serialNumber} currentCustomerName={row.customerName} clientHistory={row.clientHistory} services={row.serviceRecords} outputs={row.outputs} classification={classification} swapFlags={swapFlags} /></DetailRow> : null}
  </>;
}

/** Fila de detalle: ocupa el ancho visible de la tarjeta aunque la tabla desplace en horizontal (la tabla es un contenedor). */
function DetailRow({ colSpan, children }: { colSpan: number; children: ReactNode }) {
  return <TableRow className="bg-paper hover:bg-paper dark:bg-navy/30"><TableCell colSpan={colSpan} className="p-0"><div className="sticky left-0 box-border w-[100cqw] max-w-full p-4 [overflow-wrap:anywhere]">{children}</div></TableCell></TableRow>;
}

function SwapFlag() {
  return <span className="inline-grid size-5 place-items-center rounded-full bg-[#e08a00] text-xs font-extrabold text-navy" title="Posible reemplazo: compatible seguido de original en tres días" aria-label="Posible reemplazo detectado">!</span>;
}

function TimelineEvent({ children }: { children: ReactNode }) {
  return <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 border-t border-navy/10 pt-2 text-sm text-ink-2 first:border-0 first:pt-0 dark:border-sky/15 dark:text-[#d6e2f5]">{children}</div>;
}

function OutputTimeline({ serialNumber, outputs, classification }: { serialNumber: string; outputs: ConsumablesOutputRecord[]; classification: ClassificationFilter }) {
  const events = outputs
    .filter((record) => record.recordKind === 'consumable' || record.recordKind === 'part')
    .filter((record) => !classification || record.recordKind !== 'consumable' || record.classification === classification)
    .sort((left, right) => left.recordedAt.localeCompare(right.recordedAt) || left.id.localeCompare(right.id));
  return <div className="grid min-w-0 gap-3">
    <div className="flex flex-wrap items-baseline justify-between gap-2"><div className="font-bold text-navy dark:text-white">Historial del equipo</div><Muted>{serialNumber} · {integerFormat.format(events.length)} líneas</Muted></div>
    {events.length === 0 ? <Muted className="text-sm">No hay eventos para el tipo seleccionado.</Muted> : <div className="grid max-h-96 gap-2 overflow-y-auto pr-1">{events.map((record) => <TimelineEvent key={record.id}>
      <Badge className="whitespace-nowrap" tone={record.recordKind === 'consumable' ? 'success' : 'warning'}>{record.recordKind === 'consumable' ? record.category : 'Repuesto'}</Badge>
      <b className="text-navy dark:text-white">{record.recordedAt || record.month || 'Sin fecha'}</b>
      <Code>{record.partCode || 'Sin código'}</Code>
      <span className="min-w-0 flex-1 basis-48">{record.description || 'Sin descripción'}</span>
      <span>×{numberFormat(record.quantity)}</span>
      {record.yieldPages > 0 ? <span>{numberFormat(record.yieldPages)} pág.</span> : null}
      <Muted>{formatOutputTimelineMeta(record)}</Muted>
    </TimelineEvent>)}</div>}
  </div>;
}

function ServiceTimeline({ serialNumber, currentCustomerName, clientHistory, services, outputs, classification, swapFlags }: { serialNumber: string; currentCustomerName: string; clientHistory: ClientHistoryEntry[]; services: ServiceRecord[]; outputs: ConsumablesOutputRecord[]; classification: ClassificationFilter; swapFlags: ReturnType<typeof buildSwapFlags> }) {
  const events = [
    ...services.map((record) => ({ date: record.recordedAt || record.month, kind: 'service' as const, record })),
    ...outputs
      .filter((record) => !classification || record.classification === classification)
      .map((record) => ({ date: record.recordedAt || record.month, kind: 'output' as const, record })),
  ].sort((left, right) => left.date.localeCompare(right.date));
  return <div className="grid min-w-0 gap-3">
    <div className="flex flex-wrap items-baseline justify-between gap-2"><div className="font-bold text-navy dark:text-white">Historial de servicios y consumibles</div><Muted>{serialNumber} · {integerFormat.format(events.length)} eventos</Muted></div>
    {clientHistory.length > 0 ? <ClientHistoryAlert currentCustomerName={currentCustomerName} entries={clientHistory} /> : null}
    {events.length === 0 ? <Muted className="text-sm">No hay eventos para el tipo seleccionado.</Muted> : <div className="grid max-h-96 gap-2 overflow-y-auto pr-1">{events.map((event, index) => event.kind === 'service' ? <TimelineEvent key={`${event.kind}-${event.record.id}-${index}`}>
      {swapFlags.flaggedServiceIds.has(event.record.id) ? <SwapFlag /> : null}<Badge tone="success">Servicio</Badge><b className="text-navy dark:text-white">{event.date || 'Sin fecha'}</b><Code>IS {event.record.serviceNumber || 'sin número'}</Code><span className="min-w-0 flex-1 basis-48">{event.record.taskCompleted || 'Sin descripción de tarea'}</span><Muted>{event.record.taskType || 'Sin tipo'}{event.record.technician ? ` · ${event.record.technician}` : ''}{event.record.orderReference ? ` · OV ${event.record.orderReference}` : ''}</Muted>
    </TimelineEvent> : <TimelineEvent key={`${event.kind}-${event.record.id}-${index}`}>
      {swapFlags.flaggedOutputIds.has(event.record.id) ? <SwapFlag /> : null}<Badge className="whitespace-nowrap" tone={event.record.classification === 'original' ? 'success' : 'warning'}>{event.record.category}</Badge><b className="text-navy dark:text-white">{event.date || 'Sin fecha'}</b><Code>{event.record.partCode || 'Sin código'}</Code><span className="min-w-0 flex-1 basis-48">{event.record.description || 'Sin descripción'}</span><span>×{numberFormat(event.record.quantity)}</span><Muted>{formatOutputTimelineMeta(event.record)}</Muted>
    </TimelineEvent>)}</div>}
  </div>;
}

function ClientHistoryAlert({ currentCustomerName, entries }: { currentCustomerName: string; entries: ClientHistoryEntry[] }) {
  return <Note warning label="Historial de clientes anteriores">
    <div className="grid gap-1">
      <strong>Historial de cliente</strong>
      <span>Este equipo actualmente figura en <strong>{currentCustomerName || 'la cartera actual'}</strong>, pero también tiene registros de clientes anteriores.</span>
      {entries.map((entry) => <Muted key={`${entry.customerName}-${entry.from}-${entry.to}`}>
        <strong>{entry.customerName}</strong> · registros entre {entry.from} y {entry.to}
        {entry.orderReferences.length > 0 ? ` · OV: ${entry.orderReferences.join(', ')}` : ''}
      </Muted>)}
    </div>
  </Note>;
}

function SummaryMetric({ value, label }: { value: string; label: string }) {
  // El nombre de un cliente o una cifra larga se ajustan al ancho de la ficha; el título completo queda en el tooltip.
  return <Card className="@container min-w-0 gap-1 p-4"><div className="truncate whitespace-nowrap text-[clamp(1.1rem,10cqw,1.875rem)] font-bold tabular-nums text-navy dark:text-white" title={value}>{value}</div><Muted>{label}</Muted></Card>;
}

/** Lectura destacada de una vista (en amarillo cuando es una alerta de revisión). */
function Note({ children, label, warning = false }: { children: ReactNode; label: string; warning?: boolean }) {
  return <section className={cn('rounded-xl border p-4 text-sm leading-relaxed text-ink-2 dark:text-[#d6e2f5]', warning ? 'border-[#e08a00]/40 bg-[#e08a00]/10' : 'border-sky/40 bg-sky/10')} aria-label={label}>{children}</section>;
}

function Sub({ children, className }: { children: ReactNode; className?: string }) {
  return <Muted className={cn('mt-0.5', className)}>{children}</Muted>;
}

function Code({ children }: { children: ReactNode }) {
  return <span className="font-mono text-xs font-semibold text-navy dark:text-white">{children}</span>;
}

function LegacySortableHeader({ label, active, direction, onClick, alignRight = false }: { label: string; active: boolean; direction: SortDirection; onClick: () => void; alignRight?: boolean }) {
  return <TableHead className={alignRight ? 'text-right' : undefined} aria-sort={active ? direction === 'asc' ? 'ascending' : 'descending' : 'none'}><button className="inline-flex cursor-pointer items-center gap-1 border-0 bg-transparent p-0 text-xs font-bold text-navy focus-visible:outline-2 focus-visible:outline-sky dark:text-white" type="button" onClick={onClick}>{label}<span aria-hidden="true">{active ? direction === 'asc' ? ' ↑' : ' ↓' : ''}</span></button></TableHead>;
}

type FichaSortKey = 'activity' | 'serial' | 'model' | 'customer' | 'consumables' | 'parts' | 'ratio';
type FichaRowData = { serialNumber: string; modelLabel: string; customerName: string; family: string; contractReference: string; orderReference: string; contractCommercialArea: string; division: string; consumables: number; parts: number; totalRecords: number; outputs: ConsumablesOutputRecord[] };
type ServiceSortKey = 'activity' | 'serial' | 'model' | 'customer' | 'services' | 'consumables';
type ServiceRowData = { serialNumber: string; modelLabel: string; customerName: string; family: string; services: number; consumables: number; clientHistory: ClientHistoryEntry[]; serviceRecords: ServiceRecord[]; outputs: ConsumablesOutputRecord[] };

function buildFichaRows(outputs: ConsumablesOutputRecord[]): FichaRowData[] {
  const bySerial = new Map<string, FichaRowData>();
  for (const record of outputs) {
    if (!record.serialNumber) continue;
    const current = bySerial.get(record.serialNumber) ?? {
      serialNumber: record.serialNumber,
      modelLabel: record.modelLabel,
      customerName: record.customerName || record.sourceCustomerName,
      family: record.family,
      contractReference: record.contractReference,
      orderReference: record.orderReference,
      contractCommercialArea: record.contractCommercialArea,
      division: record.division,
      consumables: 0,
      parts: 0,
      totalRecords: 0,
      outputs: [],
    };
    current.totalRecords += 1;
    if (record.recordKind === 'consumable') current.consumables += 1;
    else current.parts += 1;
    if (!current.modelLabel && record.modelLabel) current.modelLabel = record.modelLabel;
    if (!current.customerName && (record.customerName || record.sourceCustomerName)) current.customerName = record.customerName || record.sourceCustomerName;
    if (!current.orderReference && record.orderReference) current.orderReference = record.orderReference;
    if (!current.contractCommercialArea && record.contractCommercialArea) current.contractCommercialArea = record.contractCommercialArea;
    if (!current.division && record.division) current.division = record.division;
    current.outputs.push(record);
    bySerial.set(record.serialNumber, current);
  }
  return [...bySerial.values()].sort((left, right) => right.totalRecords - left.totalRecords || left.serialNumber.localeCompare(right.serialNumber, 'es', { numeric: true }));
}

function buildServiceRows(services: ServiceRecord[], outputs: ConsumablesOutputRecord[]): ServiceRowData[] {
  const bySerial = new Map<string, ServiceRowData>();
  for (const record of services) {
    if (!record.serialNumber) continue;
    const current = bySerial.get(record.serialNumber) ?? {
      serialNumber: record.serialNumber,
      modelLabel: record.modelLabel,
      customerName: record.customerName || record.sourceCustomerName,
      family: record.family,
      services: 0,
      consumables: 0,
      clientHistory: [],
      serviceRecords: [],
      outputs: [],
    };
    current.services += 1;
    current.serviceRecords.push(record);
    if (!current.modelLabel && record.modelLabel) current.modelLabel = record.modelLabel;
    if (!current.customerName && (record.customerName || record.sourceCustomerName)) current.customerName = record.customerName || record.sourceCustomerName;
    bySerial.set(record.serialNumber, current);
  }
  for (const record of outputs) {
    if (!record.serialNumber) continue;
    const current = bySerial.get(record.serialNumber) ?? {
      serialNumber: record.serialNumber,
      modelLabel: record.modelLabel,
      customerName: record.customerName || record.sourceCustomerName,
      family: record.family,
      services: 0,
      consumables: 0,
      clientHistory: [],
      serviceRecords: [],
      outputs: [],
    };
    current.consumables += 1;
    current.outputs.push(record);
    if (!current.modelLabel && record.modelLabel) current.modelLabel = record.modelLabel;
    if (!current.customerName && (record.customerName || record.sourceCustomerName)) current.customerName = record.customerName || record.sourceCustomerName;
    bySerial.set(record.serialNumber, current);
  }
  for (const row of bySerial.values()) {
    row.clientHistory = buildClientHistory(row.customerName, [...row.serviceRecords, ...row.outputs].map((record) => ({
      customerName: record.customerName,
      sourceCustomerName: record.sourceCustomerName,
      date: record.recordedAt || record.month,
      orderReference: record.orderReference,
    })));
  }
  return [...bySerial.values()];
}

type RankingEquipmentRow = CostParts & { key: string; modelLabel: string; serialNumber: string; clientName: string; customerType: string; commercialArea: string; contractReference: string; orderReference: string; contractCommercialArea: string; division: string; family: string };
type RankingSortKey = 'client' | 'model' | 'serial' | 'original' | 'compatible' | 'parts' | 'equipment' | 'cost';


function buildEquipmentRows(records: ConsumablesRecord[]): RankingEquipmentRow[] {
  const byEquipment = new Map<string, RankingEquipmentRow>();
  for (const record of records) {
    const key = record.equipmentId || record.serialNumber;
    if (!key) continue;
    const current = byEquipment.get(key) ?? { key, modelLabel: record.modelLabel, serialNumber: record.serialNumber, clientName: record.customerName, customerType: record.customerType, commercialArea: record.commercialArea, contractReference: record.contractReference, orderReference: record.orderReference, contractCommercialArea: record.contractCommercialArea, division: record.division, family: record.family, ...emptyCostParts() };
    addRecordToCostParts(current, record);
    current.equipment = 1;
    if (!current.modelLabel && record.modelLabel) current.modelLabel = record.modelLabel;
    if (!current.clientName && record.customerName) current.clientName = record.customerName;
    if (!current.customerType && record.customerType) current.customerType = record.customerType;
    if (!current.commercialArea && record.commercialArea) current.commercialArea = record.commercialArea;
    if (!current.contractReference && record.contractReference) current.contractReference = record.contractReference;
    if (!current.orderReference && record.orderReference) current.orderReference = record.orderReference;
    if (!current.contractCommercialArea && record.contractCommercialArea) current.contractCommercialArea = record.contractCommercialArea;
    if (!current.division && record.division) current.division = record.division;
    byEquipment.set(key, current);
  }
  return [...byEquipment.values()];
}

function filterRankingRows<T extends { clientName: string; modelLabel?: string; serialNumber?: string; contractReference?: string; orderReference?: string; division?: string }>(rows: T[], query: string): T[] {
  const normalized = query.trim().toLocaleLowerCase();
  if (!normalized) return rows;
  return rows.filter((row) => [row.clientName, row.modelLabel ?? '', row.serialNumber ?? '', row.contractReference ?? '', row.orderReference ?? '', row.division ?? ''].join(' ').toLocaleLowerCase().includes(normalized));
}

function rankingSortValue(row: RankingClientRow | RankingEquipmentRow, key: RankingSortKey): string | number {
  switch (key) {
    case 'client': return row.clientName;
    case 'model': return 'modelLabel' in row ? row.modelLabel : row.clientName;
    case 'serial': return 'serialNumber' in row ? row.serialNumber : row.clientName;
    case 'original': return row.originalCostUsd;
    case 'compatible': return row.compatibleCostUsd;
    case 'parts': return row.partCostUsd;
    case 'equipment': return row.equipment;
    default: return row.totalCostUsd;
  }
}

type ContractRowData = CostParts & { key: string; reference: string; orderReference: string; contractCommercialArea: string; division: string; customerName: string; customerType: string; commercialArea: string; contractType: string; equipmentIds: Set<string> };

function buildContractRows(records: ConsumablesRecord[]): ContractRowData[] {
  const byContract = new Map<string, ContractRowData>();
  for (const record of records) {
    const key = record.contractReference || record.equipmentId || record.customerName || 'Sin contrato';
    const current = byContract.get(key) ?? { key, reference: record.contractReference || 'Sin referencia', orderReference: record.orderReference, contractCommercialArea: record.contractCommercialArea, division: record.division, customerName: record.customerName || 'Sin cliente', customerType: record.customerType, commercialArea: record.commercialArea, contractType: record.contractType, equipmentIds: new Set<string>(), ...emptyCostParts() };
    addRecordToCostParts(current, record);
    current.equipmentIds.add(record.equipmentId || record.serialNumber);
    current.equipment = current.equipmentIds.size;
    if (!current.customerType && record.customerType) current.customerType = record.customerType;
    if (!current.commercialArea && record.commercialArea) current.commercialArea = record.commercialArea;
    if (!current.orderReference && record.orderReference) current.orderReference = record.orderReference;
    if (!current.contractCommercialArea && record.contractCommercialArea) current.contractCommercialArea = record.contractCommercialArea;
    if (!current.division && record.division) current.division = record.division;
    byContract.set(key, current);
  }
  return [...byContract.values()].sort((left, right) => right.totalCostUsd - left.totalCostUsd || left.reference.localeCompare(right.reference, 'es', { numeric: true }));
}

function fichaSortValue(row: FichaRowData, key: FichaSortKey): string | number {
  switch (key) {
    case 'serial': return row.serialNumber;
    case 'model': return row.modelLabel;
    case 'customer': return row.customerName;
    case 'consumables': return row.consumables;
    case 'parts': return row.parts;
    case 'ratio': return row.parts > 0 ? row.consumables / row.parts : -1;
    default: return row.totalRecords;
  }
}

function serviceSortValue(row: ServiceRowData, key: ServiceSortKey): string | number {
  switch (key) {
    case 'serial': return row.serialNumber;
    case 'model': return row.modelLabel;
    case 'customer': return row.customerName;
    case 'services': return row.services;
    case 'consumables': return row.consumables;
    default: return row.services + row.consumables;
  }
}

function sortRows<T>(rows: readonly T[], getValue: (row: T) => string | number, direction: SortDirection): T[] {
  return [...rows].sort((left, right) => {
    const leftValue = getValue(left);
    const rightValue = getValue(right);
    const comparison = typeof leftValue === 'number' && typeof rightValue === 'number'
      ? leftValue - rightValue
      : String(leftValue).localeCompare(String(rightValue), 'es', { numeric: true, sensitivity: 'base' });
    return direction === 'asc' ? comparison : -comparison;
  });
}

function numberFormat(value: number): string {
  return integerFormat.format(value);
}

function formatCustomerClassification(customerType?: string, commercialArea?: string): string {
  const type = customerType === 'Publico' ? 'Público' : customerType;
  return [type ? `Sector: ${type}` : '', commercialArea ? `Área: ${commercialArea}` : ''].filter(Boolean).join(' · ');
}

function formatContractLabel(contractReference: string, orderReference: string): string {
  if (orderReference) return `OV ${orderReference}`;
  return contractReference ? `Contrato ${contractReference}` : '';
}

function formatContractDetails(contractReference: string, orderReference: string, division: string, commercialArea = ''): string[] {
  return [
    contractReference && orderReference && contractReference !== orderReference ? `Contrato: ${contractReference}` : '',
    commercialArea ? `Área contrato: ${commercialArea}` : '',
    division ? `División: ${division}` : '',
  ].filter(Boolean);
}

function formatOutputTimelineMeta(record: ConsumablesOutputRecord): string {
  return [
    record.recordKind === 'consumable' ? `Rem. ${record.documentNumber}` : `Comp. ${record.documentNumber}`,
    outputOperationalDetail(record, 'yieldPerUnit', ['Rendimiento']) ? `Rend. unit. ${outputOperationalDetail(record, 'yieldPerUnit', ['Rendimiento'])}` : '',
    record.recordKind === 'part' && record.technician ? record.technician : '',
    record.recordKind === 'part' && record.serviceReportNumber > 0 ? `Inf. ${record.serviceReportNumber}` : '',
    record.recordKind === 'part' ? outputOperationalDetail(record, 'sourceContract', ['Contrato (fuente)', 'Contrato']) : '',
    formatContractLabel(record.contractReference, record.orderReference),
    record.contractCommercialArea ? `Área contrato: ${record.contractCommercialArea}` : '',
    record.division ? `División: ${record.division}` : '',
    outputOperationalDetail(record, 'observations', ['Observaciones']) ? `Obs.: ${outputOperationalDetail(record, 'observations', ['Observaciones'])}` : '',
    outputOperationalDetail(record, 'contact', ['Contacto']) ? `Contacto: ${outputOperationalDetail(record, 'contact', ['Contacto'])}` : '',
  ].filter(Boolean).join(' · ');
}

function formatPyg(valueUsd: number): string {
  return `₲ ${integerFormat.format(usdToPyg(valueUsd))}`;
}


function percentage(value: number, total: number): string {
  return `${total > 0 ? Math.round((value / total) * 100) : 0}%`;
}

function familyLabel(family: ConsumablesFamily): string {
  return family === 'GPR53' ? 'GPR-53' : family;
}
