import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { printOrSaveCurrentPageAsPdf } from '../../core/print';
import {
  cloneUniflowPriceCatalog,
  DEFAULT_UNIFLOW_PRICE_CATALOG,
  normalizeUniflowText,
  UNIFLOW_DEVICE_MODELS,
} from './catalog';
import { exportUniflowExcel } from './export';
import { calculateUniflowConfiguration, getUniflowNextTierUpgrade } from './pricing';
import UniflowPrintReport from './UniflowPrintReport';
import type {
  UniflowAddedDevice,
  UniflowConfigurationSummary,
  UniflowPriceCatalog,
  UniflowPriceTabId,
  UniflowSku,
} from './types';
import { UNIFLOW_PRICE_TABS } from './types';
import { confirmAction } from '../../core/confirm';
import { useUnsavedChanges } from '../../core/unsavedChanges';
import { readJson, toErrorMessage } from '../../core/http';
import { ExportButton, PrintButton } from '../../core/ActionButtons';
import { useBusy } from '../../core/useBusy';
import { Calculator, ChevronDown, Copy, Minus, Plus, RotateCcw, Save, Trash2 } from 'lucide-react';
import { Badge } from '../../core/ui/badge';
import { Button } from '../../core/ui/button';
import { Card, CardHeader, Muted } from '../../core/ui/card';
import { Input } from '../../core/ui/input';
import { PageHeader } from '../../core/ui/page-header';
import { StatusLine } from '../../core/ui/status-line';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../core/ui/table';

const INITIAL_DEVICE: UniflowAddedDevice = { id: 'row-1', modelName: '', quantity: 1, withCIP: false };
const PRICE_TAB_LABELS: Record<UniflowPriceTabId, string> = {
  t1: 'CPS T1',
  t2: 'CPS T2',
  t1_cip: 'CIP T1',
  t2_cip: 'CIP T2',
};
const STANDARD_CONTRACT_TERMS = [12, 24, 36, 48, 60];
const numberFormat = new Intl.NumberFormat('es-PY', { maximumFractionDigits: 0 });
const usdFormat = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 });

type PrintableUniflowReport = {
  results: UniflowConfigurationSummary;
  clientName: string;
};

