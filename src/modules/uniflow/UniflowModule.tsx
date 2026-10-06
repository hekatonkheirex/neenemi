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
import { ExportButton } from '../../core/ActionButtons';

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

  async function exportExcel() {
    if (!results) return;
    try {
      await exportUniflowExcel(results, clientName);
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
      <section className="catalog-header">
        <div>
          <div className="eyebrow">VENTAS / CONFIGURACIÓN</div>
          <h1>Configurador uniFLOW Online</h1>
          <p className="lead">Calcula licencias por volumen para equipos Canon y conserva las tarifas comerciales en la base local.</p>
        </div>
        <div className="uniflow-actions">
          <button className="secondary-button" type="button" onClick={() => void copySummary()} disabled={!results}>Copiar resumen</button>
          <button className="secondary-button" type="button" onClick={printReport} disabled={!results || printableReport !== null}>{printableReport ? 'Preparando…' : 'Imprimir / PDF'}</button>
          <ExportButton onClick={() => void exportExcel()} disabled={!results}>Exportar XLSX</ExportButton>
        </div>
      </section>

      <section className="sales-status" aria-live="polite">
        <span className={`status-dot ${error ? 'error' : loading || saving ? 'pending' : 'ready'}`} />
        <span>{error || message || (loading ? 'Cargando catálogo uniFLOW…' : results ? 'Resultado actualizado.' : 'Configura los equipos para comenzar.')}</span>
      </section>

      <section className="uniflow-layout">
        <div className="uniflow-main">
          <section className="sales-card">
            <div className="card-heading">
              <div><div className="eyebrow">PARÁMETROS DE COTIZACIÓN</div><h2>Equipos y plazo</h2></div>
              <button className="text-button" type="button" onClick={resetConfiguration}>Reiniciar</button>
            </div>
            <form className="uniflow-form" onSubmit={calculate}>
              <div className="uniflow-settings-grid">
                <label className="search-field"><span>Meses de contrato</span><input aria-label="Meses de contrato" min={1} type="number" value={months || ''} onChange={(event) => { setMonths(Number(event.target.value) || 0); setCalculated(false); }} /><span className="uniflow-term-options" aria-label="Plazos habituales">{STANDARD_CONTRACT_TERMS.map((term) => <button className={months === term ? 'active' : ''} key={term} type="button" onClick={() => { setMonths(term); setCalculated(false); }}>{term} m</button>)}</span></label>
                <label className="search-field"><span>Cliente / proyecto</span><input value={clientName} onChange={(event) => setClientName(event.target.value)} placeholder="Opcional" /></label>
              </div>

              <div className="uniflow-device-heading"><div><h3>Dispositivos configurados</h3><p className="form-hint">Las cantidades se agrupan automáticamente por tipo de licencia.</p></div><span className="badge neutral">{devices.filter((device) => device.modelName).length} modelos</span></div>
              <div className="uniflow-device-list">
                {devices.map((device, index) => <div className="uniflow-device-row" key={device.id}>
                  <span className="uniflow-device-index">{String(index + 1).padStart(2, '0')}</span>
                  <div className="search-field"><span>Modelo Canon</span><UniflowModelSelect value={device.modelName} disabledValues={devices.filter((item) => item.id !== device.id).map((item) => item.modelName)} onChange={(modelName) => updateDevice(device.id, { modelName })} /></div>
                  <label className="search-field uniflow-quantity"><span>Cantidad</span><span className="uniflow-quantity-control"><button type="button" onClick={() => updateDeviceQuantity(device.id, device.quantity - 1)} disabled={device.quantity <= 1} aria-label={`Disminuir cantidad de ${device.modelName || 'equipo'}`}>−</button><input min={1} type="number" value={device.quantity} onChange={(event) => updateDeviceQuantity(device.id, Number(event.target.value))} aria-label={`Cantidad de ${device.modelName || 'equipo'}`} /><button type="button" onClick={() => updateDeviceQuantity(device.id, device.quantity + 1)} aria-label={`Aumentar cantidad de ${device.modelName || 'equipo'}`}>+</button></span></label>
                  <label className="uniflow-cip-toggle"><input type="checkbox" checked={Boolean(device.withCIP)} onChange={(event) => updateDevice(device.id, { withCIP: event.target.checked })} /><span>CIP</span><small>Escaneo avanzado</small></label>
                  <button className="text-button uniflow-remove" type="button" onClick={() => removeDevice(device.id)}>Quitar</button>
                </div>)}
              </div>
              <div className="uniflow-form-actions"><button className="secondary-button" type="button" onClick={addDevice}>Agregar dispositivo</button><button className="primary-button" type="submit">Calcular configuración</button></div>
            </form>
          </section>

          <section className="sales-card" id="uniflow-results">
            <div className="card-heading"><div><div className="eyebrow">RESULTADO COMERCIAL</div><h2>Resumen de licencias</h2></div><span className="muted-note">USD / dispositivo / mes</span></div>
            {results && catalog ? <UniflowResults results={results} catalog={catalog} /> : <div className="uniflow-empty"><strong>La cotización aparecerá aquí.</strong><span>Selecciona uno o más equipos y calcula para ver los tiers, costos mensuales y total del contrato.</span></div>}
          </section>

          <UniflowLicensingGuide />
        </div>

        <aside className="uniflow-sidebar">
          <section className="sales-card uniflow-price-manager">
            <div className="card-heading"><div><div className="eyebrow">CATÁLOGO LOCAL</div><h2>Tarifas uniFLOW</h2></div><span className="muted-note">v{priceDraft?.version ?? 1}</span></div>
            <p className="form-hint">Los cambios quedan en SQLite y se aplican a las próximas cotizaciones de esta instalación.</p>
            <div className="uniflow-price-meta"><label className="search-field"><span>Fuente</span><input value={priceDraft?.source ?? ''} onChange={(event) => setPriceDraft((current) => current ? { ...current, source: event.target.value } : current)} /></label><label className="search-field"><span>Vigencia</span><input value={priceDraft?.lastModified ?? ''} onChange={(event) => setPriceDraft((current) => current ? { ...current, lastModified: event.target.value } : current)} placeholder="dd/mm/aa" /></label></div>
            <div className="uniflow-price-tabs" role="tablist" aria-label="Listas de precios">
              {UNIFLOW_PRICE_TABS.map((tab) => <button className={activePriceTab === tab ? 'active' : ''} key={tab} type="button" role="tab" aria-selected={activePriceTab === tab} onClick={() => setActivePriceTab(tab)}>{PRICE_TAB_LABELS[tab]}</button>)}
            </div>
            <div className="catalog-table-wrap">
              <table className="catalog-table uniflow-price-table">
                <thead><tr><th>Tier</th><th>SKU</th><th className="align-right">USD / mes</th></tr></thead>
                <tbody>{priceDraft?.lists[activePriceTab].map((item, index) => <tr key={`${item.sku}-${item.label}`}><td><span className="code-cell">{item.label}</span><small className="table-secondary-text">{item.maxQty === null ? 'Sin límite' : `${numberFormat.format(item.minQty)} a ${numberFormat.format(item.maxQty)}`}</small></td><td><input className="uniflow-inline-input" value={item.sku} onChange={(event) => updatePrice(activePriceTab, index, 'sku', event.target.value)} aria-label={`SKU ${item.label}`} /></td><td className="align-right"><input className="uniflow-inline-input price" min={0} step="0.01" type="number" value={item.price} onChange={(event) => updatePrice(activePriceTab, index, 'price', event.target.value)} aria-label={`Precio ${item.label}`} /></td></tr>)}</tbody>
              </table>
            </div>
            <div className="uniflow-price-actions"><button className="secondary-button" type="button" onClick={() => void resetPriceDraft()}>Restaurar base</button><button className="primary-button" type="button" onClick={() => void savePrices()} disabled={saving || !priceDraft}>{saving ? 'Guardando…' : 'Guardar precios'}</button></div>
          </section>
        </aside>
      </section>
      {printableReport ? <UniflowPrintReport {...printableReport} /> : null}
    </div>
  );
}

