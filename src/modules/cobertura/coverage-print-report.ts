import type { PdfPageFailure } from './pdf-analysis';
import type { CoverageColor, DocumentCoverage, YieldEstimate } from './types';

type CoveragePrintReportData = {
  coverage: DocumentCoverage;
  sourceName: string | null;
  analyzedAt: string | null;
  inputMode: 'manual' | 'pdf';
  failedPages: readonly PdfPageFailure[];
  yieldEstimate: YieldEstimate | null;
};

const numberFormat = new Intl.NumberFormat('es-PY', { maximumFractionDigits: 1 });
const pageFormat = new Intl.NumberFormat('es-PY', { maximumFractionDigits: 0 });
const dateFormat = new Intl.DateTimeFormat('es-PY', { dateStyle: 'medium', timeStyle: 'short' });

const channelLabels: Record<CoverageColor, string> = {
  black: 'Negro',
  cyan: 'Cian',
  magenta: 'Magenta',
  yellow: 'Amarillo',
};

const channels = Object.keys(channelLabels) as CoverageColor[];
const htmlEntities: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function renderCoveragePrintReportMarkup({
  coverage,
  sourceName,
  analyzedAt,
  inputMode,
  failedPages,
  yieldEstimate,
}: CoveragePrintReportData): string {
  const totalAverage = coverage.average.black + coverage.average.cyan + coverage.average.magenta + coverage.average.yellow;
  const reportDate = analyzedAt && Number.isFinite(Date.parse(analyzedAt)) ? new Date(analyzedAt) : new Date();
  const documentPageCount = coverage.pages.length + failedPages.length;
  const channelRows = channels.map((color) => `
    <tr>
      <th scope="row"><span class="coverage-print-swatch ${color}" aria-hidden="true"></span>${escapeHtml(channelLabels[color])}</th>
      <td>${escapeHtml(numberFormat.format(coverage.average[color]))}%</td>
    </tr>`).join('');
  const yieldSection = yieldEstimate ? `
    <section class="coverage-print-section coverage-print-yield" aria-labelledby="coverage-print-yield-title">
      <h2 id="coverage-print-yield-title">Rendimiento estimado</h2>
      <div class="coverage-print-yield-summary">
        <div><span>Modelo Canon</span><strong>${escapeHtml(yieldEstimate.modelName)}</strong></div>
        <div><span>Cuello de botella estimado</span><strong>${yieldEstimate.bottleneckPages === null ? 'Sin consumo medido' : `${escapeHtml(pageFormat.format(Math.round(yieldEstimate.bottleneckPages)))} páginas`}</strong></div>
      </div>
      <table class="coverage-print-yield-table">
        <thead><tr><th scope="col">Canal</th><th scope="col">Cobertura medida</th><th scope="col">Rendimiento nominal</th><th scope="col">Rendimiento estimado</th></tr></thead>
        <tbody>${yieldEstimate.colors.map((color) => `
          <tr>
            <th scope="row">${escapeHtml(channelLabels[color.color])}</th>
            <td>${escapeHtml(numberFormat.format(color.measuredCoverage))}%</td>
            <td>${escapeHtml(pageFormat.format(color.nominalYield))} páginas</td>
            <td>${color.estimatedPages === null ? 'No consumido' : `${escapeHtml(pageFormat.format(Math.round(color.estimatedPages)))} páginas`}</td>
          </tr>`).join('')}
        </tbody>
      </table>
      <p class="coverage-print-caption">Estimación de referencia al 5% de cobertura nominal según el rendimiento configurado para el modelo.</p>
    </section>` : '';
  const exclusions = failedPages.length > 0
    ? `<p class="coverage-print-exclusions"><strong>Páginas excluidas:</strong> ${failedPages.map(({ page }) => escapeHtml(pageFormat.format(page))).join(', ')}.</p>`
    : '';
  const pageRows = coverage.pages.map((page) => `
    <tr>
      <th scope="row">${escapeHtml(pageFormat.format(page.page))}</th>
      <td>${escapeHtml(numberFormat.format(page.black))}%</td>
      <td>${escapeHtml(numberFormat.format(page.cyan))}%</td>
      <td>${escapeHtml(numberFormat.format(page.magenta))}%</td>
      <td>${escapeHtml(numberFormat.format(page.yellow))}%</td>
      <td><strong>${escapeHtml(numberFormat.format(page.total))}%</strong></td>
    </tr>`).join('');

  return `
    <article class="coverage-print-report" aria-label="Informe ejecutivo de cobertura de tóner">
      <div class="coverage-print-accent" aria-hidden="true"></div>
      <div class="coverage-print-eyebrow">DATA SYSTEMS / COBERTURA DE TÓNER</div>
      <header class="coverage-print-header">
        <div><h1>Informe de cobertura de tóner</h1><p>Medición por página y estimación de consumo de insumos Canon.</p></div>
        <div class="coverage-print-brand">MPS</div>
      </header>
      <dl class="coverage-print-meta">
        <div><dt>Documento fuente</dt><dd>${escapeHtml(sourceName || 'Sin nombre de archivo')}</dd></div>
        <div><dt>${analyzedAt ? 'Fecha del análisis' : 'Fecha de emisión'}</dt><dd>${escapeHtml(dateFormat.format(reportDate))}</dd></div>
        <div><dt>Páginas del documento</dt><dd>${escapeHtml(pageFormat.format(documentPageCount))}</dd></div>
      </dl>
      <section class="coverage-print-section" aria-labelledby="coverage-print-summary-title">
        <h2 id="coverage-print-summary-title">Resumen ejecutivo</h2>
        <div class="coverage-print-kpis">
          <div><span>Páginas medidas</span><strong>${escapeHtml(pageFormat.format(coverage.pages.length))}</strong><small>Procesadas correctamente</small></div>
          <div><span>Cobertura media total</span><strong>${escapeHtml(numberFormat.format(totalAverage))}%</strong><small>Suma de los cuatro canales</small></div>
          <div><span>Páginas excluidas</span><strong>${escapeHtml(pageFormat.format(failedPages.length))}</strong><small>No incluidas en los promedios</small></div>
        </div>
        <h3>Cobertura media por canal</h3>
        <table class="coverage-print-channel-table">
          <thead><tr><th scope="col">Canal</th><th scope="col">Cobertura media</th></tr></thead>
          <tbody>${channelRows}</tbody>
          <tfoot><tr><th scope="row">Total combinado</th><td>${escapeHtml(numberFormat.format(totalAverage))}%</td></tr></tfoot>
        </table>
        <p class="coverage-print-caption">El total combinado suma los porcentajes de K, C, M e Y; por eso puede superar el 100%.</p>
      </section>
      ${yieldSection}
      ${exclusions}
      <section class="coverage-print-section coverage-print-page-details" aria-labelledby="coverage-print-pages-title">
        <h2 id="coverage-print-pages-title">Detalle por página</h2>
        <table class="coverage-print-page-table">
          <thead><tr><th scope="col">Página</th><th scope="col">Negro</th><th scope="col">Cian</th><th scope="col">Magenta</th><th scope="col">Amarillo</th><th scope="col">Total</th></tr></thead>
          <tbody>${pageRows}</tbody>
          <tfoot><tr>
            <th scope="row">Promedio</th>
            <td>${escapeHtml(numberFormat.format(coverage.average.black))}%</td>
            <td>${escapeHtml(numberFormat.format(coverage.average.cyan))}%</td>
            <td>${escapeHtml(numberFormat.format(coverage.average.magenta))}%</td>
            <td>${escapeHtml(numberFormat.format(coverage.average.yellow))}%</td>
            <td>${escapeHtml(numberFormat.format(totalAverage))}%</td>
          </tr></tfoot>
        </table>
      </section>
      <footer class="coverage-print-footer">
        ${inputMode === 'pdf' ? 'Cobertura calculada localmente a partir del PDF' : 'Cobertura recuperada de datos guardados'} · Rendimiento teórico basado en cobertura media y referencia nominal al 5%.
        <span>DCSS Suite</span>
      </footer>
    </article>`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => htmlEntities[character]);
}