export default function UniflowModule() {
  const [catalog, setCatalog] = useState<UniflowPriceCatalog | null>(null);
  const [priceDraft, setPriceDraft] = useState<UniflowPriceCatalog | null>(null);
  const priceDraftDirty = priceDraft !== null && JSON.stringify(priceDraft) !== JSON.stringify(catalog);
  useUnsavedChanges(priceDraftDirty);
  const [devices, setDevices] = useState<UniflowAddedDevice[]>([{ ...INITIAL_DEVICE }]);
  const [months, setMonths] = useState(36);
  const [clientName, setClientName] = useState('');
  const [activePriceTab, setActivePriceTab] = useState<UniflowPriceTabId>('t1');
  const [calculated, setCalculated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [printableReport, setPrintableReport] = useState<PrintableUniflowReport | null>(null);

  useEffect(() => {
    void loadCatalog();
  }, []);

  useEffect(() => {
    if (!printableReport) {
      if (document.body.dataset.printMode === 'uniflow-report') {
        delete document.body.dataset.printMode;
      }
      return;
    }

    document.body.dataset.printMode = 'uniflow-report';
    let cancelled = false;
    const printReport = async () => {
      await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
      try {
        const saved = await printOrSaveCurrentPageAsPdf(
          `configuracion-uniflow-${printableReport.clientName.trim() || 'reporte'}`,
        );
        if (!cancelled) {
          setMessage(saved === null
            ? 'Diálogo de impresión abierto.'
            : saved.saved
              ? `PDF guardado: ${saved.filePath ?? 'archivo seleccionado'}.`
              : 'Guardado de PDF cancelado.');
        }
      } catch (printError: unknown) {
        if (!cancelled) setError(toErrorMessage(printError));
      } finally {
        if (!cancelled) setPrintableReport(null);
      }
    };

    void printReport();
    return () => {
      cancelled = true;
      if (document.body.dataset.printMode === 'uniflow-report') {
        delete document.body.dataset.printMode;
      }
    };
  }, [printableReport]);

  const results = useMemo(
    () => catalog && calculated ? calculateUniflowConfiguration(devices, months, catalog) : null,
    [calculated, catalog, devices, months],
  );

  async function loadCatalog() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/uniflow/catalog');
      const loaded = await readJson<UniflowPriceCatalog>(response);
      setCatalog(loaded);
      setPriceDraft(cloneUniflowPriceCatalog(loaded));
    } catch (requestError: unknown) {
      setError(toErrorMessage(requestError));
    } finally {
      setLoading(false);
    }
  }

  function updateDevice(id: string, patch: Partial<UniflowAddedDevice>) {
    setDevices((current) => current.map((device) => device.id === id ? { ...device, ...patch } : device));
    setCalculated(false);
  }

  function updateDeviceQuantity(id: string, value: number) {
    const quantity = Number.isFinite(value) ? Math.max(1, Math.floor(value)) : 1;
    updateDevice(id, { quantity });
  }

  function addDevice() {
    setDevices((current) => [...current, { id: `row-${Date.now()}-${current.length + 1}`, modelName: '', quantity: 1, withCIP: false }]);
  }

  function removeDevice(id: string) {
    setDevices((current) => current.length === 1 ? [{ ...INITIAL_DEVICE }] : current.filter((device) => device.id !== id));
    setCalculated(false);
  }

  function resetConfiguration() {
    setDevices([{ ...INITIAL_DEVICE }]);
    setMonths(36);
    setClientName('');
    setCalculated(false);
    setMessage('Configuración reiniciada.');
    setError(null);
  }

  function calculate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!Number.isInteger(months) || months < 1) {
      setError('Los meses de contrato deben ser un entero mayor que cero.');
      return;
    }
    if (!devices.some((device) => device.modelName)) {
      setError('Selecciona por lo menos un modelo Canon.');
      return;
    }
    setError(null);
    setMessage('Configuración calculada con el catálogo local.');
    setCalculated(true);
  }

  function updatePrice(tab: UniflowPriceTabId, index: number, field: 'sku' | 'price', value: string) {
    setPriceDraft((current) => {
      if (!current) return current;
      const list = current.lists[tab].map((item, itemIndex) => itemIndex === index
        ? { ...item, [field]: field === 'price' ? Number(value) || 0 : value }
        : item);
      return { ...current, lists: { ...current.lists, [tab]: list } };
    });
  }

  async function savePrices() {
    if (!priceDraft) return;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch('/api/uniflow/catalog', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(priceDraft),
      });
      const saved = await readJson<UniflowPriceCatalog>(response);
      setCatalog(saved);
      setPriceDraft(cloneUniflowPriceCatalog(saved));
      setMessage('Precios uniFLOW guardados en SQLite.');
      setCalculated(false);
    } catch (saveError: unknown) {
      setError(toErrorMessage(saveError));
    } finally {
      setSaving(false);
    }
  }

  async function resetPriceDraft() {
    if (!await confirmAction({
      title: 'Restaurar tarifas base',
      message: 'Se restaurarán las tarifas y códigos SKU originales de uniFLOW en el borrador.',
      confirmLabel: 'Restaurar base',
    })) return;
    setPriceDraft(cloneUniflowPriceCatalog(DEFAULT_UNIFLOW_PRICE_CATALOG));
    setMessage('Borrador restaurado al catálogo base. Guarda para aplicarlo.');
  }

  async function copySummary() {
    if (!results) return;
    try {
      await navigator.clipboard.writeText(buildClipboardReport(results, clientName));
      setMessage('Resumen copiado al portapapeles.');
    } catch (copyError: unknown) {
      setError(toErrorMessage(copyError));
    }
  }

  const [exporting, runExport] = useBusy();

  async function exportExcel() {
    if (!results) return;
    try {
      await runExport(() => exportUniflowExcel(results, clientName));
      setMessage('Archivo XLSX generado.');
    } catch (exportError: unknown) {
      setError(toErrorMessage(exportError));
    }
  }

  function printReport() {
    if (!results) return;
    setError(null);
    setPrintableReport({ results, clientName });
  }

  return (
    <div className="page-content uniflow-page">
      <PageHeader
        eyebrow="SOFTWARE / CONFIGURACIÓN"
        title="Configurador uniFLOW Online"
        lead="Calcula licencias por volumen para equipos Canon y conserva las tarifas comerciales en la base local."
        actions={<>
          <Button variant="outline" onClick={() => void copySummary()} disabled={!results}><Copy />Copiar resumen</Button>
          <PrintButton busy={printableReport !== null} onClick={printReport} disabled={!results} />
          <ExportButton busy={exporting} onClick={() => void exportExcel()} disabled={!results}>Exportar XLSX</ExportButton>
        </>}
      />
      <StatusLine state={error ? 'error' : loading || saving ? 'pending' : 'ready'}>
        {error || message || (loading ? 'Cargando catálogo uniFLOW…' : results ? 'Resultado actualizado.' : 'Configura los equipos para comenzar.')}
      </StatusLine>

      <div className="grid items-start gap-6 min-[1401px]:grid-cols-[minmax(0,1fr)_26rem]">
        <div className="grid min-w-0 gap-6">
          <Card className="min-w-0 print:hidden">
            <CardHeader eyebrow="PARÁMETROS DE COTIZACIÓN" title="Equipos y plazo" aside={
              <Button variant="ghost" size="sm" onClick={resetConfiguration}><RotateCcw />Reiniciar</Button>
            } />
            <form className="grid gap-5" onSubmit={calculate}>
              <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
                <div className="grid content-start gap-2">
                  <label htmlFor="uniflow-months" className="text-xs font-bold text-navy dark:text-white">Meses de contrato</label>
                  <Input id="uniflow-months" min={1} type="number" value={months || ''} onChange={(event) => { setMonths(Number(event.target.value) || 0); setCalculated(false); }} />
                  <div className="grid grid-cols-5 gap-1" aria-label="Plazos habituales">
                    {STANDARD_CONTRACT_TERMS.map((term) => <Button
                      variant="outline" size="sm" className={`min-w-0 px-1 ${months === term ? 'border-sky! bg-sky/10! dark:bg-sky/20!' : ''}`}
                      key={term} aria-pressed={months === term}
                      onClick={() => { setMonths(term); setCalculated(false); }}
                    >{term} m</Button>)}
                  </div>
                </div>
                <label className="grid content-start gap-2 text-xs font-bold text-navy dark:text-white">
                  Cliente / proyecto
                  <Input value={clientName} onChange={(event) => setClientName(event.target.value)} placeholder="Opcional" />
                </label>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="grid gap-1">
                  <h3 className="m-0 text-sm font-bold text-navy dark:text-white">Dispositivos configurados</h3>
                  <Muted>Las cantidades se agrupan automáticamente por tipo de licencia.</Muted>
                </div>
                <Badge>{devices.filter((device) => device.modelName).length} modelos</Badge>
              </div>
              <div className="grid gap-3">
                {devices.map((device, index) => <div className="grid min-w-0 gap-3 rounded-xl border border-navy/10 bg-paper/60 p-4 dark:border-sky/20 dark:bg-navy/30" key={device.id}>
                  <div className="flex items-center justify-between gap-3">
                    <Badge>Dispositivo {String(index + 1).padStart(2, '0')}</Badge>
                    <Button variant="ghost" size="sm" onClick={() => removeDevice(device.id)} aria-label={`Quitar dispositivo ${index + 1}`}><Trash2 />Quitar</Button>
                  </div>
                  <div className="grid min-w-0 items-end gap-3 sm:grid-cols-[minmax(0,1fr)_9rem]">
                    <div className="grid min-w-0 gap-2">
                      <span className="text-xs font-bold text-navy dark:text-white">Modelo Canon</span>
                      <UniflowModelSelect value={device.modelName} disabledValues={devices.filter((item) => item.id !== device.id).map((item) => item.modelName)} onChange={(modelName) => updateDevice(device.id, { modelName })} />
                    </div>
                    <label className="grid gap-2 text-xs font-bold text-navy dark:text-white">
                      Cantidad
                      <span className="uniflow-quantity-control">
                        <button type="button" onClick={() => updateDeviceQuantity(device.id, device.quantity - 1)} disabled={device.quantity <= 1} aria-label={`Disminuir cantidad de ${device.modelName || 'equipo'}`}><Minus size={16} aria-hidden="true" /></button>
                        <input min={1} type="number" value={device.quantity} onChange={(event) => updateDeviceQuantity(device.id, Number(event.target.value))} aria-label={`Cantidad de ${device.modelName || 'equipo'}`} />
                        <button type="button" onClick={() => updateDeviceQuantity(device.id, device.quantity + 1)} aria-label={`Aumentar cantidad de ${device.modelName || 'equipo'}`}><Plus size={16} aria-hidden="true" /></button>
                      </span>
                    </label>
                  </div>
                  <label className="flex w-fit items-center gap-3 text-sm text-navy dark:text-white">
                    <input className="size-4 accent-sky" type="checkbox" checked={Boolean(device.withCIP)} onChange={(event) => updateDevice(device.id, { withCIP: event.target.checked })} />
                    <span>CIP <span className="text-xs text-ink-2 dark:text-[#9fb2d1]">· Escaneo avanzado</span></span>
                  </label>
                </div>)}
              </div>
              <div className="flex flex-wrap justify-between gap-3">
                <Button variant="outline" onClick={addDevice}><Plus />Agregar dispositivo</Button>
                <Button type="submit" disabled={loading || !catalog}><Calculator />Calcular configuración</Button>
              </div>
            </form>
          </Card>

          <Card className="min-w-0" id="uniflow-results">
            <CardHeader eyebrow="RESULTADO COMERCIAL" title="Resumen de licencias" aside={<Muted>USD / dispositivo / mes</Muted>} />
            {results && catalog ? <UniflowResults results={results} catalog={catalog} /> : (
              <div className="grid min-h-44 place-content-center gap-2 rounded-xl border border-dashed border-navy/20 p-6 text-center dark:border-sky/30">
                <Calculator className="mx-auto size-7 text-sky" aria-hidden="true" />
                <strong className="text-sm text-navy dark:text-white">La cotización aparecerá aquí.</strong>
                <Muted>Selecciona uno o más equipos y calcula para ver los tiers, costos mensuales y total del contrato.</Muted>
              </div>
            )}
          </Card>
          <UniflowLicensingGuide />
        </div>

        <aside className="min-w-0 print:hidden">
          <Card className="min-w-0">
            <CardHeader eyebrow="CATÁLOGO LOCAL" title="Tarifas uniFLOW" aside={
              <Badge tone={priceDraftDirty ? 'warning' : 'neutral'}>{priceDraftDirty ? 'Sin guardar' : `v${priceDraft?.version ?? 1}`}</Badge>
            } />
            <Muted>Los cambios quedan en SQLite y se aplican a las próximas cotizaciones de esta instalación.</Muted>
            <div className="grid gap-3">
              <label className="grid gap-2 text-xs font-bold text-navy dark:text-white">Fuente<Input value={priceDraft?.source ?? ''} disabled={!priceDraft || saving} onChange={(event) => setPriceDraft((current) => current ? { ...current, source: event.target.value } : current)} /></label>
              <label className="grid gap-2 text-xs font-bold text-navy dark:text-white">Vigencia<Input value={priceDraft?.lastModified ?? ''} disabled={!priceDraft || saving} onChange={(event) => setPriceDraft((current) => current ? { ...current, lastModified: event.target.value } : current)} placeholder="dd/mm/aa" /></label>
            </div>
            <div className="grid grid-cols-4 gap-1" aria-label="Listas de precios">
              {UNIFLOW_PRICE_TABS.map((tab) => <Button
                variant="outline" size="sm" className={`min-w-0 px-1 ${activePriceTab === tab ? 'border-sky! bg-sky/10! dark:bg-sky/20!' : ''}`}
                key={tab} aria-pressed={activePriceTab === tab} onClick={() => setActivePriceTab(tab)}
              >{PRICE_TAB_LABELS[tab]}</Button>)}
            </div>
            <Table className="table-fixed" wrapperClassName="max-h-[28rem]">
              <TableHeader><TableRow><TableHead className="w-[22%]">Tier</TableHead><TableHead className="w-[45%]">SKU</TableHead><TableHead className="w-[33%] text-right">USD / mes</TableHead></TableRow></TableHeader>
              <TableBody>{priceDraft?.lists[activePriceTab].map((item, index) => (
                <TableRow key={`${activePriceTab}-${item.label}`}>
                  <TableCell className="align-middle"><span className="whitespace-nowrap text-xs font-bold">{item.label}</span>{item.maxQty === null ? <Muted>Sin límite</Muted> : null}</TableCell>
                  <TableCell><Input className="h-9 min-w-0 px-2 text-xs" value={item.sku} disabled={saving} onChange={(event) => updatePrice(activePriceTab, index, 'sku', event.target.value)} aria-label={`SKU ${item.label}`} /></TableCell>
                  <TableCell><Input className="h-9 min-w-0 px-2 text-right text-xs tabular-nums" min={0} step="0.01" type="number" value={item.price} disabled={saving} onChange={(event) => updatePrice(activePriceTab, index, 'price', event.target.value)} aria-label={`Precio ${item.label}`} /></TableCell>
                </TableRow>
              ))}</TableBody>
            </Table>
            <div className="flex flex-wrap justify-between gap-3">
              <Button variant="outline" size="sm" onClick={() => void resetPriceDraft()} disabled={saving}><RotateCcw />Restaurar base</Button>
              <Button size="sm" onClick={() => void savePrices()} disabled={saving || !priceDraft} aria-busy={saving}><Save />{saving ? 'Guardando…' : 'Guardar precios'}</Button>
            </div>
          </Card>
        </aside>
      </div>
      {printableReport ? <UniflowPrintReport {...printableReport} /> : null}
    </div>
  );
}

