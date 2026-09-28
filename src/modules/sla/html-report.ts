import type { SlaAnalysis, SlaStatus } from './types';

const percentage = new Intl.NumberFormat('es-PY', { style: 'percent', maximumFractionDigits: 0 });

export function buildSlaHtmlReport(analysis: SlaAnalysis): string {
  const items = analysis.items.map((item) => `
    <tr>
      <td><strong>${escapeHtml(item.category)}</strong><small>${escapeHtml(item.clientSource || 'Sin referencia')}</small></td>
      <td>${escapeHtml(item.clientRequirement)}</td>
      <td>${escapeHtml(item.ourPosition)}<small>${escapeHtml(item.ourSource || 'Sin referencia')}</small></td>
      <td><span class="status ${item.status}">${statusLabel(item.status)}</span></td>
      <td>${escapeHtml(item.advice)}</td>
    </tr>
  `).join('');

  return `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Reporte SLA · ${escapeHtml(analysis.fileName)}</title>
    <style>
      :root { color-scheme: light; font-family: "Segoe UI", Arial, sans-serif; color: #18253d; background: #f3f6fa; }
      body { margin: 0; padding: 32px; line-height: 1.45; }
      main { max-width: 1180px; margin: 0 auto; padding: 32px; background: #fff; border: 1px solid #d3ddeb; border-radius: 18px; box-shadow: 0 12px 30px rgb(24 37 61 / 10%); }
      header { border-bottom: 3px solid #ff6b00; padding-bottom: 20px; margin-bottom: 24px; }
      .eyebrow { color: #007da8; font-size: 12px; font-weight: 800; letter-spacing: .14em; text-transform: uppercase; }
      h1, h2 { margin: 6px 0 0; line-height: 1.1; }
      h1 { font-size: 32px; }
      h2 { font-size: 21px; }
      .meta { color: #51617b; font-size: 13px; margin-top: 8px; }
      .overview { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; margin: 24px 0; }
      .metric { border: 1px solid #d3ddeb; border-radius: 12px; padding: 16px; }
      .metric strong { display: block; font-size: 28px; color: #193a69; }
      .metric span { color: #51617b; font-size: 12px; }
      .summary { border-left: 4px solid #ff6b00; padding: 4px 0 4px 16px; margin: 24px 0; }
      .summary p { margin: 8px 0 0; }
      section { margin-top: 28px; }
      table { width: 100%; border-collapse: collapse; font-size: 13px; }
      th { background: #193a69; color: #fff; text-align: left; }
      th, td { padding: 11px; border: 1px solid #d3ddeb; vertical-align: top; }
      td small { display: block; margin-top: 4px; color: #64748b; }
      .status { display: inline-block; padding: 3px 8px; border-radius: 999px; font-size: 11px; font-weight: 800; white-space: nowrap; }
      .status.complies { color: #087443; background: #e8f8ef; }
      .status.partial { color: #976000; background: #fff5d9; }
      .status.gap { color: #a12323; background: #ffebeb; }
      .status.na { color: #51617b; background: #eef2f7; }
      .lists { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
      .list { border: 1px solid #d3ddeb; border-radius: 12px; padding: 16px; }
      .list.gaps { background: #fff5f5; border-color: #f3c9c9; }
      .list.recommendations { background: #effaf4; border-color: #bce7ce; }
      .list.negotiation { background: #fffaf0; border-color: #f0d8a2; }
      ul { margin: 10px 0 0; padding-left: 20px; }
      li + li { margin-top: 7px; }
      @media print { body { padding: 0; background: #fff; } main { border: 0; box-shadow: none; max-width: none; } }
      @media (max-width: 760px) { body { padding: 12px; } main { padding: 18px; } .overview, .lists { grid-template-columns: 1fr 1fr; } table { font-size: 12px; } }
      @media (max-width: 520px) { .overview, .lists { grid-template-columns: 1fr; } }
    </style>
  </head>
  <body>
    <main>
      <header>
        <div class="eyebrow">Data Systems · Soporte / Compliance</div>
        <h1>Reporte de cumplimiento SLA</h1>
        <div class="meta">Documento: ${escapeHtml(analysis.fileName)} · Generado: ${escapeHtml(analysis.analyzedAt)}</div>
      </header>

      <div class="overview">
        <div class="metric"><strong>${percentage.format(analysis.complianceScore / 100)}</strong><span>Cumplimiento estimado</span></div>
        <div class="metric"><strong>${riskLabel(analysis.overallRisk)}</strong><span>Riesgo general</span></div>
        <div class="metric"><strong>${analysis.items.filter((item) => item.status === 'gap').length}</strong><span>Brechas</span></div>
        <div class="metric"><strong>${analysis.items.filter((item) => item.status === 'partial').length}</strong><span>Condiciones parciales</span></div>
      </div>

      <section class="summary">
        <h2>Resumen ejecutivo</h2>
        <p>${escapeHtml(analysis.summary)}</p>
      </section>

      <section>
        <div class="eyebrow">Detalle / trazabilidad</div>
        <h2>Matriz de cumplimiento</h2>
        <table>
          <thead><tr><th>Categoría / referencia</th><th>Requisito del cliente</th><th>Posición Data Systems</th><th>Estado</th><th>Acción sugerida</th></tr></thead>
          <tbody>${items || '<tr><td colspan="5">No hay requisitos comparables.</td></tr>'}</tbody>
        </table>
      </section>

      <div class="lists">
        ${renderList('Brechas críticas', analysis.criticalGaps, 'gaps')}
        ${renderList('Recomendaciones', analysis.recommendations, 'recommendations')}
        ${renderList('Puntos de negociación', analysis.negotiationPoints, 'negotiation')}
      </div>
    </main>
  </body>
</html>`;
}

function renderList(title: string, entries: readonly string[], className: string): string {
  const content = entries.length > 0
    ? `<ul>${entries.map((entry) => `<li>${escapeHtml(entry)}</li>`).join('')}</ul>`
    : '<p>No hay elementos.</p>';
  return `<section class="list ${className}"><h2>${escapeHtml(title)}</h2>${content}</section>`;
}

function statusLabel(status: SlaStatus): string {
  return { complies: 'Cumple', partial: 'Parcial', gap: 'Brecha', na: 'Revisar' }[status];
}

function riskLabel(risk: SlaAnalysis['overallRisk']): string {
  return { low: 'Bajo', medium: 'Medio', high: 'Alto', critical: 'Crítico' }[risk];
}

function escapeHtml(value: string | number): string {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character] ?? character);
}
