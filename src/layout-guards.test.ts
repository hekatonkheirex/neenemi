import { readCssBundle } from './test-support/css';
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readCssBundle('src/index.css');
const rule = (selector: string) => css.match(new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*{([^}]*)}`))?.[1] ?? '';

describe('guardas de maquetación (hallazgos del barrido en navegador)', () => {
  it('el detalle de fuente con cientos de series no crece sin límite (20 000 px de alto)', () => {
    const r = rule('.source-details-grid');
    expect(r).toMatch(/max-height:\s*22rem/);
    expect(r).toMatch(/overflow-y:\s*auto/);
  });
  it('Campos compactos: la pista de la rejilla no crece más que la celda (input type=month a 1280 px)', () => {
    expect(rule('.compact-field')).toMatch(/grid-template-columns:\s*minmax\(0, 1fr\)/);
  });
  it('Mantenimiento: las fichas KPI y el gráfico de tendencia pueden encogerse en celdas estrechas', () => {
    const summary = fs.readFileSync('src/modules/mantenimiento/MaintenanceExecutiveSummary.tsx', 'utf8');
    expect(summary).toContain('grid-cols-2 gap-3 sm:grid-cols-3 min-[1180px]:grid-cols-6');
    expect(summary).toMatch(/grid min-w-0 gap-1 rounded-xl/);
    expect(summary).toContain('h-6 min-w-10 flex-[0_1_auto]');
  });
  it('960 px: la cabecera de módulo envuelve sus acciones', () => {
    expect(rule('.catalog-header')).toMatch(/flex-wrap:\s*wrap/);
  });
  it('960 px: la tabla de mano de obra de Proformas desplaza dentro de su tarjeta y deja "Precio venta" alcanzable', () => {
    const module = fs.readFileSync('src/modules/ventas/ProformasModule.tsx', 'utf8');
    expect(module).toContain('<Table className="min-w-[36rem]">');
    expect(module).toContain('Precio venta {priceLabel}');
  });
  it('Viáticos: controles, barras mensuales y paneles se adaptan al ancho de su tarjeta', () => {
    const module = fs.readFileSync('src/modules/viaticos/ViaticosModule.tsx', 'utf8');
    expect(module).toContain('grid-cols-[repeat(auto-fit,minmax(min(100%,11rem),1fr))]');
    expect(module).toContain('min-w-[calc(12*2.8rem+11*0.3rem)]');
    const overview = fs.readFileSync('src/modules/viaticos/TravelOverviewPanels.tsx', 'utf8');
    expect(overview).toContain('@[48rem]:grid-cols-2');
    expect(overview).toContain('grid-cols-[minmax(0,1fr)_auto]');
  });
  it('pestañas con subtítulo: el texto puede bajar de línea en vez de cortarse a 960 px', () => {
    expect(rule('.anim-tabs.has-hint button')).toMatch(/white-space:\s*normal/);
  });
  it('encabezados de tarjeta: el contador pasa a otra línea si no cabe (SLA, badge "5" a 960 px)', () => {
    expect(rule('.card-heading')).toMatch(/flex-wrap:\s*wrap/);
  });
});