function UniflowResults({ results, catalog }: { results: UniflowConfigurationSummary; catalog: UniflowPriceCatalog }) {
  const t1Upgrade = getUniflowNextTierUpgrade('T1', results.t1TotalQty, catalog);
  const t2Upgrade = getUniflowNextTierUpgrade('T2', results.t2TotalQty, catalog);
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-3">
        <UniflowTotal label="Total mensual" value={results.monthlyTotal} accent />
        <UniflowTotal label="Proyección anual" value={results.annualTotal} />
        <UniflowTotal label={`Contrato de ${results.months} meses`} value={results.contractTotal} />
      </div>
      <Table className="min-w-[34rem]" aria-label="Licencias calculadas">
        <TableHeader><TableRow><TableHead>Licencia</TableHead><TableHead>Tier / SKU</TableHead><TableHead className="text-right">Equipos</TableHead><TableHead className="text-right">Total mensual</TableHead></TableRow></TableHeader>
        <TableBody>
          <LicenseRow label="CPS T1 · Base" sku={results.t1SKU} quantity={results.t1TotalQty} total={results.t1TotalCost} />
          <LicenseRow label="CPS T2 · Base" sku={results.t2SKU} quantity={results.t2TotalQty} total={results.t2TotalCost} />
          <LicenseRow label="CIP T1 · Avanzado" sku={results.t1CIPSKU} quantity={results.t1CIPQty} total={results.t1CIPTotalCost} />
          <LicenseRow label="CIP T2 · Avanzado" sku={results.t2CIPSKU} quantity={results.t2CIPQty} total={results.t2CIPTotalCost} />
        </TableBody>
      </Table>
      <div className="grid gap-3 sm:grid-cols-2"><TierHint label="T1" quantity={results.t1TotalQty} upgrade={t1Upgrade} /><TierHint label="T2" quantity={results.t2TotalQty} upgrade={t2Upgrade} /></div>
      <div className="grid gap-3 border-t border-navy/10 pt-4 dark:border-sky/20">
        <h3 className="m-0 text-xs font-bold uppercase tracking-wider text-navy dark:text-white">Detalle de equipos</h3>
        {results.addedDevices.map((device) => <div className="flex items-center justify-between gap-4 border-b border-navy/10 pb-3 last:border-0 last:pb-0 dark:border-sky/15" key={`${device.modelName}-${device.type}`}>
          <div className="grid min-w-0 gap-1"><strong className="text-sm text-navy dark:text-white">{device.modelName}</strong><Muted>{device.type} · {device.color}{device.withCIP ? ' · CIP' : ''}</Muted></div>
          <Badge tone="success">{numberFormat.format(device.quantity)} u.</Badge>
        </div>)}
      </div>
    </>
  );
}

