import type { UniflowConfigurationSummary, UniflowSku } from './types';

type UniflowPrintReportProps = {
  results: UniflowConfigurationSummary;
  clientName: string;
};

const numberFormat = new Intl.NumberFormat('es-PY', { maximumFractionDigits: 0 });
const currencyFormat = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function UniflowPrintReport({ results, clientName }: UniflowPrintReportProps) {
  const generatedAt = new Intl.DateTimeFormat('es-PY', {
    day: 'numeric',
    month: 'numeric',
    year: 'numeric',
  }).format(new Date());
  const licenses = [
    { sku: results.t1SKU, label: 'UFO CPS T1', suffix: 'Base', quantity: results.t1TotalQty, total: results.t1TotalCost },
    { sku: results.t2SKU, label: 'UFO CPS T2', suffix: 'Base', quantity: results.t2TotalQty, total: results.t2TotalCost },
    { sku: results.t1CIPSKU, label: 'UFO CIP T1', suffix: 'Escaneo OCR', quantity: results.t1CIPQty, total: results.t1CIPTotalCost },
    { sku: results.t2CIPSKU, label: 'UFO CIP T2', suffix: 'Escaneo OCR', quantity: results.t2CIPQty, total: results.t2CIPTotalCost },
  ].filter((license): license is { sku: UniflowSku; label: string; suffix: string; quantity: number; total: number } => license.sku !== null && license.quantity > 0);

  return (
    <section className="uniflow-print-report" aria-label="Propuesta uniFLOW para impresión">
      <div className="uniflow-print-accent" aria-hidden="true" />
      <div className="uniflow-print-eyebrow">DATA SYSTEMS / PROPUESTA COMERCIAL</div>
      <h1>uniFLOW Online</h1>
      <h2>Propuesta de configuración y licenciamiento</h2>
      <div className="uniflow-print-divider" aria-hidden="true" />
      <p className="uniflow-print-subtitle">Producido automáticamente por el configurador de ventas.</p>

      <div className="uniflow-print-intro">
        <div className="uniflow-print-meta">
          <div><span>Fecha del Reporte:</span><strong>{generatedAt}</strong></div>
          <div><span>Cliente / Proyecto:</span><strong>{clientName.trim() || 'Cliente No Especificado'}</strong></div>
          <div><span>Meses de Contrato:</span><strong>{numberFormat.format(results.months)} meses (Duración del servicio)</strong></div>
        </div>
        <div className="uniflow-print-device-summary">
          <span>Resumen de dispositivos</span>
          <strong>CPS Base (T1/T2): {numberFormat.format(results.t1TotalQty + results.t2TotalQty)} u.</strong>
          <strong>CIP Adv. Scan (T1/T2): {numberFormat.format(results.t1CIPQty + results.t2CIPQty)} u.</strong>
        </div>
      </div>

      <section className="uniflow-print-section">
        <h3>1. Equipos Canon Seleccionados y Módulos de Escaneo</h3>
        <table className="uniflow-print-table">
          <thead><tr><th>Modelo Canon</th><th>Gama / color</th><th>Tipo de licencia</th><th>Escaneo avanzado</th><th>Cant.</th></tr></thead>
          <tbody>{results.addedDevices.map((device) => <tr key={`${device.modelName}-${device.type}`}><td>{device.modelName}</td><td>{device.color}</td><td>{device.type === 'T1' ? 'T1 (MEAP)' : 'T2 (Non-MEAP)'}</td><td>{device.withCIP ? 'Sí (CIP)' : 'No (solo CPS)'}</td><td className="align-center">{numberFormat.format(device.quantity)} u.</td></tr>)}</tbody>
        </table>
      </section>

      <section className="uniflow-print-section">
        <h3>2. Detalle de Licencias uniFLOW Online y Códigos de Parte</h3>
        <table className="uniflow-print-table uniflow-print-license-table">
          <thead><tr><th>Código de Parte</th><th>Descripción del Servicio</th><th>Cantidad</th><th>P. Unit ($/mes)</th><th>Total Mensual</th></tr></thead>
          <tbody>{licenses.map((license) => <tr key={license.sku.sku}><td>{license.sku.sku}</td><td>{license.label} (Tier {license.sku.label}) - {license.suffix}</td><td className="align-center">{numberFormat.format(license.quantity)} u.</td><td className="align-right">{currencyFormat.format(license.sku.price)}</td><td className="align-right"><strong>{currencyFormat.format(license.total)}</strong></td></tr>)}</tbody>
        </table>
      </section>

      <section className="uniflow-print-total-card">
        <h3>RESUMEN DE IMPORTES TOTALES (USD)</h3>
        <div><span>Facturación mensual recurrente</span><strong>{currencyFormat.format(results.monthlyTotal)} / mes</strong></div>
        <div><span>Cálculo anualizado estimado</span><strong>{currencyFormat.format(results.annualTotal)} / año</strong></div>
        <div className="uniflow-print-contract-total"><span>Total contrato acumulado ({numberFormat.format(results.months)} meses)</span><strong>{currencyFormat.format(results.contractTotal)}</strong></div>
      </section>

      <div className="uniflow-print-notes">
        <strong>Notas comerciales</strong>
        <p>1) Los precios exhibidos corresponden a licencias mensuales por dispositivo según los tiers de volumen sumados.</p>
        <p>2) Esta simulación es meramente informativa de acuerdo con las directrices de licenciamiento oficial de Canon uniFLOW Online.</p>
      </div>
      <footer>Generado localmente por Data Systems Suite · No se envía información fuera del equipo.</footer>
    </section>
  );
}