function UniflowResults({ results, catalog }: { results: UniflowConfigurationSummary; catalog: UniflowPriceCatalog }) {
  const t1Upgrade = getUniflowNextTierUpgrade('T1', results.t1TotalQty, catalog);
  const t2Upgrade = getUniflowNextTierUpgrade('T2', results.t2TotalQty, catalog);
  return <>
    <div className="summary-grid uniflow-summary-grid"><div className="summary-card accent"><span className="summary-value">{usdFormat.format(results.monthlyTotal)}</span><span className="summary-label">total mensual</span></div><div className="summary-card"><span className="summary-value">{usdFormat.format(results.annualTotal)}</span><span className="summary-label">proyección anual</span></div><div className="summary-card"><span className="summary-value">{usdFormat.format(results.contractTotal)}</span><span className="summary-label">contrato de {results.months} meses</span></div></div>
    <div className="uniflow-license-table-wrap"><table className="catalog-table uniflow-license-table"><thead><tr><th>Licencia</th><th>Tier / SKU</th><th className="align-right">Equipos</th><th className="align-right">Total mensual</th></tr></thead><tbody><LicenseRow label="CPS T1 · Base" sku={results.t1SKU} quantity={results.t1TotalQty} total={results.t1TotalCost} /><LicenseRow label="CPS T2 · Base" sku={results.t2SKU} quantity={results.t2TotalQty} total={results.t2TotalCost} /><LicenseRow label="CIP T1 · Avanzado" sku={results.t1CIPSKU} quantity={results.t1CIPQty} total={results.t1CIPTotalCost} /><LicenseRow label="CIP T2 · Avanzado" sku={results.t2CIPSKU} quantity={results.t2CIPQty} total={results.t2CIPTotalCost} /></tbody></table></div>
    <div className="uniflow-upgrade-grid"><TierHint label="T1" quantity={results.t1TotalQty} upgrade={t1Upgrade} /><TierHint label="T2" quantity={results.t2TotalQty} upgrade={t2Upgrade} /></div>
    <div className="uniflow-device-summary"><div className="eyebrow">DETALLE DE EQUIPOS</div>{results.addedDevices.map((device) => <div className="uniflow-device-summary-row" key={`${device.modelName}-${device.type}`}><span><strong>{device.modelName}</strong><small>{device.type} · {device.color}{device.withCIP ? ' · CIP' : ''}</small></span><b>{numberFormat.format(device.quantity)}</b></div>)}</div>
  </>;
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

  return <div className={`uniflow-model-select ${open ? 'open' : ''}`} ref={rootRef}>
    <button className="uniflow-model-trigger" type="button" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((current) => !current)}>
      {selectedModel ? <span className="uniflow-model-trigger-copy"><strong>{selectedModel.name}</strong><small>{selectedModel.type} · {selectedModel.color}</small></span> : <span className="uniflow-model-placeholder">Seleccionar modelo</span>}
      <span className="uniflow-model-trigger-arrow" aria-hidden="true">⌄</span>
    </button>
    {open ? <div className="uniflow-model-menu" role="listbox" aria-label="Modelos Canon">
      <input className="uniflow-model-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === 'Escape') setOpen(false); }} placeholder="Buscar modelo, tipo o color…" autoFocus />
      <div className="uniflow-model-options">
        {filteredModels.length === 0 ? <p className="uniflow-model-empty">No se encontraron modelos.</p> : filteredModels.map((model) => {
          const selected = model.name === value;
          const disabled = disabledValues.includes(model.name) && !selected;
          return <button className={`uniflow-model-option ${selected ? 'selected' : ''}`} type="button" role="option" aria-selected={selected} disabled={disabled} key={model.name} onClick={() => selectModel(model.name)}>
            <span><strong>{model.name}</strong><small>{model.type} · {model.color}</small></span>
            {disabled ? <small>Ya agregado</small> : selected ? <small>Seleccionado</small> : null}
          </button>;
        })}
      </div>
    </div> : null}
  </div>;
}