function UniflowTotal({ label, value, accent = false }: { label: string; value: number; accent?: boolean }) {
  return <div className={`grid min-w-0 gap-2 rounded-xl border p-4 [container-type:inline-size] ${accent ? 'border-sky/40 bg-sky/10' : 'border-navy/10 bg-paper dark:border-sky/20 dark:bg-navy/40'}`}>
    <span className="text-xs font-semibold text-ink-2 dark:text-[#b4c3dc]">{label}</span>
    <strong className="break-all text-[clamp(1.1rem,10cqi,1.75rem)] leading-tight font-bold tabular-nums text-navy dark:text-white">{usdFormat.format(value)}</strong>
  </div>;
}

function UniflowModelSelect({ value, disabledValues, onChange }: { value: string; disabledValues: readonly string[]; onChange: (value: string) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);
  const selectedModel = UNIFLOW_DEVICE_MODELS.find((model) => model.name === value);
  const normalizedQuery = normalizeUniflowText(query);
  const filteredModels = UNIFLOW_DEVICE_MODELS.filter((model) => {
    if (!normalizedQuery) return true;
    return [model.name, model.type, model.color].some((field) => normalizeUniflowText(field).includes(normalizedQuery));
  });

  useEffect(() => {
    if (!open) return undefined;
    function closeWhenOutside(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', closeWhenOutside);
    return () => document.removeEventListener('mousedown', closeWhenOutside);
  }, [open]);

  function selectModel(modelName: string) {
    onChange(modelName);
    setOpen(false);
    setQuery('');
  }

  return <div className="relative min-w-0" ref={rootRef}>
    <Button variant="outline" className="h-12 w-full min-w-0 justify-between px-3 text-left" aria-label={`Modelo Canon: ${selectedModel?.name || 'Seleccionar modelo'}`} aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((current) => !current)}>
      {selectedModel ? <span className="grid min-w-0 gap-0.5"><strong className="truncate text-xs">{selectedModel.name}</strong><span className="text-[11px] font-normal text-ink-2 dark:text-[#9fb2d1]">{selectedModel.type} · {selectedModel.color}</span></span> : <span className="truncate text-xs">Seleccionar modelo</span>}
      <ChevronDown aria-hidden="true" />
    </Button>
    {open ? <div className="absolute top-full left-0 z-40 mt-2 w-full overflow-hidden rounded-xl border border-navy/20 bg-white p-2 shadow-xl dark:border-sky/30 dark:bg-panel">
      <Input type="search" value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === 'Escape') { setOpen(false); rootRef.current?.querySelector('button')?.focus(); } }} placeholder="Buscar modelo, tipo o color…" aria-label="Buscar modelo Canon" autoFocus />
      <div className="mt-2 max-h-64 overflow-y-auto" role="listbox" aria-label="Modelos Canon">
        {filteredModels.length === 0 ? <p className="p-3 text-center text-xs text-ink-2 dark:text-[#9fb2d1]">No se encontraron modelos.</p> : filteredModels.map((model) => {
          const selected = model.name === value;
          const disabled = disabledValues.includes(model.name) && !selected;
          return <Button variant="ghost" className={`h-auto w-full justify-between rounded-lg px-2 py-2 text-left ${selected ? 'bg-sky/10 dark:bg-sky/20' : ''}`} role="option" aria-selected={selected} disabled={disabled} key={model.name} onClick={() => { selectModel(model.name); rootRef.current?.querySelector('button')?.focus(); }}>
            <span className="grid min-w-0 gap-0.5"><strong className="truncate text-xs">{model.name}</strong><span className="text-[11px] font-normal text-ink-2 dark:text-[#9fb2d1]">{model.type} · {model.color}</span></span>
            {disabled ? <span className="text-[10px]">Ya agregado</span> : selected ? <span className="text-[10px]">Seleccionado</span> : null}
          </Button>;
        })}
      </div>
    </div> : null}
  </div>;
}

