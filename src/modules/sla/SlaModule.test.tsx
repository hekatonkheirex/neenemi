import fs from 'node:fs';
import path from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import SlaModule, { SlaResults } from './SlaModule';
import type { SlaAnalysis } from './types';

const analysis: SlaAnalysis = {
  fileName: 'pliego.txt', textExcerpt: 'x', source: 'local', usedFallback: false, complianceScore: 72, overallRisk: 'high',
  summary: 'Resumen del cruce.', criticalGaps: ['Falta cobertura 24x7'], recommendations: [], negotiationPoints: ['Tiempo de respuesta'],
  items: [
    { id: 'a', category: 'Horario', clientRequirement: 'Atención 24x7', clientSource: 'cláusula 3', ourPosition: 'Lunes a viernes', ourSource: '§ 2', status: 'gap', advice: 'Negociar' },
    { id: 'b', category: 'Respuesta', clientRequirement: '4 horas', clientSource: 'cláusula 5', ourPosition: '4 horas hábiles', ourSource: '§ 4', status: 'complies', advice: 'Sin acción' },
  ],
} as unknown as SlaAnalysis;

describe('SlaModule', () => {
  it('estado inicial: cabecera, estado en vivo, formulario y referencia, con el informe pendiente', () => {
    const markup = renderToStaticMarkup(<SlaModule />);
    expect(markup).toContain('SLA Compliance Analyzer');
    expect(markup).toContain('aria-live="polite"');
    expect(markup).toContain('Cargando SLA de referencia…');
    expect(markup).toContain('El informe aparecerá aquí.');
    expect(markup).toContain('aria-label="Referencia del SLA base"');
    expect(markup).toMatch(/<button[^>]*disabled[^>]*>Imprimir \/ PDF<\/button>/);
    expect(markup).toMatch(/<button[^>]*type="submit"[^>]*id="btn-ai"|<button[^>]*id="btn-ai"[^>]*type="submit"/);
    expect(markup).toMatch(/<button[^>]*type="submit"[^>]*id="btn-local"|<button[^>]*id="btn-local"[^>]*type="submit"/);
  });

  it('los análisis IA y local siguen distinguiéndose por el id del botón que envía el formulario', () => {
    const source = fs.readFileSync(path.join(import.meta.dirname, 'SlaModule.tsx'), 'utf8');
    expect(source).toContain("submitter?.id === 'btn-ai'");
  });

  it('el panel de entrada, la referencia y la IA no se imprimen', () => {
    const markup = renderToStaticMarkup(<SlaModule />);
    expect(markup.match(/print:hidden/g)!.length).toBeGreaterThanOrEqual(4);
  });

  it('sin clases heredadas del módulo', () => {
    expect(renderToStaticMarkup(<SlaModule />)).not.toMatch(/class="[^"]*(sla-|sales-card|catalog-header|secondary-button|primary-button)/);
  });
});

describe('SlaResults', () => {
  const markup = renderToStaticMarkup(<SlaResults analysis={analysis} statusCounts={{ complies: 1, partial: 0, gap: 1 }} />);

  it('resume cumplimiento, riesgo y conteos', () => {
    expect(markup).toMatch(/72\D{0,2}%/);
    expect(markup).toContain('>Alto<');
    expect(markup).toContain('2 cláusulas revisadas');
    expect(markup).toContain('1 cumplen');
  });

  it('el riesgo tiñe su tarjeta sin conservar el fondo base (que ganaría en tema oscuro)', () => {
    expect(markup).toMatch(/<div class="[^"]*bg-\[#d92d20\]\/10[^"]*"[^>]*><div[^>]*>Riesgo general/);
    expect(markup).not.toMatch(/bg-\[#d92d20\]\/10[^"]*dark:bg-panel/);
  });

  it('la tabla mantiene su ancho mínimo y marca cada estado con su tono', () => {
    expect(markup).toContain('min-w-[600px]');
    expect(markup).toMatch(/text-\[#912018\]![^>]*>Brecha</);
    expect(markup).toMatch(/text-\[#14532d\]![^>]*>Cumple</);
  });

  it('lista brechas y negociación, y avisa cuando una lista está vacía', () => {
    expect(markup).toContain('Falta cobertura 24x7');
    expect(markup).toContain('Tiempo de respuesta');
    expect(markup).toContain('No hay recomendaciones adicionales.');
    expect(markup).not.toContain('<li');
  });
});
