import { FileText, LayoutDashboard, Settings, TriangleAlert } from 'lucide-react';
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
import MaintenanceTablePrintReport, { type MaintenanceTablePrintReportProps } from '../mantenimiento/MaintenanceTablePrintReport';
import { maintenanceAnalysisMatchesSearch } from '../mantenimiento/search';
import { confirmAction } from '../../core/confirm';
import AnimatedTabs from '../../core/AnimatedTabs';
import { readJson, toErrorMessage } from '../../core/http';
import { UploadButton, ExportButton, DownloadIcon, PrintButton } from '../../core/ActionButtons';
import { cn } from '../../core/cn';
import { toFileSafeName } from './file-name';
import { PageHeader } from '../../core/ui/page-header';
import { Card, CardHeader, Muted } from '../../core/ui/card';
import { formatLoadedAt } from '../../core/loaded-at';
import { Button, buttonVariants } from '../../core/ui/button';
import { Input } from '../../core/ui/input';
import { Badge, type BadgeTone } from '../../core/ui/badge';
import { StatusLine } from '../../core/ui/status-line';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../core/ui/table';

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

const cardClass = 'min-w-0 grid-cols-1 [overflow-wrap:anywhere]';
const fieldClass = 'grid min-w-0 gap-2 text-sm font-semibold text-navy dark:text-white';
const selectClass = 'h-10 w-full min-w-0 rounded-xl border border-navy/20 bg-white px-3 text-sm text-navy focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky disabled:opacity-50 dark:border-sky/30 dark:bg-navy/50 dark:text-white';
const analysisMonths = 3;

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
  const [activeMaintenanceView, setActiveMaintenanceView] = useState<MaintenanceView>('dashboard');
  const analysisSearchRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(true);
  const [importingCounters, setImportingCounters] = useState(false);
  const [isCounterFileDragging, setIsCounterFileDragging] = useState(false);
  const [clearingImport, setClearingImport] = useState(false);
  const [exportingAnalysis, setExportingAnalysis] = useState(false);
  const [printableAnalysis, setPrintableAnalysis] = useState<MaintenanceAnalysis | null>(null);
  const [printableExecutiveSummary, setPrintableExecutiveSummary] = useState(false);
  const [printableTable, setPrintableTable] = useState<MaintenanceTablePrintReportProps | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void refresh();
  }, []);

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      // Ctrl/⌘ K pertenece a la paleta global; aquí "/" enfoca la búsqueda.
      const target = event.target as HTMLElement | null;
      if (event.key !== '/' || event.ctrlKey || event.metaKey || event.altKey) return;
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;
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

  useEffect(() => {
    if (!printableTable) return;
    document.body.dataset.printMode = 'maintenance-table';
    let cancelled = false;
    const printReport = async () => {
      await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
      try {
        const saved = await printOrSaveCurrentPageAsPdf(
          `mantenimiento-${toFileSafeName(printableTable.sourceName ?? 'reporte')}`,
          { landscape: true },
        );
        if (!cancelled && saved) {
          setMessage(saved.saved ? `PDF guardado: ${saved.filePath ?? 'archivo seleccionado'}.` : 'Guardado de PDF cancelado.');
        }
      } catch (printError: unknown) {
        if (!cancelled) setError(toErrorMessage(printError));
      } finally {
        if (!cancelled) setPrintableTable(null);
      }
    };
    void printReport();
    return () => {
      cancelled = true;
      if (document.body.dataset.printMode === 'maintenance-table') delete document.body.dataset.printMode;
    };
  }, [printableTable]);

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
        fetch('/api/maintenance/analysis'),
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

  const printing = printableTable !== null || printableAnalysis !== null || printableExecutiveSummary;

  function printAnalysis() {
    if (visibleAnalyses.length === 0) return;
    setError(null);
    setPrintableTable({
      analyses: visibleAnalyses,
      sourceName: maintenanceSummary?.sourceName ?? null,
      analysisMonths,
    });
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
    <div className="page-content maintenance-page grid min-w-0 grid-cols-1 gap-6 [overflow-wrap:anywhere]">
      <PageHeader
        eyebrow="SERVICIO TÉCNICO / BASE INSTALADA"
        title="Gestor de mantenimiento"
        lead="Estado del parque instalado según las lecturas de contadores: expedientes por equipo y límites por modelo."
        actions={<Button variant="outline" onClick={() => void refresh()} disabled={loading || clearingImport}>{loading ? 'Actualizando…' : 'Actualizar'}</Button>}
      />

      <Card className={cardClass} aria-label="Fuente de contadores">
        <CardHeader
          eyebrow="Soporte de datos"
          title={maintenanceSummary?.batchId ? 'Soporte de datos activo' : 'Sin archivo cargado'}
          aside={<Badge tone={maintenanceSummary?.batchId ? 'success' : 'warning'}>{maintenanceSummary?.batchId ? 'Cargado' : 'Pendiente'}</Badge>}
        />
        <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="grid min-w-0 content-start gap-2">
            <div className="font-semibold text-navy dark:text-white">{maintenanceSummary?.sourceName ?? 'Carga el export de contadores para habilitar los expedientes.'}</div>
            <Muted className="text-sm">{maintenanceSummary?.batchId
              ? `${maintenanceSummary.records.toLocaleString('es-PY')} lecturas · ${maintenanceSummary.equipment.toLocaleString('es-PY')} equipos · ${maintenanceSummary.matchedRecords.toLocaleString('es-PY')} reglas reconocidas`
              : 'El archivo cargado se conserva y se normaliza en la base local.'}</Muted>
            {formatLoadedAt(maintenanceSummary?.importedAt) ? <Muted className="text-sm">{formatLoadedAt(maintenanceSummary?.importedAt)}</Muted> : null}
            <Muted>Origen del XLSX: <code>Superset &gt; SGS - Evolución de Copias - Rankings</code></Muted>
          </div>
          <div
            className={cn('grid min-w-0 content-start gap-3 rounded-xl border border-dashed p-4', isCounterFileDragging ? 'border-sky bg-sky/10' : 'border-navy/25 bg-paper dark:border-sky/30 dark:bg-navy/30')}
            onDragOver={handleCounterDragOver}
            onDragLeave={handleCounterDragLeave}
            onDrop={handleCounterDrop}
            role="group"
            aria-label="Cargar archivo de contadores"
          >
            <div className="grid gap-1">
              <div className="text-sm font-bold text-navy dark:text-white">{maintenanceSummary?.batchId ? 'Reemplazar archivo activo' : 'Cargar archivo de contadores'}</div>
              <Muted>Arrastra aquí el export o selecciona una opción</Muted>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <UploadButton busy={importingCounters} label="Cargar CSV / XLSX" accept=".csv,text/csv,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={handleCounterFileChange} disabled={clearingImport} />
              {maintenanceSummary?.batchId && maintenanceSummary.sourceFileId ? <a
                className={cn(buttonVariants({ variant: 'export' }), 'export-button')}
                href={`/api/imports/${encodeURIComponent(maintenanceSummary.batchId)}/files/${encodeURIComponent(maintenanceSummary.sourceFileId)}`}
                download={maintenanceSummary.sourceName ?? undefined}
              >
                <DownloadIcon />
                Descargar original
              </a> : null}
              {maintenanceSummary?.batchId ? <Button variant="outline" onClick={() => void clearMaintenanceImport()} disabled={clearingImport || importingCounters}>
                {clearingImport ? 'Quitando…' : 'Limpiar datos / nuevo archivo'}
              </Button> : null}
            </div>
          </div>
        </div>
      </Card>

      <AnimatedTabs
        ariaLabel="Vistas de mantenimiento"
        active={activeMaintenanceView}
        onChange={setActiveMaintenanceView}
        tabs={[
          { id: 'dashboard', label: 'Tablero resumen', icon: LayoutDashboard },
          { id: 'equipos', label: 'Expedientes técnicos', icon: FileText, count: visibleAnalyses.length.toLocaleString('es-PY') },
          { id: 'modelos', label: 'Límites por modelo', icon: Settings, count: maintenanceRules.length.toLocaleString('es-PY') },
        ]}
      />

      <StatusLine state={error ? 'error' : loading ? 'pending' : 'ready'}>{error || message || `${customers.length} clientes · ${contractsCount} contratos · ${equipment.length} equipos`}</StatusLine>

      {activeMaintenanceView === 'dashboard' ? <MaintenanceExecutiveSummary
        analyses={analyses}
        onExport={(subset, kind) => void exportMaintenanceSubset(subset, kind)}
        onPrint={printExecutiveSummary}
        exporting={exportingAnalysis}
        printing={printing}
      /> : null}

      {activeMaintenanceView === 'equipos' ? <Card className={cardClass}>
        <CardHeader
          eyebrow="Expedientes técnicos"
          title="Expedientes técnicos"
          aside={<div className="flex flex-wrap items-end gap-2">
            <div className="grid gap-1 text-xs font-semibold text-navy dark:text-white">
              <span>Período de cálculo</span>
              <span className="flex h-10 items-center text-sm">Últimos 3 meses</span>
            </div>
            <PrintButton busy={printing} onClick={() => void printAnalysis()} disabled={visibleAnalyses.length === 0} />
            <ExportButton busy={exportingAnalysis} onClick={() => void exportAnalysis()} disabled={visibleAnalyses.length === 0}>Exportar XLSX</ExportButton>
          </div>}
        />
        <Muted className="text-sm">Resumen por equipo, historial de copias y lecturas originales del archivo cargado. Mostrando {visibleAnalyses.length.toLocaleString('es-PY')} de {analyses.length.toLocaleString('es-PY')} equipos.</Muted>
        {maintenanceSummary?.batchId ? <Muted className="text-sm">Fuente: <strong>{maintenanceSummary.sourceName}</strong> · {maintenanceSummary.records.toLocaleString('es-PY')} lecturas · {maintenanceSummary.matchedRecords.toLocaleString('es-PY')} modelos reconocidos</Muted> : null}
        <div className="grid min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,12rem),1fr))] items-end gap-4">
          <label className={fieldClass}>
            <span className="flex items-center gap-2">Buscar <kbd className="rounded border border-navy/25 px-1.5 text-[0.7rem] font-semibold dark:border-sky/40">/</kbd></span>
            <Input ref={analysisSearchRef} value={analysisQuery} onChange={(event) => setAnalysisQuery(event.target.value)} placeholder="Buscar por N° de serie…" />
          </label>
          <label className={fieldClass}>Cliente<select className={selectClass} value={analysisClient} onChange={(event) => setAnalysisClient(event.target.value)}><option value="">Todos</option>{analysisClients.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
          <label className={fieldClass}>Modelo<select className={selectClass} value={analysisModel} onChange={(event) => setAnalysisModel(event.target.value)}><option value="">Todos</option>{analysisModels.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
          <label className={fieldClass}>Período<select className={selectClass} value={analysisPeriod} onChange={(event) => setAnalysisPeriod(event.target.value)}><option value="">Todos</option>{analysisPeriods.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
          <label className="flex min-h-10 min-w-0 items-center gap-2 text-sm text-navy dark:text-white"><input className="size-4 shrink-0 accent-sky" type="checkbox" checked={showNormalAnalyses} onChange={(event) => setShowNormalAnalyses(event.target.checked)} /><span>Mostrar equipos en Operación Normal ({analyses.filter((analysis) => analysis.status === 'NORMAL').length.toLocaleString('es-PY')})</span></label>
        </div>
        <Table className="min-w-[48rem] [overflow-wrap:normal]" wrapperClassName="@container">
          <TableHeader><TableRow><TableHead>Cliente</TableHead><TableHead>Modelo de equipo</TableHead><TableHead>Nº serie</TableHead><TableHead className="text-right">Prom. copias</TableHead><TableHead className="text-right">Límite desgastado</TableHead><TableHead>Estado</TableHead><TableHead>Acción sugerida</TableHead><TableHead>Acción</TableHead></TableRow></TableHeader>
          <TableBody>
            {visibleAnalyses.map((analysis) => {
              const rowKey = `${analysis.serialNumber}::${analysis.modelLabel}`;
              const isExpanded = expandedAnalysisKey === rowKey;
              return <Fragment key={rowKey}>
                <TableRow className={isExpanded ? 'bg-sky/10' : undefined}>
                  <TableCell className="min-w-[8rem]">{analysis.customerName || 'Sin cliente'}{analysis.contractReference ? <Muted className="mt-1">OV {analysis.contractReference}</Muted> : null}</TableCell>
                  <TableCell className="font-mono text-xs">{analysis.modelLabel}</TableCell>
                  <TableCell className="whitespace-nowrap font-mono text-xs">{analysis.serialNumber || 'Sin serie'}</TableCell>
                  <TableCell className="text-right tabular-nums">{Math.round(analysis.averageCopies).toLocaleString('es-PY')}</TableCell>
                  <TableCell className="text-right tabular-nums">{Math.round(analysis.optimalMonthly).toLocaleString('es-PY')} <span className="text-xs">({Math.round(analysis.appliedWaste * 100)}%)</span></TableCell>
                  <TableCell><Badge className="whitespace-nowrap" tone={maintenanceStatusTone(analysis.status)}>{analysis.status}</Badge></TableCell>
                  <TableCell className="min-w-[10rem] max-w-[16rem]" title={analysis.recommendedAction}>{analysis.recommendedAction}</TableCell>
                  <TableCell><Button variant="outline" size="sm" aria-expanded={isExpanded} onClick={() => setExpandedAnalysisKey(isExpanded ? null : rowKey)}>{isExpanded ? 'Cerrar' : 'Inspector'}</Button></TableCell>
                </TableRow>
                {isExpanded ? <MaintenanceInspectionRow analysis={analysis} onPrint={() => printSingleAnalysis(analysis)} /> : null}
              </Fragment>;
            })}
            {visibleAnalyses.length === 0 && <TableRow><TableCell colSpan={8} className="py-8 text-center">{maintenanceSummary?.batchId ? 'No hay equipos para el filtro seleccionado.' : 'Importa un archivo CSV o XLSX de contadores para comenzar.'}</TableCell></TableRow>}
          </TableBody>
        </Table>
      </Card> : null}

      {activeMaintenanceView === 'modelos' ? <MaintenanceRulesPanel
        rules={maintenanceRules}
        disabled={loading || importingCounters || clearingImport}
        onChanged={(nextMessage) => { setMessage(nextMessage); void refresh(); }}
        onError={(nextError) => setError(nextError)}
      /> : null}

      {printableAnalysis ? <MaintenancePrintReport analysis={printableAnalysis} sourceName={maintenanceSummary?.sourceName ?? null} /> : null}
      {printableExecutiveSummary ? <MaintenanceExecutivePrintReport analyses={analyses} sourceName={maintenanceSummary?.sourceName ?? null} analysisMonths={analysisMonths} /> : null}
      {printableTable ? <MaintenanceTablePrintReport {...printableTable} /> : null}
    </div>
  );
}

function MaintenanceInspectionRow({ analysis, onPrint }: { analysis: MaintenanceAnalysis; onPrint: () => void }) {
  const wearRatio = analysis.maxWaste > 0 ? analysis.appliedWaste / analysis.maxWaste : 0;
  const sourceDetails = uniqueMaintenanceSourceDetails(analysis);

  return <TableRow className="bg-paper hover:bg-paper dark:bg-navy/30">
    <TableCell colSpan={8} className="p-0">
      {/* sticky + 100cqw: el inspector ocupa el ancho visible de la tarjeta aunque la tabla desplace en horizontal */}
      <div className="sticky left-0 box-border w-[100cqw] max-w-full p-4 [overflow-wrap:anywhere]"><div className="@container min-w-0"><div className="grid min-w-0 gap-6 @[56rem]:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <div className="grid min-w-0 content-start gap-3">
          <div className="flex items-center gap-4">
            <MaintenanceWearGauge ratio={wearRatio} status={analysis.status} />
            <div className="grid gap-1">
              <div className="text-sm font-bold text-navy dark:text-white">Desgaste de ingeniería</div>
              <Muted>Merma aplicada / merma máxima configurada</Muted>
              <Muted>Último contador: {analysis.latestCounter.toLocaleString('es-PY')}</Muted>
            </div>
          </div>
          <h4 className="m-0 text-sm font-bold text-navy dark:text-white">Historial de volumen mensual (copias)</h4>
          <MaintenanceHistoryChart analysis={analysis} />
          <Muted>La línea discontinua naranja señala el límite mensual ajustado por desgaste.</Muted>
        </div>

        <div className="grid min-w-0 content-start gap-3">
          <h4 className="m-0 text-sm font-bold text-navy dark:text-white">Lecturas de base de datos</h4>
          <Table className="min-w-[30rem]" wrapperClassName="max-h-72">
            <TableHeader><TableRow><TableHead>Mes período</TableHead><TableHead className="text-right">Copias registradas</TableHead><TableHead className="text-right">Contador total</TableHead><TableHead className="text-right">Óptimo desgastado</TableHead><TableHead className="text-right">Ratio (cargado)</TableHead></TableRow></TableHeader>
            <TableBody>{analysis.periods.map((period, index) => {
              const isOver = period.ratio > 1;
              return <TableRow key={`${period.period}-${index}`}>
                <TableCell>{period.period}</TableCell>
                <TableCell className="text-right tabular-nums">{period.copies.toLocaleString('es-PY')}</TableCell>
                <TableCell className="text-right tabular-nums">{period.counter.toLocaleString('es-PY')}</TableCell>
                <TableCell className="text-right tabular-nums">{period.optimalMonthly.toLocaleString('es-PY')}</TableCell>
                <TableCell className={cn('text-right tabular-nums', isOver && 'font-bold text-status-danger-ink! dark:text-status-danger-ink-dark!')}>{period.ratio.toFixed(2)}{isOver ? <> <TriangleAlert className="inline" size={14} aria-label="Excede el límite" /></> : null}</TableCell>
              </TableRow>;
            })}</TableBody>
          </Table>
          {sourceDetails.length > 0 ? <Muted>Origen: {sourceDetails.join(' · ')}</Muted> : null}
          <div><ExportButton onClick={onPrint}>Descargar informe técnico PDF</ExportButton></div>
        </div>
      </div></div></div>
    </TableCell>
  </TableRow>;
}

const gaugeTone: Record<string, string> = {
  critical: 'text-status-danger',
  attention: 'text-status-warn',
  unrecognized: 'text-[#6b5bd6] dark:text-[#b9afff]',
  normal: 'text-status-ok',
};

function MaintenanceWearGauge({ ratio, status }: { ratio: number; status: MaintenanceAnalysis['status'] }) {
  const size = 68;
  const stroke = 6;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const arcLength = circumference * 0.75;
  const progress = Math.min(Math.max(ratio, 0), 1);
  const tone = status === 'CRÍTICO' ? 'critical' : status === 'ATENCIÓN' ? 'attention' : status === 'NO_RECONOCIDO' ? 'unrecognized' : 'normal';

  return <div className={cn('relative grid size-[68px] shrink-0 place-items-center', gaugeTone[tone])} role="img" aria-label={`Desgaste de ingeniería: ${Math.round(ratio * 100)}%`}>
    <svg className="absolute inset-0" width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="currentColor" strokeOpacity="0.16" strokeWidth={stroke} strokeDasharray={`${arcLength} ${circumference}`} transform={`rotate(135 ${size / 2} ${size / 2})`} />
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeDasharray={arcLength} strokeDashoffset={arcLength - arcLength * progress} transform={`rotate(135 ${size / 2} ${size / 2})`} />
    </svg>
    <div className="text-sm font-bold text-navy dark:text-white">{Math.round(ratio * 100)}%</div>
  </div>;
}

function MaintenanceHistoryChart({ analysis }: { analysis: MaintenanceAnalysis }) {
  if (analysis.periods.length < 2) return <Muted className="rounded-xl border border-dashed border-navy/20 p-4 text-center dark:border-sky/30">Sin historial suficiente para graficar.</Muted>;

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

  return <svg className="h-auto w-full max-w-[28rem] text-sky" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Historial mensual de copias y límite desgastado">
    <line x1={padding} y1={limitY} x2={width - padding} y2={limitY} stroke="#ff6b00" strokeWidth="1.5" strokeDasharray="5 4" />
    <text className="fill-ink-2 dark:fill-[#9fb2d1]" x={width - padding} y={Math.min(limitY + 11, height - 2)} fontSize="9" textAnchor="end">Límite desgastado dinámico</text>
    <polyline points={points} fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
    {analysis.periods.map((period, index) => {
      const [x, y] = pointFor(period.copies, index).split(',');
      return <circle key={`${period.period}-${index}`} cx={x} cy={y} r="2.8" fill="currentColor" />;
    })}
  </svg>;
}

function MaintenancePrintReport({ analysis, sourceName }: { analysis: MaintenanceAnalysis; sourceName: string | null }) {
  return (
    <section className="maintenance-print-report" aria-label="Informe técnico de mantenimiento">
      <div className="eyebrow">DATA SYSTEMS / GESTOR DE MANTENIMIENTO</div>
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

function maintenanceStatusTone(status: MaintenanceAnalysis['status']): BadgeTone {
  if (status === 'CRÍTICO') return 'danger';
  if (status === 'ATENCIÓN') return 'warning';
  if (status === 'NORMAL') return 'success';
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