function UniflowLicensingGuide() {
  return <section className="sales-card uniflow-licensing-guide">
    <div className="eyebrow">GUÍA COMERCIAL</div>
    <h2>Asignación de licencia uniFLOW Online</h2>
    <p>Los equipos Canon se agrupan automáticamente por nivel de licenciamiento para consolidar los volúmenes y aplicar el tier correspondiente.</p>
    <div className="uniflow-licensing-grid">
      <article>
        <strong>Tipo 1 · MEAP / CPS T1</strong>
        <p>Modelos avanzados compatibles con Canon MEAP, como imageFORCE, imagePRESS e imageRUNNER ADVANCE DX.</p>
      </article>
      <article>
        <strong>Tipo 2 · Basic / CPS T2</strong>
        <p>Equipos compactos, de sobremesa y formato menor, como i-SENSYS, imageCLASS e imageRUNNER basic.</p>
      </article>
      <article>
        <strong>CPS · Cloud Print &amp; Scan</strong>
        <p>Licencia base por equipo: autenticación, liberación segura de impresiones, contabilidad, reportes y escaneo básico.</p>
      </article>
      <article>
        <strong>CIP · Cloud Image Processing</strong>
        <p>Add-on que requiere CPS y agrega OCR avanzado, optimización de PDF, metadatos y flujos corporativos de digitalización.</p>
      </article>
    </div>
    <small>El sistema suma por separado T1, T2 y los equipos con CIP para seleccionar cada tarifa por volumen.</small>
  </section>;
}

function LicenseRow({ label, sku, quantity, total }: { label: string; sku: UniflowSku | null; quantity: number; total: number }) {
  if (!sku || quantity <= 0) return null;
  return <tr><td><span className="code-cell">{label}</span></td><td><span>{sku.label}</span><small className="table-secondary-text">{sku.sku} · {usdFormat.format(sku.price)} unitario</small></td><td className="align-right">{numberFormat.format(quantity)}</td><td className="align-right price-cell">{usdFormat.format(total)}</td></tr>;
}

function TierHint({ label, quantity, upgrade }: { label: string; quantity: number; upgrade: { unitsNeeded: number; newPrice: number } | null }) {
  if (quantity <= 0) return <div className="uniflow-tier-hint"><span>{label}</span><p>Sin equipos configurados.</p></div>;
  if (!upgrade) return <div className="uniflow-tier-hint"><span>{label}</span><p>Ya estás en el tier máximo disponible.</p></div>;
  return <div className="uniflow-tier-hint"><span>{label} · oportunidad de volumen</span><p>Agrega {numberFormat.format(upgrade.unitsNeeded)} equipo{upgrade.unitsNeeded === 1 ? '' : 's'} para acceder a {usdFormat.format(upgrade.newPrice)} por unidad.</p></div>;
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