function UniflowLicensingGuide() {
  return <Card className="min-w-0 print:hidden">
    <CardHeader eyebrow="GUÍA COMERCIAL" title="Asignación de licencia uniFLOW Online" />
    <Muted>Los equipos Canon se agrupan automáticamente por nivel de licenciamiento para consolidar los volúmenes y aplicar el tier correspondiente.</Muted>
    <div className="grid gap-3 sm:grid-cols-2">
      <LicensingNote title="Tipo 1 · MEAP / CPS T1">Modelos avanzados compatibles con Canon MEAP, como imageFORCE, imagePRESS e imageRUNNER ADVANCE DX.</LicensingNote>
      <LicensingNote title="Tipo 2 · Basic / CPS T2">Equipos compactos, de sobremesa y formato menor, como i-SENSYS, imageCLASS e imageRUNNER basic.</LicensingNote>
      <LicensingNote title="CPS · Cloud Print & Scan">Licencia base por equipo: autenticación, liberación segura de impresiones, contabilidad, reportes y escaneo básico.</LicensingNote>
      <LicensingNote title="CIP · Cloud Image Processing">Add-on que requiere CPS y agrega OCR avanzado, optimización de PDF, metadatos y flujos corporativos de digitalización.</LicensingNote>
    </div>
    <Muted className="border-t border-navy/10 pt-3 dark:border-sky/20">El sistema suma por separado T1, T2 y los equipos con CIP para seleccionar cada tarifa por volumen.</Muted>
  </Card>;
}

