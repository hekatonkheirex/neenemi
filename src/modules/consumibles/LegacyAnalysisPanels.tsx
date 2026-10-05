import { useMemo, useState } from 'react';
import type { ConsumablesFamily, ConsumablesOutputRecord, ConsumablesRecord } from './types';
import type { ServiceRecord } from '../servicios/types';
import { usdToPyg } from './analysis';
import { buildContractCostGroups, buildFamilyAnalysis, buildServiceTrendRows, buildSwapFlags, isServiceConsumable } from './legacy-analysis';
import { LegacyDonutChart, LegacyHorizontalStackedBars, LegacyLineChart, LegacyStackedBarChart } from './LegacyCharts';
import { outputOperationalDetail } from './output-display';
import { buildClientHistory, type ClientHistoryEntry } from './client-history';
import { sourceOperationalValues } from '../../core/source-details';

type SortDirection = 'asc' | 'desc';
type ClassificationFilter = '' | 'original' | 'compatible';
type FamilyFilter = '' | 'T03' | 'T06' | 'GPR53';

const integerFormat = new Intl.NumberFormat('es-PY', { maximumFractionDigits: 0 });
const decimalFormat = new Intl.NumberFormat('es-PY', { maximumFractionDigits: 1 });

const FAMILY_COLORS = {
  original: '#1a2c4c',
  compatible: '#ff6b00',
  other: '#00a3e0',
  parts: '#7c3aed',
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
    <div className="legacy-analysis">
      <section className="summary-grid legacy-summary" aria-label={`Indicadores de ${family}`}>
        <SummaryMetric value={integerFormat.format(analysis.records)} label="total de despachos" />
        <SummaryMetric value={integerFormat.format(analysis.originalQuantity)} label="tóner original" />
        <SummaryMetric value={integerFormat.format(analysis.compatibleQuantity)} label="tóner compatible" />
        <SummaryMetric value={integerFormat.format(analysis.otherRecords)} label="otros consumibles" />
        <SummaryMetric value={formatPyg(averageOriginalCostUsd)} label="precio prom. original" />
        <SummaryMetric value={`${compatibleShare}%`} label="proporción compatible" />
      </section>

      {analysis.records === 0 ? <p className="analytics-empty">No hay registros para la familia seleccionada.</p> : (
        <>
          <section className="legacy-analysis-note" aria-label="Lectura de la familia">
            <strong>{familyLabel(family)}:</strong>{' '}
            {analysis.compatibleQuantity > 0
              ? `el ${compatibleShare}% de los tóners son compatibles${savings !== null ? `, con un ahorro estimado del ${savings}% por unidad frente al original` : ''}. `
              : 'no hay tóners compatibles registrados. '}
            Precio promedio original: <strong>{formatPyg(averageOriginalCostUsd)}</strong>{' '}
            {analysis.compatibleQuantity > 0 ? `· compatible: ${formatPyg(averageCompatibleCostUsd)}.` : '.'}
          </section>

          <div className="legacy-chart-row">
            <section className="sales-card legacy-chart-card">
              <div className="card-heading"><div><div className="eyebrow">COSTO UNITARIO</div><h2>Precio promedio de tóner</h2></div><span className="muted-note">PYG por unidad</span></div>
              <LegacyStackedBarChart
                labels={['Original', 'Compatible']}
                series={[{ label: 'Precio promedio', color: FAMILY_COLORS.original, values: [averageOriginalCostUsd ? usdToPyg(averageOriginalCostUsd) : 0, averageCompatibleCostUsd ? usdToPyg(averageCompatibleCostUsd) : 0] }]}
                valueFormatter={formatPygValue}
                ariaLabel={`Precio promedio de tóner original y compatible para ${familyLabel(family)}`}
              />
            </section>
            <section className="sales-card legacy-chart-card">
              <div className="card-heading"><div><div className="eyebrow">VOLUMEN</div><h2>Volumen por tipo</h2></div><span className="muted-note">unidades registradas</span></div>
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
            </section>
          </div>

          <section className="sales-card legacy-chart-card">
            <div className="card-heading"><div><div className="eyebrow">EVOLUCIÓN</div><h2>Tendencia mensual · cantidades</h2></div><span className="muted-note">líneas por familia</span></div>
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
          </section>

          <section className="sales-card legacy-chart-card">
            <div className="card-heading"><div><div className="eyebrow">EVOLUCIÓN</div><h2>Tendencia mensual · costos</h2></div><span className="muted-note">importes en guaraníes</span></div>
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
          </section>
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
    <div className="legacy-analysis">
      <section className="summary-grid legacy-summary" aria-label="Resumen de contratos">
        <SummaryMetric value={integerFormat.format(rows.length)} label="contratos con consumo" />
        <SummaryMetric value={formatPyg(totalOriginal)} label="costo originales" />
        <SummaryMetric value={formatPyg(totalCompatible)} label="costo compatibles" />
        <SummaryMetric value={formatPyg(totalParts)} label="costo repuestos" />
        <SummaryMetric value={`${compatibleContractShare}%`} label="contratos con compatibles" />
      </section>
      {compatibleContracts > 0 ? <section className="legacy-analysis-note" aria-label="Lectura de contratos">
        <strong>{integerFormat.format(compatibleContracts)} de {integerFormat.format(rows.length)} contratos</strong> ({compatibleContractShare}%) utilizan consumibles compatibles. El costo compatible representa{' '}
        <strong>{totalOriginal + totalCompatible > 0 ? `${Math.round((totalCompatible / (totalOriginal + totalCompatible)) * 100)}%` : '0%'}</strong> del gasto en consumibles de estos contratos.
      </section> : null}
      {typeGroups.length > 0 ? <div className="legacy-chart-row">
        <section className="sales-card legacy-chart-card">
          <div className="card-heading"><div><div className="eyebrow">TIPO DE CONTRATO</div><h2>Costo por tipo</h2></div><span className="muted-note">PYG · apilado por origen</span></div>
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
        </section>
        <section className="sales-card legacy-chart-card">
          <div className="card-heading"><div><div className="eyebrow">DISTRIBUCIÓN</div><h2>Distribución de costos</h2></div><span className="muted-note">total consolidado</span></div>
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
        </section>
      </div> : null}
      <section className="sales-card">
        <div className="card-heading">
          <div><div className="eyebrow">IMPACTO EN CONTRATOS</div><h2>Detalle por contrato</h2></div>
          <span className="muted-note">{integerFormat.format(rows.length)} contratos · total {formatPyg(totalCost)}</span>
        </div>
        {rows.length === 0 ? <p className="analytics-empty">No hay registros de consumo para los filtros seleccionados.</p> : (
          <div className="catalog-table-wrap">
            <table className="catalog-table legacy-contract-table">
              <thead><tr>
                <th>Contrato / cliente</th><th>Tipo</th><th className="align-right">Equipos</th>
                <th className="align-right">Originales</th><th className="align-right">Compatibles</th>
                <th className="align-right">Repuestos</th><th className="align-right">Total</th>
              </tr></thead>
              <tbody>{rows.map((row) => <tr key={row.key}>
                <td><span className="code-cell">{row.reference}</span>{formatContractDetails(row.reference, row.orderReference, row.division, row.contractCommercialArea).map((detail) => <small className="table-secondary-text" key={detail}>{detail}</small>)}<small className="table-secondary-text">{row.customerName}</small><small className="table-secondary-text">{formatCustomerClassification(row.customerType, row.commercialArea) || 'Sector y área sin clasificar'}</small></td>
                <td>{row.contractType || 'Sin tipo'}</td>
                <td className="align-right">{integerFormat.format(row.equipment)}</td>
                <td className="align-right">{integerFormat.format(row.originalQuantity)}<small className="table-secondary-text">{formatPyg(row.originalCostUsd)}</small></td>
                <td className="align-right">{integerFormat.format(row.compatibleQuantity)}<small className="table-secondary-text">{formatPyg(row.compatibleCostUsd)}</small></td>
                <td className="align-right">{integerFormat.format(row.partQuantity)}<small className="table-secondary-text">{formatPyg(row.partCostUsd)}</small></td>
                <td className="align-right price-cell">{formatPyg(row.totalCostUsd)}<small className="table-secondary-text">{integerFormat.format(row.records)} líneas</small></td>
              </tr>)}</tbody>
            </table>
          </div>
        )}
      </section>
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
    <div className="legacy-analysis">
      <section className="summary-grid legacy-summary" aria-label="Resumen de fichas">
        <SummaryMetric value={integerFormat.format(consumableRows.length)} label="equipos con consumibles" />
        <SummaryMetric value={integerFormat.format(partRows.length)} label="equipos con repuestos" />
        <SummaryMetric value={integerFormat.format(bothRows.length)} label="con ambas fuentes" />
        <SummaryMetric value={integerFormat.format(totalConsumableLines)} label="líneas de consumibles" />
        <SummaryMetric value={integerFormat.format(totalPartLines)} label="líneas de repuestos" />
        <SummaryMetric value={globalRatio} label="ratio consumibles / rep." />
      </section>
      {bothRows.length > 0 ? <section className="legacy-analysis-note" aria-label="Cobertura de fichas">
        <strong>{integerFormat.format(bothRows.length)} equipos</strong> ({percentage(bothRows.length, consumableRows.length)}) tienen registros en ambas fuentes, lo que permite correlacionar entregas de insumos con repuestos. Ratio global: <strong>{globalRatio}</strong> consumibles por repuesto.
      </section> : null}
      <section className="sales-card">
        <div className="card-heading">
          <div><div className="eyebrow">CONSUMIBLES VS REPUESTOS</div><h2>Fichas por equipo</h2></div>
          <span className="muted-note">Abrí una fila para ver el historial cronológico</span>
        </div>
        <div className="legacy-analysis-toolbar">
          <label className="search-field"><span>Buscar equipo</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Serie, modelo, cliente…" /></label>
          <label className="compact-field"><span>Familia</span><select value={family} onChange={(event) => setFamily(event.target.value as FamilyFilter)}><option value="">Todas</option><option value="T03">T03</option><option value="T06">T06</option><option value="GPR53">GPR-53</option></select></label>
          <label className="compact-field"><span>Tipo dentro del historial</span><select value={classification} onChange={(event) => setClassification(event.target.value as ClassificationFilter)}><option value="">Todos</option><option value="original">Originales</option><option value="compatible">Compatibles</option></select></label>
        </div>
        <p className="analysis-meta">{integerFormat.format(filteredRows.length)} equipos visibles · {integerFormat.format(familyRows.reduce((sum, row) => sum + row.totalRecords, 0))} líneas en la selección</p>
        {filteredRows.length === 0 ? <p className="analytics-empty">No hay salidas para los filtros seleccionados.</p> : (
          <div className="catalog-table-wrap">
            <table className="catalog-table legacy-ficha-table">
              <thead><tr>
                <th aria-label="Abrir" />
                <LegacySortableHeader label="N° serie" active={sortKey === 'serial'} direction={sortDirection} onClick={() => changeSort('serial')} />
                <LegacySortableHeader label="Modelo" active={sortKey === 'model'} direction={sortDirection} onClick={() => changeSort('model')} />
                <LegacySortableHeader label="Cliente" active={sortKey === 'customer'} direction={sortDirection} onClick={() => changeSort('customer')} />
                <LegacySortableHeader label="Consumibles" active={sortKey === 'consumables'} direction={sortDirection} onClick={() => changeSort('consumables')} alignRight />
                <LegacySortableHeader label="Repuestos" active={sortKey === 'parts'} direction={sortDirection} onClick={() => changeSort('parts')} alignRight />
                <LegacySortableHeader label="Ratio" active={sortKey === 'ratio'} direction={sortDirection} onClick={() => changeSort('ratio')} alignRight />
              </tr></thead>
              <tbody>{filteredRows.map((row) => {
                const isOpen = selectedSerial === row.serialNumber;
                return <FichaRow key={row.serialNumber} row={row} isOpen={isOpen} classification={classification} onToggle={() => setSelectedSerial(isOpen ? null : row.serialNumber)} />;
              })}</tbody>
            </table>
          </div>
        )}
      </section>
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
    <div className="legacy-analysis">
      <section className="summary-grid legacy-summary" aria-label="Resumen de servicios">
        <SummaryMetric value={integerFormat.format(filteredServices.length)} label="servicios visibles" />
        <SummaryMetric value={integerFormat.format(new Set(filteredServices.map((record) => record.serialNumber)).size)} label="equipos con servicio" />
        <SummaryMetric value={integerFormat.format(shared)} label="equipos con ambas fuentes" />
        <SummaryMetric value={integerFormat.format(filteredOutputs.length)} label="consumibles vinculados" />
        <SummaryMetric value={topTask ? integerFormat.format(topTask[1]) : '—'} label={topTask ? `tarea principal · ${topTask[0]}` : 'tarea principal'} />
        <SummaryMetric value={integerFormat.format(swapFlags.flaggedSerials.size)} label="posibles reemplazos" />
      </section>
      {shared > 0 ? <section className="legacy-analysis-note" aria-label="Cobertura de servicios">
        <strong>{integerFormat.format(shared)} equipos</strong> tienen servicios y consumibles en la selección. El cruce mensual cuenta servicios solo cuando pertenecen a un equipo con salida de tóner o cilindro en ese mismo mes.
      </section> : null}
      {swapFlags.flaggedSerials.size > 0 ? <section className="legacy-analysis-note warning" aria-label="Posibles reemplazos detectados">
        <strong>{integerFormat.format(swapFlags.flaggedSerials.size)} equipos</strong> muestran una señal compatible → original dentro de tres días. Es una alerta de revisión, no una conclusión automática.
      </section> : null}
      <section className="sales-card">
        <div className="card-heading">
          <div><div className="eyebrow">SERVICIOS VS CONSUMIBLES</div><h2>Relación operativa</h2></div>
          <span className="muted-note">Origen: Servicios LAM · salidas de consumibles</span>
        </div>
        <div className="legacy-analysis-toolbar legacy-service-toolbar">
          <label className="search-field"><span>Buscar equipo o servicio</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Serie, cliente, técnico, tarea…" /></label>
          <label className="compact-field"><span>Familia</span><select value={family} onChange={(event) => setFamily(event.target.value as FamilyFilter)}><option value="">Todas</option><option value="T03">T03</option><option value="T06">T06</option><option value="GPR53">GPR-53</option></select></label>
          <label className="compact-field"><span>Tipo de tarea</span><select value={taskType} onChange={(event) => setTaskType(event.target.value)}><option value="">Todas</option>{taskTypes.map((value) => <option value={value} key={value}>{value}</option>)}</select></label>
          <label className="compact-field"><span>Consumible</span><select value={classification} onChange={(event) => setClassification(event.target.value as ClassificationFilter)}><option value="">Todos</option><option value="original">Originales</option><option value="compatible">Compatibles</option></select></label>
        </div>
        <div className="legacy-chart-row legacy-service-charts">
          <section className="legacy-chart-inset">
            <div className="legacy-chart-inset-heading"><strong>Tendencia mensual · servicios vs. consumibles</strong><span>solo equipos relacionados en el mes</span></div>
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
          <section className="legacy-chart-inset">
            <div className="legacy-chart-inset-heading"><strong>Originales vs. compatibles vs. servicios</strong><span>líneas registradas por mes</span></div>
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
        <p className="analysis-meta">{integerFormat.format(sortedRows.length)} equipos visibles · seleccioná una fila para ver servicios y consumibles juntos</p>
        {sortedRows.length === 0 ? <p className="analytics-empty">No hay servicios o consumibles que coincidan con los filtros.</p> : (
          <div className="catalog-table-wrap">
            <table className="catalog-table legacy-service-table">
              <thead><tr>
                <th aria-label="Abrir" />
                <LegacySortableHeader label="N° serie" active={sortKey === 'serial'} direction={sortDirection} onClick={() => changeSort('serial')} />
                <LegacySortableHeader label="Modelo" active={sortKey === 'model'} direction={sortDirection} onClick={() => changeSort('model')} />
                <LegacySortableHeader label="Cliente" active={sortKey === 'customer'} direction={sortDirection} onClick={() => changeSort('customer')} />
                <LegacySortableHeader label="Servicios" active={sortKey === 'services'} direction={sortDirection} onClick={() => changeSort('services')} alignRight />
                <LegacySortableHeader label="Consumibles" active={sortKey === 'consumables'} direction={sortDirection} onClick={() => changeSort('consumables')} alignRight />
              </tr></thead>
              <tbody>{sortedRows.map((row) => {
                const isOpen = selectedSerial === row.serialNumber;
                return <ServiceRow key={row.serialNumber} row={row} isOpen={isOpen} classification={classification} swapFlags={swapFlags} onToggle={() => setSelectedSerial(isOpen ? null : row.serialNumber)} />;
              })}</tbody>
            </table>
          </div>
        )}
      </section>
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
  const rankedClients = useMemo(() => sortRows(clientRows, (row) => row.totalCostUsd, 'desc'), [clientRows]);
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
    <div className="legacy-analysis">
      <section className="summary-grid legacy-summary" aria-label="Resumen del ranking">
        <SummaryMetric value={integerFormat.format(clientRows.length)} label="clientes únicos" />
        <SummaryMetric value={integerFormat.format(equipmentRows.length)} label="equipos únicos" />
        <SummaryMetric value={integerFormat.format(compatibleEquipment)} label="equipos con compatibles" />
        <SummaryMetric value={topClient?.clientName || '—'} label="cliente principal" />
        <SummaryMetric value={formatPyg(totalCost)} label="costo acumulado" />
      </section>
      {topClient && totalCost > 0 ? <section className="legacy-analysis-note" aria-label="Concentración del ranking">
        <strong>{topClient.clientName}</strong> representa {percentage(topClient.totalCostUsd, totalCost)} del costo total ({formatPyg(topClient.totalCostUsd)}).{rankedClients.length >= 3 ? ` Los tres principales acumulan ${percentage(topThreeCost, totalCost)}.` : ''}
      </section> : null}
      <section className="sales-card">
        <div className="card-heading">
          <div><div className="eyebrow">RANKING</div><h2>Clientes y equipos con mayor costo</h2></div>
          <span className="muted-note">Los encabezados permiten ordenar ambas tablas</span>
        </div>
        <div className="legacy-analysis-toolbar">
          <label className="search-field"><span>Buscar</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cliente, modelo, serie, OV…" /></label>
        </div>
        <div className="legacy-chart-row legacy-ranking-charts">
          <section className="legacy-chart-inset">
            <div className="legacy-chart-inset-heading"><strong>Top 10 clientes por costo</strong><span>originales, compatibles y repuestos</span></div>
            <LegacyHorizontalStackedBars
              labels={rankedClients.slice(0, 10).map((row) => row.clientName)}
              series={[
                { label: 'Originales', color: FAMILY_COLORS.original, values: rankedClients.slice(0, 10).map((row) => usdToPyg(row.originalCostUsd)) },
                { label: 'Compatibles', color: FAMILY_COLORS.compatible, values: rankedClients.slice(0, 10).map((row) => usdToPyg(row.compatibleCostUsd)) },
                { label: 'Repuestos', color: FAMILY_COLORS.parts, values: rankedClients.slice(0, 10).map((row) => usdToPyg(row.partCostUsd)) },
              ]}
              valueFormatter={formatPygValue}
              ariaLabel="Top 10 clientes por costo de consumibles y repuestos"
            />
          </section>
          <section className="legacy-chart-inset">
            <div className="legacy-chart-inset-heading"><strong>Top 10 equipos por costo</strong><span>ordenados por total acumulado</span></div>
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
        <h3 className="legacy-subheading">Ranking de clientes</h3>
        <div className="catalog-table-wrap">
          <table className="catalog-table legacy-ranking-table">
            <thead><tr>
              <LegacySortableHeader label="Cliente" active={sortKey === 'client'} direction={sortDirection} onClick={() => changeSort('client')} />
              <LegacySortableHeader label="Equipos" active={sortKey === 'equipment'} direction={sortDirection} onClick={() => changeSort('equipment')} alignRight />
              <LegacySortableHeader label="Originales" active={sortKey === 'original'} direction={sortDirection} onClick={() => changeSort('original')} alignRight />
              <LegacySortableHeader label="Compatibles" active={sortKey === 'compatible'} direction={sortDirection} onClick={() => changeSort('compatible')} alignRight />
              <LegacySortableHeader label="Repuestos" active={sortKey === 'parts'} direction={sortDirection} onClick={() => changeSort('parts')} alignRight />
              <LegacySortableHeader label="Total" active={sortKey === 'cost'} direction={sortDirection} onClick={() => changeSort('cost')} alignRight />
            </tr></thead>
            <tbody>{sortedClients.map((row) => <tr key={row.key}>
              <td><span className="code-cell">{row.clientName}</span><small className="table-secondary-text">{formatCustomerClassification(row.customerType, row.commercialArea) || 'Sector y área sin clasificar'}</small></td>
              <td className="align-right">{integerFormat.format(row.equipment)}</td>
              <td className="align-right">{integerFormat.format(row.originalQuantity)}<small className="table-secondary-text">{formatPyg(row.originalCostUsd)}</small></td>
              <td className="align-right">{integerFormat.format(row.compatibleQuantity)}<small className="table-secondary-text">{formatPyg(row.compatibleCostUsd)}</small></td>
              <td className="align-right">{integerFormat.format(row.partQuantity)}<small className="table-secondary-text">{formatPyg(row.partCostUsd)}</small></td>
              <td className="align-right price-cell">{formatPyg(row.totalCostUsd)}</td>
            </tr>)}</tbody>
          </table>
        </div>
        <h3 className="legacy-subheading">Ranking de equipos</h3>
        <div className="catalog-table-wrap">
          <table className="catalog-table legacy-ranking-table legacy-equipment-ranking-table">
            <thead><tr>
              <LegacySortableHeader label="Equipo" active={sortKey === 'model'} direction={sortDirection} onClick={() => changeSort('model')} />
              <LegacySortableHeader label="Serie" active={sortKey === 'serial'} direction={sortDirection} onClick={() => changeSort('serial')} />
              <th>Cliente / contrato</th><th>Familia</th>
              <LegacySortableHeader label="Originales" active={sortKey === 'original'} direction={sortDirection} onClick={() => changeSort('original')} alignRight />
              <LegacySortableHeader label="Compatibles" active={sortKey === 'compatible'} direction={sortDirection} onClick={() => changeSort('compatible')} alignRight />
              <LegacySortableHeader label="Repuestos" active={sortKey === 'parts'} direction={sortDirection} onClick={() => changeSort('parts')} alignRight />
              <LegacySortableHeader label="Total" active={sortKey === 'cost'} direction={sortDirection} onClick={() => changeSort('cost')} alignRight />
            </tr></thead>
            <tbody>{sortedEquipment.map((row) => <tr key={row.key}>
              <td><span className="code-cell">{row.modelLabel}</span></td>
              <td><span className="code-cell">{row.serialNumber}</span></td>
              <td><span className="table-secondary-text">{row.clientName}</span>{formatContractDetails(row.contractReference, row.orderReference, row.division, row.contractCommercialArea).map((detail) => <small className="table-secondary-text" key={detail}>{detail}</small>)}<small className="table-secondary-text">{formatCustomerClassification(row.customerType, row.commercialArea) || 'Sector y área sin clasificar'}</small></td>
              <td>{row.family}</td>
              <td className="align-right">{integerFormat.format(row.originalQuantity)}<small className="table-secondary-text">{formatPyg(row.originalCostUsd)}</small></td>
              <td className="align-right">{integerFormat.format(row.compatibleQuantity)}<small className="table-secondary-text">{formatPyg(row.compatibleCostUsd)}</small></td>
              <td className="align-right">{integerFormat.format(row.partQuantity)}<small className="table-secondary-text">{formatPyg(row.partCostUsd)}</small></td>
              <td className="align-right price-cell">{formatPyg(row.totalCostUsd)}</td>
            </tr>)}</tbody>
          </table>
        </div>
        {sortedClients.length === 0 && sortedEquipment.length === 0 ? <p className="analytics-empty">No hay resultados para la búsqueda.</p> : null}
      </section>
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
    <div className="legacy-analysis">
      <section className="summary-grid legacy-summary" aria-label="Resumen de equipos">
        <SummaryMetric value={integerFormat.format(allRows.length)} label="total de equipos" />
        <SummaryMetric value={formatPyg(totalOriginal)} label="costo originales" />
        <SummaryMetric value={formatPyg(totalCompatible)} label="costo compatibles" />
        <SummaryMetric value={formatPyg(totalParts)} label="costo repuestos" />
        <SummaryMetric value={integerFormat.format(compatibleEquipment)} label="equipos con compatibles" />
      </section>
      <section className="sales-card">
        <div className="card-heading">
          <div><div className="eyebrow">EQUIPOS</div><h2>Equipos con consumo</h2></div>
          <span className="muted-note">{integerFormat.format(sortedRows.length)} equipos visibles</span>
        </div>
        <div className="legacy-analysis-toolbar">
          <label className="search-field"><span>Buscar equipo</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Serie, modelo o cliente…" /></label>
        </div>
        <div className="catalog-table-wrap">
          <table className="catalog-table legacy-equipment-table">
            <thead><tr>
              <LegacySortableHeader label="N° serie" active={sortKey === 'serial'} direction={sortDirection} onClick={() => changeSort('serial')} />
              <LegacySortableHeader label="Modelo" active={sortKey === 'model'} direction={sortDirection} onClick={() => changeSort('model')} />
              <LegacySortableHeader label="Cliente" active={sortKey === 'client'} direction={sortDirection} onClick={() => changeSort('client')} />
              <th>OV / contrato</th><th>Familia</th>
              <LegacySortableHeader label="Originales" active={sortKey === 'original'} direction={sortDirection} onClick={() => changeSort('original')} alignRight />
              <LegacySortableHeader label="Compatibles" active={sortKey === 'compatible'} direction={sortDirection} onClick={() => changeSort('compatible')} alignRight />
              <LegacySortableHeader label="Repuestos" active={sortKey === 'parts'} direction={sortDirection} onClick={() => changeSort('parts')} alignRight />
              <LegacySortableHeader label="Total" active={sortKey === 'cost'} direction={sortDirection} onClick={() => changeSort('cost')} alignRight />
            </tr></thead>
            <tbody>{sortedRows.map((row) => <tr key={row.key}>
              <td><span className="code-cell">{row.serialNumber}</span></td>
              <td>{row.modelLabel}</td>
              <td>{row.clientName}</td>
              <td><span>{formatContractLabel(row.contractReference, row.orderReference) || '—'}</span>{row.contractCommercialArea ? <small className="table-secondary-text">Área contrato: {row.contractCommercialArea}</small> : null}{row.division ? <small className="table-secondary-text">División: {row.division}</small> : null}</td>
              <td>{row.family}</td>
              <td className="align-right">{integerFormat.format(row.originalQuantity)}<small className="table-secondary-text">{formatPyg(row.originalCostUsd)}</small></td>
              <td className="align-right">{integerFormat.format(row.compatibleQuantity)}<small className="table-secondary-text">{formatPyg(row.compatibleCostUsd)}</small></td>
              <td className="align-right">{integerFormat.format(row.partQuantity)}<small className="table-secondary-text">{formatPyg(row.partCostUsd)}</small></td>
              <td className="align-right price-cell">{formatPyg(row.totalCostUsd)}</td>
            </tr>)}</tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function FichaRow({ row, isOpen, classification, onToggle }: { row: FichaRowData; isOpen: boolean; classification: ClassificationFilter; onToggle: () => void }) {
  return <>
    <tr className={`legacy-expandable-row ${isOpen ? 'expanded' : ''}`} onClick={onToggle}>
      <td className="legacy-expand-toggle" aria-label={isOpen ? 'Cerrar detalle' : 'Abrir detalle'}>{isOpen ? '⌄' : '›'}</td>
      <td><span className="code-cell">{row.serialNumber}</span></td>
      <td>{row.modelLabel}</td>
      <td><span>{row.customerName || 'Sin cliente'}</span>{formatContractLabel(row.contractReference, row.orderReference) ? <small className="table-secondary-text">{formatContractLabel(row.contractReference, row.orderReference)}</small> : null}{formatContractDetails(row.contractReference, row.orderReference, row.division, row.contractCommercialArea).map((detail) => <small className="table-secondary-text" key={detail}>{detail}</small>)}</td>
      <td className="align-right">{integerFormat.format(row.consumables)}</td>
      <td className="align-right">{integerFormat.format(row.parts)}</td>
      <td className="align-right">{row.parts > 0 ? `${decimalFormat.format(row.consumables / row.parts)}x` : '—'}</td>
    </tr>
    {isOpen ? <tr className="legacy-detail-row"><td colSpan={7}><OutputTimeline serialNumber={row.serialNumber} outputs={row.outputs} classification={classification} /></td></tr> : null}
  </>;
}

function ServiceRow({ row, isOpen, classification, swapFlags, onToggle }: { row: ServiceRowData; isOpen: boolean; classification: ClassificationFilter; swapFlags: ReturnType<typeof buildSwapFlags>; onToggle: () => void }) {
  return <>
    <tr className={`legacy-expandable-row ${isOpen ? 'expanded' : ''}`} onClick={onToggle}>
      <td className="legacy-expand-toggle" aria-label={isOpen ? 'Cerrar detalle' : 'Abrir detalle'}>{isOpen ? '⌄' : '›'}</td>
      <td><span className="code-cell">{row.serialNumber}</span>{swapFlags.flaggedSerials.has(row.serialNumber) ? <SwapFlag /> : null}</td>
      <td>{row.modelLabel}</td>
      <td><span>{row.customerName || 'Sin cliente'}</span>{row.clientHistory.length > 0 ? <small className="table-secondary-text">Historial de cliente</small> : null}</td>
      <td className="align-right">{integerFormat.format(row.services)}</td>
      <td className="align-right">{integerFormat.format(row.consumables)}</td>
    </tr>
    {isOpen ? <tr className="legacy-detail-row"><td colSpan={6}><ServiceTimeline serialNumber={row.serialNumber} currentCustomerName={row.customerName} clientHistory={row.clientHistory} services={row.serviceRecords} outputs={row.outputs} classification={classification} swapFlags={swapFlags} /></td></tr> : null}
  </>;
}

function SwapFlag() {
  return <span className="legacy-swap-flag" title="Posible reemplazo: compatible seguido de original en tres días" aria-label="Posible reemplazo detectado">!</span>;
}

function OutputTimeline({ serialNumber, outputs, classification }: { serialNumber: string; outputs: ConsumablesOutputRecord[]; classification: ClassificationFilter }) {
  const events = outputs
    .filter((record) => record.recordKind === 'consumable' || record.recordKind === 'part')
    .filter((record) => !classification || record.recordKind !== 'consumable' || record.classification === classification)
    .sort((left, right) => left.recordedAt.localeCompare(right.recordedAt) || left.id.localeCompare(right.id));
  return <div className="legacy-detail-panel">
    <div className="legacy-detail-heading"><strong>Historial del equipo</strong><span>{serialNumber} · {integerFormat.format(events.length)} líneas</span></div>
    {events.length === 0 ? <p className="analytics-empty">No hay eventos para el tipo seleccionado.</p> : <div className="legacy-timeline">{events.map((record) => <div className="legacy-timeline-event" key={record.id}>
      <span className={`badge ${record.recordKind === 'consumable' ? 'ok' : 'warning'}`}>{record.recordKind === 'consumable' ? record.category : 'Repuesto'}</span>
      <strong>{record.recordedAt || record.month || 'Sin fecha'}</strong>
      <span className="code-cell">{record.partCode || 'Sin código'}</span>
      <span className="legacy-timeline-description">{record.description || 'Sin descripción'}</span>
      <span>×{numberFormat(record.quantity)}</span>
      {record.yieldPages > 0 ? <span>{numberFormat(record.yieldPages)} pág.</span> : null}
      <small>{formatOutputTimelineMeta(record)}</small>
    </div>)}</div>}
  </div>;
}

function ServiceTimeline({ serialNumber, currentCustomerName, clientHistory, services, outputs, classification, swapFlags }: { serialNumber: string; currentCustomerName: string; clientHistory: ClientHistoryEntry[]; services: ServiceRecord[]; outputs: ConsumablesOutputRecord[]; classification: ClassificationFilter; swapFlags: ReturnType<typeof buildSwapFlags> }) {
  const events = [
    ...services.map((record) => ({ date: record.recordedAt || record.month, kind: 'service' as const, record })),
    ...outputs
      .filter((record) => !classification || record.classification === classification)
      .map((record) => ({ date: record.recordedAt || record.month, kind: 'output' as const, record })),
  ].sort((left, right) => left.date.localeCompare(right.date));
  return <div className="legacy-detail-panel">
    <div className="legacy-detail-heading"><strong>Historial de servicios y consumibles</strong><span>{serialNumber} · {integerFormat.format(events.length)} eventos</span></div>
    {clientHistory.length > 0 ? <ClientHistoryAlert currentCustomerName={currentCustomerName} entries={clientHistory} /> : null}
    {events.length === 0 ? <p className="analytics-empty">No hay eventos para el tipo seleccionado.</p> : <div className="legacy-timeline">{events.map((event, index) => event.kind === 'service' ? <div className="legacy-timeline-event service-event" key={`${event.kind}-${event.record.id}-${index}`}>
      {swapFlags.flaggedServiceIds.has(event.record.id) ? <SwapFlag /> : null}<span className="badge ok">Servicio</span><strong>{event.date || 'Sin fecha'}</strong><span className="code-cell">IS {event.record.serviceNumber || 'sin número'}</span><span className="legacy-timeline-description">{event.record.taskCompleted || 'Sin descripción de tarea'}</span><small>{event.record.taskType || 'Sin tipo'}{event.record.technician ? ` · ${event.record.technician}` : ''}{event.record.orderReference ? ` · OV ${event.record.orderReference}` : ''}</small>
    </div> : <div className="legacy-timeline-event" key={`${event.kind}-${event.record.id}-${index}`}>
      {swapFlags.flaggedOutputIds.has(event.record.id) ? <SwapFlag /> : null}<span className={`badge ${event.record.classification === 'original' ? 'ok' : 'warning'}`}>{event.record.category}</span><strong>{event.date || 'Sin fecha'}</strong><span className="code-cell">{event.record.partCode || 'Sin código'}</span><span className="legacy-timeline-description">{event.record.description || 'Sin descripción'}</span><span>×{numberFormat(event.record.quantity)}</span><small>{formatOutputTimelineMeta(event.record)}</small>
    </div>)}</div>}
  </div>;
}

function ClientHistoryAlert({ currentCustomerName, entries }: { currentCustomerName: string; entries: ClientHistoryEntry[] }) {
  return <section className="legacy-analysis-note warning" aria-label="Historial de clientes anteriores">
    <strong>Historial de cliente</strong>
    <span>Este equipo actualmente figura en <strong>{currentCustomerName || 'la cartera actual'}</strong>, pero también tiene registros de clientes anteriores.</span>
    {entries.map((entry) => <small key={`${entry.customerName}-${entry.from}-${entry.to}`}>
      <strong>{entry.customerName}</strong> · registros entre {entry.from} y {entry.to}
      {entry.orderReferences.length > 0 ? ` · OV: ${entry.orderReferences.join(', ')}` : ''}
    </small>)}
  </section>;
}

function SummaryMetric({ value, label }: { value: string; label: string }) {
  return <div className="summary-card"><span className="summary-value" title={value}>{value}</span><span className="summary-label">{label}</span></div>;
}

function LegacySortableHeader({ label, active, direction, onClick, alignRight = false }: { label: string; active: boolean; direction: SortDirection; onClick: () => void; alignRight?: boolean }) {
  return <th className={`${alignRight ? 'align-right ' : ''}legacy-sortable-th`} aria-sort={active ? direction === 'asc' ? 'ascending' : 'descending' : 'none'}><button type="button" onClick={onClick}>{label}<span aria-hidden="true">{active ? direction === 'asc' ? ' ↑' : ' ↓' : ''}</span></button></th>;
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

type CostParts = { originalQuantity: number; originalCostUsd: number; compatibleQuantity: number; compatibleCostUsd: number; partQuantity: number; partCostUsd: number; totalCostUsd: number; records: number; equipment: number };
type RankingClientRow = CostParts & { key: string; clientName: string; customerType: string; commercialArea: string; equipmentIds: Set<string> };
type RankingEquipmentRow = CostParts & { key: string; modelLabel: string; serialNumber: string; clientName: string; customerType: string; commercialArea: string; contractReference: string; orderReference: string; contractCommercialArea: string; division: string; family: string };
type RankingSortKey = 'client' | 'model' | 'serial' | 'original' | 'compatible' | 'parts' | 'equipment' | 'cost';

function emptyCostParts(): CostParts {
  return { originalQuantity: 0, originalCostUsd: 0, compatibleQuantity: 0, compatibleCostUsd: 0, partQuantity: 0, partCostUsd: 0, totalCostUsd: 0, records: 0, equipment: 0 };
}

function addRecordToCostParts(target: CostParts, record: ConsumablesRecord) {
  target.records += 1;
  target.totalCostUsd += record.costUsd;
  if (record.recordKind === 'part') {
    target.partQuantity += record.quantity;
    target.partCostUsd += record.costUsd;
  } else if (record.classification === 'original') {
    target.originalQuantity += record.quantity;
    target.originalCostUsd += record.costUsd;
  } else {
    target.compatibleQuantity += record.quantity;
    target.compatibleCostUsd += record.costUsd;
  }
}

function buildClientRows(records: ConsumablesRecord[]): RankingClientRow[] {
  const byClient = new Map<string, RankingClientRow>();
  for (const record of records) {
    const key = record.customerName || 'Sin cliente';
    const current = byClient.get(key) ?? { key, clientName: key, customerType: record.customerType, commercialArea: record.commercialArea, equipmentIds: new Set<string>(), ...emptyCostParts() };
    addRecordToCostParts(current, record);
    current.equipmentIds.add(record.equipmentId || record.serialNumber);
    current.equipment = current.equipmentIds.size;
    if (!current.customerType && record.customerType) current.customerType = record.customerType;
    if (!current.commercialArea && record.commercialArea) current.commercialArea = record.commercialArea;
    byClient.set(key, current);
  }
  return [...byClient.values()];
}

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

function formatPygValue(valuePyg: number): string {
  return `₲ ${integerFormat.format(Math.round(valuePyg))}`;
}

function percentage(value: number, total: number): string {
  return `${total > 0 ? Math.round((value / total) * 100) : 0}%`;
}

function familyLabel(family: ConsumablesFamily): string {
  return family === 'GPR53' ? 'GPR-53' : family;
}
