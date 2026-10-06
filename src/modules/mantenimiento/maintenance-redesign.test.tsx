import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { MaintenanceAnalysis, MaintenanceModelRule } from './analysis';
import MaintenanceExecutiveSummary from './MaintenanceExecutiveSummary';
import MaintenanceRulesPanel from './MaintenanceRulesPanel';

const sources = [
  'src/modules/operaciones/MantenimientoModule.tsx',
  'src/modules/mantenimiento/MaintenanceExecutiveSummary.tsx',
  'src/modules/mantenimiento/MaintenanceRulesPanel.tsx',
];

// Clases heredadas que el rediseño compartido reemplaza (el CSS correspondiente ya no existe).
const legacy = /\b(sales-card|card-heading|secondary-button|primary-button|text-button|catalog-header|catalog-table|search-field|compact-field|sales-status)\b/;
const legacyMaintenanceClass = /className=.*\bmaintenance-(?!print|executive-print|page\b)/;

function item(serialNumber: string, status: MaintenanceAnalysis['status'], ratio: number): MaintenanceAnalysis {
  return {
    serialNumber, modelLabel: 'iR1643', customerName: 'Cliente A', contractReference: '', periods: [], averageCopies: 120,
    matchedModelLabel: 'iR1643', usefulLife: 100, optimalBase: 100, maxWaste: 0.7, appliedWaste: 0.1, optimalMonthly: 100,
    ratio, status, recommendedAction: '', latestCounter: 0, usefulLifePercent: 0.5,
  };
}

describe('rediseño de Mantenimiento', () => {
  it.each(sources)('%s usa las primitivas compartidas y no las clases heredadas', (file) => {
    const text = readFileSync(file, 'utf8');
    expect(text.match(legacy)?.[0]).toBeUndefined();
    expect(text.match(legacyMaintenanceClass)?.[0]).toBeUndefined();
  });

  it('el módulo usa PageHeader, StatusLine y Table compartidos', () => {
    const text = readFileSync(sources[0], 'utf8');
    for (const token of ['<PageHeader', '<StatusLine', '<Table', '<Card', 'maintenance-page']) expect(text).toContain(token);
  });

  it('el tablero muestra los seis indicadores y las listas con su descarga', () => {
    const html = renderToStaticMarkup(<MaintenanceExecutiveSummary analyses={[item('S1', 'CRÍTICO', 1.4), item('S2', 'ATENCIÓN', 1.1), item('S3', 'NORMAL', 0.5)]} onExport={() => {}} onPrint={() => {}} />);
    for (const text of ['Estado del parque', 'Normal', 'Críticos', 'Atención', 'Sin mapeo', 'Contador en cero', 'Sobre el óptimo', 'Intervención prioritaria', 'Imprimir resumen PDF', 'Descargar XLSX']) expect(html).toContain(text);
    expect(html).toContain('3 equipos analizados');
  });

  it('sin equipos el tablero no se muestra', () => {
    expect(renderToStaticMarkup(<MaintenanceExecutiveSummary analyses={[]} />)).toBe('');
  });

  it('las reglas listan cada modelo con acciones accesibles y sin editor abierto', () => {
    const rules: MaintenanceModelRule[] = [{ id: 'r1', modelLabel: 'CANON iR ADV 525', usefulLife: 1000000, optimalBase: 65000, maxWaste: 0.7 } as MaintenanceModelRule];
    const html = renderToStaticMarkup(<MaintenanceRulesPanel rules={rules} onChanged={() => {}} onError={() => {}} />);
    expect(html).toContain('CANON iR ADV 525');
    expect(html).toContain('aria-label="Editar CANON iR ADV 525"');
    expect(html).toContain('aria-label="Quitar CANON iR ADV 525"');
    expect(html).toContain('1 reglas');
    expect(html).not.toContain('<dialog');
  });
});