function LicensingNote({ title, children }: { title: string; children: string }) {
  return <article className="grid gap-2 rounded-xl border border-navy/10 p-4 dark:border-sky/20"><strong className="text-xs text-navy dark:text-white">{title}</strong><Muted>{children}</Muted></article>;
}

function LicenseRow({ label, sku, quantity, total }: { label: string; sku: UniflowSku | null; quantity: number; total: number }) {
  if (!sku || quantity <= 0) return null;
  return <TableRow><TableCell className="font-semibold">{label}</TableCell><TableCell><Badge>{sku.label}</Badge><Muted className="mt-1 whitespace-nowrap">{sku.sku} · {usdFormat.format(sku.price)} unitario</Muted></TableCell><TableCell className="text-right tabular-nums">{numberFormat.format(quantity)}</TableCell><TableCell className="text-right font-bold whitespace-nowrap tabular-nums">{usdFormat.format(total)}</TableCell></TableRow>;
}

function TierHint({ label, quantity, upgrade }: { label: string; quantity: number; upgrade: { unitsNeeded: number; newPrice: number } | null }) {
  const message = quantity <= 0 ? 'Sin equipos configurados.' : !upgrade ? 'Ya estás en el tier máximo disponible.' : `Agrega ${numberFormat.format(upgrade.unitsNeeded)} equipo${upgrade.unitsNeeded === 1 ? '' : 's'} para acceder a ${usdFormat.format(upgrade.newPrice)} por unidad.`;
  return <div className="grid content-start gap-2 rounded-xl border border-sky/20 bg-sky/5 p-4"><Badge className="w-fit">{label}{quantity > 0 && upgrade ? ' · oportunidad de volumen' : ''}</Badge><Muted>{message}</Muted></div>;
}

