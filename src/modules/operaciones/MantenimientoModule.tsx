import { Fragment, useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import type {
  CustomerRecord,
  EquipmentRecord,
  OperationsPortfolioSnapshot,
} from './repository';
import type { MaintenanceAnalysis } from '../mantenimiento/analysis';
import type { MaintenanceImportSummary } from '../mantenimiento/repository';
import { exportMaintenanceWorkbook } from '../mantenimiento/export';
import { printOrSaveCurrentPageAsPdf } from '../../core/print';
import type { MaintenanceModelRule } from '../mantenimiento/analysis';
import MaintenanceRulesPanel from '../mantenimiento/MaintenanceRulesPanel';
import MaintenanceExecutiveSummary, { type MaintenanceExportKind } from '../mantenimiento/MaintenanceExecutiveSummary';
import MaintenanceExecutivePrintReport from '../mantenimiento/MaintenanceExecutivePrintReport';
import { maintenanceAnalysisMatchesSearch } from '../mantenimiento/search';
import { confirmAction } from '../../core/confirm';

type CounterImportResponse = MaintenanceImportSummary & {
  duplicate: boolean;
  skippedRows: number;
  sheets: number;
};

type ClearMaintenanceImportResponse = {
  ok: boolean;
  batches: number;
  archivedFiles: number;
};

type MaintenanceView = 'dashboard' | 'equipos' | 'modelos';

export default function MantenimientoModule() {
  const [customers, setCustomers] = useState<CustomerRecord[]>([]);
  const [equipment, setEquipment] = useState<EquipmentRecord[]>([]);
  const [maintenanceSummary, setMaintenanceSummary] = useState<MaintenanceImportSummary | null>(null);
  const [maintenanceRules, setMaintenanceRules] = useState<MaintenanceModelRule[]>([]);
  const [analyses, setAnalyses] = useState<MaintenanceAnalysis[]>([]);
  const [analysisQuery, setAnalysisQuery] = useState('');
  const [analysisClient, setAnalysisClient] = useState('');
  const [analysisModel, setAnalysisModel] = useState('');
  const [analysisPeriod, setAnalysisPeriod] = useState('');
  const [showNormalAnalyses, setShowNormalAnalyses] = useState(false);
  const [expandedAnalysisKey, setExpandedAnalysisKey] = useState<string | null>(null);
  const [activeMaintenanceView, setActiveMaintenanceView] = useState<MaintenanceView>('equipos');
  const analysisSearchRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(true);
  const [importingCounters, setImportingCounters] = useState(false);
  const [isCounterFileDragging, setIsCounterFileDragging] = useState(false);
  const [clearingImport, setClearingImport] = useState(false);
  const [exportingAnalysis, setExportingAnalysis] = useState(false);
  const [analysisMonths, setAnalysisMonths] = useState(3);
  const [printableAnalysis, setPrintableAnalysis] = useState<MaintenanceAnalysis | null>(null);
  const [printableExecutiveSummary, setPrintableExecutiveSummary] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void refresh();
  }, []);

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'k') return;
      event.preventDefault();
      analysisSearchRef.current?.focus();
      analysisSearchRef.current?.select();
    };
    window.addEventListener('keydown', handleShortcut);
    return () => window.removeEventListener('keydown', handleShortcut);
  }, []);

  useEffect(() => {
    if (!printableAnalysis) {
      if (document.body.dataset.printMode === 'maintenance-analysis') {
        delete document.body.dataset.printMode;
      }
      return;
    }

    document.body.dataset.printMode = 'maintenance-analysis';
    let cancelled = false;
    const printReport = async () => {
      await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
      try {
        const saved = await printOrSaveCurrentPageAsPdf(
          `informe-tecnico-${toFileSafeName(printableAnalysis.modelLabel || printableAnalysis.serialNumber)}`,
        );
        if (!cancelled && saved) {
          setMessage(saved.saved ? `PDF guardado: ${saved.filePath ?? 'archivo seleccionado'}.` : 'Guardado de PDF cancelado.');
        }
      } catch (printError: unknown) {
        if (!cancelled) setError(toErrorMessage(printError));
      } finally {
        if (!cancelled) setPrintableAnalysis(null);
      }
    };

    void printReport();
    return () => {
      cancelled = true;
      if (document.body.dataset.printMode === 'maintenance-analysis') {
        delete document.body.dataset.printMode;
      }
    };
  }, [printableAnalysis]);

  useEffect(() => {
    if (!printableExecutiveSummary) {
      if (document.body.dataset.printMode === 'maintenance-executive') {
        delete document.body.dataset.printMode;
      }
      return;
    }

    document.body.dataset.printMode = 'maintenance-executive';
    let cancelled = false;
    const printReport = async () => {
      await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
      try {
        const saved = await printOrSaveCurrentPageAsPdf('mantenimiento-resumen-ejecutivo');
        if (!cancelled && saved) {
          setMessage(saved.saved ? `PDF guardado: ${saved.filePath ?? 'archivo seleccionado'}.` : 'Guardado de PDF cancelado.');
        }
      } catch (printError: unknown) {
        if (!cancelled) setError(toErrorMessage(printError));
      } finally {
        if (!cancelled) setPrintableExecutiveSummary(false);
      }
    };

    void printReport();
    return () => {
      cancelled = true;
      if (document.body.dataset.printMode === 'maintenance-executive') {
        delete document.body.dataset.printMode;
      }
    };
  }, [printableExecutiveSummary]);

  const contractsCount = useMemo(
    () => customers.reduce((total, customer) => total + customer.contracts.length, 0),
    [customers],
  );

  const analysisClients = useMemo(
    () => [...new Set(analyses.map((analysis) => analysis.customerName))].sort((left, right) => left.localeCompare(right)),
    [analyses],
  );
  const analysisModels = useMemo(
    () => [...new Set(analyses.map((analysis) => analysis.modelLabel))].sort((left, right) => left.localeCompare(right)),
    [analyses],
  );
  const analysisPeriods = useMemo(
    () => [...new Set(analyses.flatMap((analysis) => analysis.periods.map((period) => period.period)))].sort(),
    [analyses],
  );
  const visibleAnalyses = useMemo(() => {
    return analyses.filter((analysis) => {
      if (!showNormalAnalyses && analysis.status === 'NORMAL') return false;
      if (analysisClient && analysis.customerName !== analysisClient) return false;
      if (analysisModel && analysis.modelLabel !== analysisModel) return false;
      if (analysisPeriod && !analysis.periods.some((period) => period.period === analysisPeriod)) return false;
      return maintenanceAnalysisMatchesSearch(analysis, analysisQuery);
    });
  }, [analyses, analysisClient, analysisModel, analysisPeriod, analysisQuery, showNormalAnalyses]);

  async function refresh() {
    setLoading(true);
    try {
      const [portfolioResponse, summaryResponse, analysisResponse, rulesResponse] = await Promise.all([
        fetch('/api/operations/portfolio-snapshot'),
        fetch('/api/maintenance/summary'),
        fetch(`/api/maintenance/analysis?months=${analysisMonths}`),
        fetch('/api/maintenance/rules'),
      ]);
      const portfolio = await readJson<OperationsPortfolioSnapshot>(portfolioResponse);
      const loadedSummary = await readJson<MaintenanceImportSummary>(summaryResponse);
      const loadedAnalyses = await readJson<MaintenanceAnalysis[]>(analysisResponse);
      const loadedRules = await readJson<MaintenanceModelRule[]>(rulesResponse);
      setCustomers(portfolio.customers);
      setEquipment(portfolio.equipment);
      setMaintenanceSummary(loadedSummary);
      setAnalyses(loadedAnalyses);
      setMaintenanceRules(loadedRules);
    } catch (requestError: unknown) {
      setError(toErrorMessage(requestError));
    } finally {
      setLoading(false);
    }
  }

  async function loadAnalyses(months: number) {
    setError(null);
    try {
      const response = await fetch(`/api/maintenance/analysis?months=${months}`);
      setAnalyses(await readJson<MaintenanceAnalysis[]>(response));
    } catch (requestError: unknown) {
      setError(toErrorMessage(requestError));
    }
  }

  async function exportAnalysis() {
    if (visibleAnalyses.length === 0) return;
    setExportingAnalysis(true);
    setError(null);
    try {
      await exportMaintenanceWorkbook(visibleAnalyses, maintenanceSummary, analysisMonths);
      setMessage(`Reporte XLSX generado con ${visibleAnalyses.length.toLocaleString('es-PY')} equipos.`);
    } catch (exportError: unknown) {
      setError(toErrorMessage(exportError));
    } finally {
      setExportingAnalysis(false);
    }
  }

  async function exportMaintenanceSubset(subset: readonly MaintenanceAnalysis[], kind: MaintenanceExportKind) {
    if (subset.length === 0) return;
    const fileNames: Record<MaintenanceExportKind, string> = {
      critical: 'mantenimiento-criticos',
      attention: 'mantenimiento-atencion',
      unrecognized: 'mantenimiento-no-reconocidos',
      zero: 'mantenimiento-contadores-en-cero',
      recommended: 'mantenimiento-exceso-volumen',
    };
    setExportingAnalysis(true);
    setError(null);
    try {
      await exportMaintenanceWorkbook(subset, maintenanceSummary, analysisMonths, fileNames[kind]);
      setMessage(`Reporte XLSX generado con ${subset.length.toLocaleString('es-PY')} equipos.`);
    } catch (exportError: unknown) {
      setError(toErrorMessage(exportError));
    } finally {
      setExportingAnalysis(false);
    }
  }

  async function printAnalysis() {
    if (visibleAnalyses.length === 0) return;
    setError(null);
    try {
      const saved = await printOrSaveCurrentPageAsPdf(`mantenimiento-${maintenanceSummary?.sourceName ?? 'reporte'}`);
      if (saved) setMessage(saved.saved ? `PDF guardado: ${saved.filePath ?? 'archivo seleccionado'}.` : 'Guardado de PDF cancelado.');
    } catch (printError: unknown) {
      setError(toErrorMessage(printError));
    }
  }

  function printSingleAnalysis(analysis: MaintenanceAnalysis) {
    setError(null);
    setPrintableAnalysis(analysis);
  }

  function printExecutiveSummary() {
    if (analyses.length === 0) return;
    setError(null);
    setPrintableExecutiveSummary(true);
  }

  async function importCounterFile(file: File) {
    if (!file) return;
    if (file.size > 35 * 1024 * 1024) {
      setError('El archivo supera el límite de 35 MB.');
      return;
    }

    setImportingCounters(true);
    setError(null);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const response = await fetch('/api/maintenance/import-counters', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sourceName: file.name, contentBase64: bytesToBase64(bytes) }),
      });
      const result = await readJson<CounterImportResponse>(response);
      setMessage(result.duplicate
        ? `Ese archivo ya estaba importado: ${result.records.toLocaleString('es-PY')} lecturas.`
        : `Contadores importados: ${result.records.toLocaleString('es-PY')} lecturas · ${result.matchedRecords.toLocaleString('es-PY')} reglas reconocidas${result.skippedRows > 0 ? ` · ${result.skippedRows.toLocaleString('es-PY')} filas omitidas` : ''}.`);
      await refresh();
    } catch (importError: unknown) {
      setError(toErrorMessage(importError));
    } finally {
      setImportingCounters(false);
    }
  }

  function handleCounterFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file) void importCounterFile(file);
  }

  function handleCounterDragOver(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    setIsCounterFileDragging(true);
  }

  function handleCounterDragLeave(event: DragEvent<HTMLDivElement>) {
    if (event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget)) return;
    setIsCounterFileDragging(false);
  }

  function handleCounterDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsCounterFileDragging(false);
    const file = event.dataTransfer.files[0];
    if (!file) return;
    if (!/\.(csv|xlsx)$/i.test(file.name)) {
      setError('El arrastre admite CSV o XLSX. La lectura del formato XLS antiguo sigue pendiente.');
      return;
    }
    void importCounterFile(file);
  }

  async function clearMaintenanceImport() {
    if (!maintenanceSummary?.batchId || clearingImport) return;
    const confirmed = await confirmAction({
      title: 'Quitar cargas de Mantenimiento',
      message: 'Se quitarán las cargas activas de contadores y sus reglas del análisis. Los archivos originales se conservarán en el archivo recuperable y la cartera compartida no se eliminará.',
      confirmLabel: 'Quitar cargas',
    });
    if (!confirmed) return;

    setClearingImport(true);
    setError(null);
    try {
      const response = await fetch('/api/maintenance/import', { method: 'DELETE' });
      const result = await readJson<ClearMaintenanceImportResponse>(response);
      setMessage(`${result.batches.toLocaleString('es-PY')} carga(s) de contadores quitada(s); ${result.archivedFiles.toLocaleString('es-PY')} original(es) archivado(s).`);
      await refresh();
    } catch (clearError: unknown) {
      setError(toErrorMessage(clearError));
    } finally {
      setClearingImport(false);
    }
  }

  return (
    <div className="page-content operations-page maintenance-page">
      <section className="catalog-header">
        <div>
          <div className="eyebrow">OPERACIONES / BASE INSTALADA</div>
          <h1>Mantenimiento</h1>
          <p className="lead">Consulta clientes, contratos y equipos instalados a partir de los archivos operativos que consumen Catálogo y Ventas.</p>
        </div>
        <button className="secondary-button" type="button" onClick={() => void refresh()} disabled={loading || clearingImport}>
          {loading ? 'Actualizando…' : 'Actualizar'}
        </button>
      </section>

      <section className="sales-card maintenance-source-card" aria-label="Fuente de contadores">
        <div className="maintenance-source-identity">
          <div className="eyebrow">SOPORTE DE DATOS</div>
          <div className="maintenance-source-title">
            <span className={`maintenance-source-status ${maintenanceSummary?.batchId ? 'is-loaded' : 'is-empty'}`} aria-hidden="true" />
            <div>
              <h2>{maintenanceSummary?.batchId ? 'Soporte de datos activo' : 'Sin archivo cargado'}</h2>
              <strong>{maintenanceSummary?.sourceName ?? 'Carga el export de contadores para habilitar los expedientes.'}</strong>
              <p>{maintenanceSummary?.batchId
                ? `${maintenanceSummary.records.toLocaleString('es-PY')} lecturas · ${maintenanceSummary.equipment.toLocaleString('es-PY')} equipos · ${maintenanceSummary.matchedRecords.toLocaleString('es-PY')} reglas reconocidas`
                : 'El archivo cargado se conserva y se normaliza en la base local.'}</p>
            </div>
          </div>
          <p className="maintenance-source-origin">Origen del XLSX: <code>Superset &gt; SGS - Evaluación de Copias - Rankings</code></p>
        </div>
        <div
          className={`maintenance-source-dropzone${isCounterFileDragging ? ' is-dragging' : ''}`}
          onDragOver={handleCounterDragOver}
          onDragLeave={handleCounterDragLeave}
          onDrop={handleCounterDrop}
          role="group"
          aria-label="Cargar archivo de contadores"
        >
          <div className="maintenance-source-dropzone-copy">
            <strong>{maintenanceSummary?.batchId ? 'Reemplazar archivo activo' : 'Cargar archivo de contadores'}</strong>
            <span>Arrastra aquí el export o selecciona una opción</span>
          </div>
          <div className="maintenance-source-upload-actions">
            <label className="maintenance-source-upload maintenance-source-upload-primary">
              <span>{importingCounters ? 'Importando…' : 'Cargar CSV / XLSX'}</span>
              <input type="file" accept=".csv,text/csv,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={handleCounterFileChange} disabled={importingCounters || clearingImport} />
            </label>
          </div>
          {maintenanceSummary?.batchId ? <div className="maintenance-source-file-actions">
            {maintenanceSummary.sourceFileId ? <a
              className="secondary-button source-data-download-button"
              href={`/api/imports/${encodeURIComponent(maintenanceSummary.batchId)}/files/${encodeURIComponent(maintenanceSummary.sourceFileId)}`}
              download={maintenanceSummary.sourceName ?? undefined}
            >
              Descargar original
            </a> : null}
            <button className="secondary-button maintenance-clear-import-button" type="button" onClick={() => void clearMaintenanceImport()} disabled={clearingImport || importingCounters}>
              {clearingImport ? 'Quitando…' : 'Limpiar datos / nuevo archivo'}
            </button>
          </div> : null}
        </div>
      </section>

      <nav className="maintenance-view-tabs" aria-label="Vistas de mantenimiento">
        <button className={activeMaintenanceView === 'dashboard' ? 'is-active' : ''} type="button" onClick={() => setActiveMaintenanceView('dashboard')}>
          <span>01</span>Tablero resumen
        </button>
        <button className={activeMaintenanceView === 'equipos' ? 'is-active' : ''} type="button" onClick={() => setActiveMaintenanceView('equipos')}>
          <span>02</span>Expedientes técnicos<strong>{visibleAnalyses.length.toLocaleString('es-PY')}</strong>
        </button>
        <button className={activeMaintenanceView === 'modelos' ? 'is-active' : ''} type="button" onClick={() => setActiveMaintenanceView('modelos')}>
          <span>03</span>Límites por modelo<strong>{maintenanceRules.length.toLocaleString('es-PY')}</strong>
        </button>
      </nav>

      <section className="sales-status" aria-live="polite">
        <span className={`status-dot ${error ? 'error' : loading ? 'pending' : 'ready'}`} />
        <span>{error || message || `${customers.length} clientes · ${contractsCount} contratos · ${equipment.length} equipos`}</span>
      </section>

      {activeMaintenanceView === 'dashboard' ? <MaintenanceExecutiveSummary
        analyses={analyses}
        onExport={(subset, kind) => void exportMaintenanceSubset(subset, kind)}
        onPrint={printExecutiveSummary}
      /> : null}

      {activeMaintenanceView === 'equipos' ? <section className="sales-card maintenance-analysis-card">
            <div className="card-heading">
              <div><div className="eyebrow">EXPEDIENTES TÉCNICOS</div><h2>Expedientes técnicos</h2><p className="form-hint">Resumen por equipo, historial de copias y lecturas originales del archivo cargado.</p></div>
              <div className="maintenance-analysis-actions">
                <span className="muted-note">Mostrando {visibleAnalyses.length.toLocaleString('es-PY')} de {analyses.length.toLocaleString('es-PY')} equipos</span>
                <label className="compact-field"><span>Período</span><select value={analysisMonths} onChange={(event) => { const months = Number(event.target.value); setAnalysisMonths(months); void loadAnalyses(months); }}><option value={1}>Último mes</option><option value={3}>Últimos 3 meses</option><option value={6}>Últimos 6 meses</option><option value={12}>Últimos 12 meses</option></select></label>
                <button className="secondary-button" type="button" onClick={() => void printAnalysis()} disabled={visibleAnalyses.length === 0}>Imprimir / PDF</button>
                <button className="primary-button" type="button" onClick={() => void exportAnalysis()} disabled={exportingAnalysis || visibleAnalyses.length === 0}>{exportingAnalysis ? 'Exportando…' : 'Exportar XLSX'}</button>
              </div>
            </div>
            {maintenanceSummary?.batchId ? <p className="analysis-meta">Fuente: <strong>{maintenanceSummary.sourceName}</strong> · {maintenanceSummary.records.toLocaleString('es-PY')} lecturas · {maintenanceSummary.matchedRecords.toLocaleString('es-PY')} modelos reconocidos</p> : null}
            <div className="maintenance-analysis-filters">
              <label className="search-field"><span>Buscar <kbd className="maintenance-search-shortcut">Ctrl/⌘ K</kbd></span><input ref={analysisSearchRef} value={analysisQuery} onChange={(event) => setAnalysisQuery(event.target.value)} placeholder="Buscar por N° de serie…" /></label>
              <label className="search-field"><span>Cliente</span><select value={analysisClient} onChange={(event) => setAnalysisClient(event.target.value)}><option value="">Todos</option>{analysisClients.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
              <label className="search-field"><span>Modelo</span><select value={analysisModel} onChange={(event) => setAnalysisModel(event.target.value)}><option value="">Todos</option>{analysisModels.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
              <label className="search-field"><span>Período</span><select value={analysisPeriod} onChange={(event) => setAnalysisPeriod(event.target.value)}><option value="">Todos</option>{analysisPeriods.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
              <label className="maintenance-normal-toggle"><input type="checkbox" checked={showNormalAnalyses} onChange={(event) => setShowNormalAnalyses(event.target.checked)} /><span>Mostrar equipos en Operación Normal ({analyses.filter((analysis) => analysis.status === 'NORMAL').length.toLocaleString('es-PY')})</span></label>
            </div>
            <div className="catalog-table-wrap">
              <table className="catalog-table operations-table maintenance-table">
                <thead><tr><th>Cliente</th><th>Modelo de equipo</th><th>Nº serie</th><th className="align-right">Prom. copias</th><th className="align-right">Límite desgastado</th><th>Estado</th><th>Acción sugerida</th><th>Acción</th></tr></thead>
                <tbody>
                  {visibleAnalyses.map((analysis) => {
                    const rowKey = `${analysis.serialNumber}::${analysis.modelLabel}`;
                    const isExpanded = expandedAnalysisKey === rowKey;
                    return <Fragment key={rowKey}>
                      <tr className={isExpanded ? 'maintenance-analysis-row is-expanded' : 'maintenance-analysis-row'}>
                        <td>{analysis.customerName || 'Sin cliente'}{analysis.contractReference ? <small className="table-secondary-text">OV {analysis.contractReference}</small> : null}</td>
                        <td><span className="code-cell">{analysis.modelLabel}</span></td>
                        <td className="code-cell">{analysis.serialNumber || 'Sin serie'}</td>
                        <td className="align-right">{Math.round(analysis.averageCopies).toLocaleString('es-PY')}</td>
                        <td className="align-right">{Math.round(analysis.optimalMonthly).toLocaleString('es-PY')} <small className="table-secondary-text inline-muted">({Math.round(analysis.appliedWaste * 100)}%)</small></td>
                        <td><span className={`badge ${maintenanceStatusClass(analysis.status)}`}>{analysis.status}</span></td>
                        <td className="action-cell" title={analysis.recommendedAction}>{analysis.recommendedAction}</td>
                        <td><button className={isExpanded ? 'maintenance-inspector-button is-open' : 'maintenance-inspector-button'} type="button" onClick={() => setExpandedAnalysisKey(isExpanded ? null : rowKey)}>{isExpanded ? 'Cerrar X' : 'Inspector'}</button></td>
                      </tr>
                      {isExpanded ? <MaintenanceInspectionRow analysis={analysis} onPrint={() => printSingleAnalysis(analysis)} /> : null}
                    </Fragment>;
                  })}
                  {visibleAnalyses.length === 0 && <tr><td colSpan={8} className="empty-cell">{maintenanceSummary?.batchId ? 'No hay equipos para el filtro seleccionado.' : 'Importa un archivo CSV o XLSX de contadores para comenzar.'}</td></tr>}
                </tbody>
              </table>
            </div>
          </section> : null}

      {activeMaintenanceView === 'modelos' ? <MaintenanceRulesPanel
        rules={maintenanceRules}
        disabled={loading || importingCounters || clearingImport}
        onChanged={(nextMessage) => { setMessage(nextMessage); void refresh(); }}
        onError={(nextError) => setError(nextError)}
      /> : null}

      {printableAnalysis ? <MaintenancePrintReport analysis={printableAnalysis} sourceName={maintenanceSummary?.sourceName ?? null} /> : null}
      {printableExecutiveSummary ? <MaintenanceExecutivePrintReport analyses={analyses} sourceName={maintenanceSummary?.sourceName ?? null} analysisMonths={analysisMonths} /> : null}
    </div>
  );
}

function MaintenanceInspectionRow({ analysis, onPrint }: { analysis: MaintenanceAnalysis; onPrint: () => void }) {
  const wearRatio = analysis.maxWaste > 0 ? analysis.appliedWaste / analysis.maxWaste : 0;
  const sourceDetails = uniqueMaintenanceSourceDetails(analysis);

  return <tr className="maintenance-inspection-row">
    <td colSpan={8}>
      <div className="maintenance-inspection-grid">
        <div className="maintenance-inspection-overview">
          <div className="maintenance-wear-summary">
            <MaintenanceWearGauge ratio={wearRatio} status={analysis.status} />
            <div>
              <div className="maintenance-inspection-label">Desgaste de ingeniería</div>
              <div className="maintenance-inspection-copy">Merma aplicada / merma máxima configurada</div>
              <div className="maintenance-inspection-copy">Último contador: {analysis.latestCounter.toLocaleString('es-PY')}</div>
            </div>
          </div>
          <h4>Historial de volumen mensual (copias)</h4>
          <MaintenanceHistoryChart analysis={analysis} />
          <p className="maintenance-inspection-note">La línea discontinua naranja señala el límite mensual ajustado por desgaste.</p>
        </div>

        <div className="maintenance-inspection-readings">
          <h4>Lecturas de base de datos</h4>
          <div className="maintenance-readings-table-wrap">
            <table className="maintenance-readings-table">
              <thead><tr><th>Mes período</th><th className="align-right">Copias registradas</th><th className="align-right">Contador total</th><th className="align-right">Óptimo desgastado</th><th className="align-right">Ratio (cargado)</th></tr></thead>
              <tbody>{analysis.periods.map((period, index) => {
                const isOver = period.ratio > 1;
                return <tr key={`${period.period}-${index}`}>
                  <td>{period.period}</td>
                  <td className="align-right">{period.copies.toLocaleString('es-PY')}</td>
                  <td className="align-right">{period.counter.toLocaleString('es-PY')}</td>
                  <td className="align-right">{period.optimalMonthly.toLocaleString('es-PY')}</td>
                  <td className={isOver ? 'align-right is-over' : 'align-right'}>{period.ratio.toFixed(2)}{isOver ? ' ⚠️' : ''}</td>
                </tr>;
              })}</tbody>
            </table>
          </div>
          {sourceDetails.length > 0 ? <p className="maintenance-inspection-source">Origen: {sourceDetails.join(' · ')}</p> : null}
          <div className="maintenance-inspection-actions">
            <button className="primary-button" type="button" onClick={onPrint}>Descargar informe técnico PDF</button>
          </div>
        </div>
      </div>
    </td>
  </tr>;
}

function MaintenanceWearGauge({ ratio, status }: { ratio: number; status: MaintenanceAnalysis['status'] }) {
  const size = 68;
  const stroke = 6;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const arcLength = circumference * 0.75;
  const progress = Math.min(Math.max(ratio, 0), 1);
  const tone = status === 'CRÍTICO' ? 'critical' : status === 'ATENCIÓN' ? 'attention' : status === 'NO_RECONOCIDO' ? 'unrecognized' : 'normal';

  return <div className={`maintenance-wear-gauge ${tone}`} role="img" aria-label={`Desgaste de ingeniería: ${Math.round(ratio * 100)}%`}>
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="currentColor" strokeOpacity="0.16" strokeWidth={stroke} strokeDasharray={`${arcLength} ${circumference}`} transform={`rotate(135 ${size / 2} ${size / 2})`} />
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeDasharray={arcLength} strokeDashoffset={arcLength - arcLength * progress} transform={`rotate(135 ${size / 2} ${size / 2})`} />
    </svg>
    <span>{Math.round(ratio * 100)}%</span>
  </div>;
}

function MaintenanceHistoryChart({ analysis }: { analysis: MaintenanceAnalysis }) {
  if (analysis.periods.length < 2) return <div className="maintenance-history-chart-empty">Sin historial suficiente para graficar.</div>;

  const width = 340;
  const height = 82;
  const padding = 12;
  const maxValue = Math.max(...analysis.periods.map((period) => period.copies), analysis.optimalMonthly, 1);
  const pointFor = (value: number, index: number) => {
    const x = padding + (index / (analysis.periods.length - 1)) * (width - padding * 2);
    const y = height - padding - (value / maxValue) * (height - padding * 2);
    return `${x},${y}`;
  };
  const points = analysis.periods.map((period, index) => pointFor(period.copies, index)).join(' ');
  const limitY = height - padding - (analysis.optimalMonthly / maxValue) * (height - padding * 2);

  return <svg className="maintenance-history-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Historial mensual de copias y límite desgastado">
    <line x1={padding} y1={limitY} x2={width - padding} y2={limitY} />
    <text x={padding} y={Math.max(limitY - 4, 9)}>Límite desgastado dinámico</text>
    <polyline points={points} />
    {analysis.periods.map((period, index) => {
      const [x, y] = pointFor(period.copies, index).split(',');
      return <circle key={`${period.period}-${index}`} cx={x} cy={y} r="2.8" />;
    })}
  </svg>;
}

function MaintenancePrintReport({ analysis, sourceName }: { analysis: MaintenanceAnalysis; sourceName: string | null }) {
  return (
    <section className="maintenance-print-report" aria-label="Informe técnico de mantenimiento">
      <div className="eyebrow">DATA SYSTEMS / INFORME TÉCNICO</div>
      <h1>Diagnóstico de mantenimiento</h1>
      <p className="maintenance-print-report-meta">Fuente: {sourceName ?? 'Base compartida'} · Generado localmente</p>

      <div className="maintenance-print-facts">
        <div><span>Cliente</span><strong>{analysis.customerName || 'Sin cliente'}</strong></div>
        <div><span>Modelo</span><strong>{analysis.modelLabel}</strong></div>
        <div><span>Número de serie</span><strong>{analysis.serialNumber || 'Sin serie'}</strong></div>
        <div><span>Contrato / OV</span><strong>{analysis.contractReference || 'Sin referencia'}</strong></div>
        <div><span>Estado</span><strong>{analysis.status}</strong></div>
        <div><span>Acción recomendada</span><strong>{analysis.recommendedAction}</strong></div>
      </div>

      <div className="maintenance-print-kpis">
        <div><span>Promedio de copias</span><strong>{Math.round(analysis.averageCopies).toLocaleString('es-PY')}</strong></div>
        <div><span>Óptimo actual</span><strong>{Math.round(analysis.optimalMonthly).toLocaleString('es-PY')}</strong></div>
        <div><span>Último contador</span><strong>{analysis.latestCounter.toLocaleString('es-PY')}</strong></div>
        <div><span>Ratio</span><strong>{analysis.ratio.toFixed(2)}</strong></div>
      </div>

      <h2>Lecturas por período</h2>
      <table className="maintenance-print-table">
        <thead><tr><th>Período</th><th>Papel</th><th className="align-right">Copias</th><th className="align-right">Contador</th><th className="align-right">Óptimo</th><th className="align-right">Ratio</th><th>Estado</th><th>Origen</th></tr></thead>
        <tbody>{analysis.periods.map((period, index) => <tr key={`${period.period}-${index}`}>
          <td>{period.period}</td>
          <td>{period.paperType || '—'}</td>
          <td className="align-right">{period.copies.toLocaleString('es-PY')}</td>
          <td className="align-right">{period.counter.toLocaleString('es-PY')}</td>
          <td className="align-right">{period.optimalMonthly.toLocaleString('es-PY')}</td>
          <td className="align-right">{period.ratio.toFixed(2)}</td>
          <td>{period.status}</td>
          <td>{period.sourceSheetName ? `${period.sourceSheetName} · fila ${period.sourceRowNumber ?? 0}` : 'Sin origen'}</td>
        </tr>)}</tbody>
      </table>

      <div className="maintenance-print-source-details">
        <h2>Campos de origen</h2>
        <p>{uniqueMaintenanceSourceDetails(analysis).join(' · ') || 'No hay campos adicionales de origen para este equipo.'}</p>
      </div>
    </section>
  );
}

function uniqueMaintenanceSourceDetails(analysis: MaintenanceAnalysis): string[] {
  const values = new Set<string>();
  analysis.periods.forEach((period) => {
    (period.sourceDetails ?? []).forEach((detail) => {
      const value = `${detail.label}: ${detail.value}`.trim();
      if (value !== ':') values.add(value);
    });
  });
  return [...values];
}

function toFileSafeName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 72) || 'equipo';
}

async function readJson<T>(response: Response): Promise<T> {
  const body = (await response.json()) as T | { error?: string };
  if (!response.ok) {
    const error = typeof body === 'object' && body !== null && 'error' in body && typeof body.error === 'string'
      ? body.error
      : 'La API local devolvió un error.';
    throw new Error(error);
  }
  return body as T;
}

function toErrorMessage(value: unknown): string {
  return value instanceof Error ? value.message : 'No se pudo completar la operación.';
}

function maintenanceStatusClass(status: MaintenanceAnalysis['status']): string {
  if (status === 'CRÍTICO') return 'alert';
  if (status === 'ATENCIÓN') return 'warning';
  if (status === 'NORMAL') return 'ok';
  return 'neutral';
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}