function buildClipboardReport(results: UniflowConfigurationSummary, clientName: string): string {
  const lines = [
    'CONFIGURACIÓN UNIFLOW ONLINE',
    `Cliente / proyecto: ${clientName.trim() || 'Sin especificar'}`,
    `Contrato: ${results.months} meses`,
    '',
    'DISPOSITIVOS:',
    ...results.addedDevices.map((device) => `- ${device.modelName}: ${device.quantity} unidad(es), ${device.type}, ${device.color}${device.withCIP ? ', CIP' : ''}`),
    '',
    'LICENCIAS:',
  ];
  const licenses = [
    ['CPS T1', results.t1SKU, results.t1TotalQty, results.t1TotalCost],
    ['CPS T2', results.t2SKU, results.t2TotalQty, results.t2TotalCost],
    ['CIP T1', results.t1CIPSKU, results.t1CIPQty, results.t1CIPTotalCost],
    ['CIP T2', results.t2CIPSKU, results.t2CIPQty, results.t2CIPTotalCost],
  ] as const;
  for (const [label, sku, quantity, total] of licenses) {
    if (sku && quantity > 0) lines.push(`- ${label} ${sku.label} (${sku.sku}): ${quantity} × ${usdFormat.format(sku.price)} = ${usdFormat.format(total)} / mes`);
  }
  lines.push('', `Total mensual: ${usdFormat.format(results.monthlyTotal)}`, `Total anual: ${usdFormat.format(results.annualTotal)}`, `Total contrato: ${usdFormat.format(results.contractTotal)}`);
  return lines.join('\n');
}

