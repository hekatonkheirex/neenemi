import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = fs.readFileSync(new URL('./index.css', import.meta.url), 'utf8');
const rule = (selector: string) => css.match(new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*{([^}]*)}`))?.[1] ?? '';

describe('guardas de maquetación (hallazgos del barrido en navegador)', () => {
  it('los controles de Viáticos no se salen de su celda (campo "Mes" +7 px)', () => {
    expect(rule('.travel-controls > label,\n.travel-controls .compact-field input')).toMatch(/min-width:\s*0/);
  });
  it('el detalle de fuente con cientos de series no crece sin límite (20 000 px de alto)', () => {
    const r = rule('.source-details-grid');
    expect(r).toMatch(/max-height:\s*22rem/);
    expect(r).toMatch(/overflow-y:\s*auto/);
  });
  it('Campos compactos: la pista de la rejilla no crece más que la celda (input type=month a 1280 px)', () => {
    expect(rule('.compact-field')).toMatch(/grid-template-columns:\s*minmax\(0, 1fr\)/);
  });
  it('Mantenimiento: la tarjeta KPI no se ensancha por su contenido (126 px en una celda de 112)', () => {
    expect(rule('.maintenance-executive-kpi')).toMatch(/grid-template-columns:\s*minmax\(0, 1fr\)/);
  });
  it('Mantenimiento: el gráfico de tendencia de críticos puede encogerse en tarjetas de 138 px', () => {
    const r = rule('.maintenance-critical-trend');
    expect(r).toMatch(/flex:\s*0 1 auto/);
    expect(r).toMatch(/min-width:\s*2\.5rem/);
  });
  it('Viáticos: el input de mes lleva el mismo fondo oscuro y borde que los select vecinos', () => {
    const block = css.match(/vecinos \(Estado, Medio\)[^\n]*\*\/\n\.travel-controls \.compact-field input \{([^}]*)\}/)?.[1] ?? '';
    expect(block).toMatch(/background:\s*rgba\(18, 31, 54, 0\.7\)/);
    expect(block).toMatch(/border:\s*1px solid rgba\(144, 174, 229, 0\.17\)/);
  });
  it('Viáticos: el contador de viajes pasa a otra línea en vez de cortar el nombre del medio', () => {
    expect(css).toMatch(/\.travel-overview-row-heading,\n\.travel-overview-destination-content > div:first-child \{\s*flex-wrap:\s*wrap/);
  });
  it('960 px: cabecera y acciones envuelven, y la rejilla mensual cabe sus 12 columnas', () => {
    expect(rule('.catalog-header')).toMatch(/flex-wrap:\s*wrap/);
    expect(rule('.travel-actions')).toMatch(/flex-wrap:\s*wrap/);
    expect(rule('.travel-bars-grid')).toMatch(/min-width:\s*calc\(12 \* 3\.2rem \+ 11 \* 0\.55rem\)/);
  });
  it('tarjetas estrechas de Viáticos: fila de medio en dos líneas (la barra debajo)', () => {
    expect(css).toMatch(/@media \(max-width: 1150px\) \{\s*\.travel-overview-row \{\s*grid-template-columns:\s*minmax\(0, 1fr\) auto/);
  });
  it('pestañas con subtítulo: el texto puede bajar de línea en vez de cortarse a 960 px', () => {
    expect(rule('.anim-tabs.has-hint button')).toMatch(/white-space:\s*normal/);
  });
  it('encabezados de tarjeta: el contador pasa a otra línea si no cabe (SLA, badge "5" a 960 px)', () => {
    expect(rule('.card-heading')).toMatch(/flex-wrap:\s*wrap/);
  });
  it('Discontinuador: las tres tarjetas de resumen pasan a 2 columnas hasta 1150 px (piden 741 px mínimo)', () => {
    expect(css).toMatch(/@media \(max-width: 1150px\) \{\s*\.discontinuation-insights \{\s*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/);
  });
  it('Discontinuador: la cabecera de la tarjeta de modelo envuelve (badge + contador justo al límite a 960 px)', () => {
    expect(rule('.discontinuation-model-card-heading')).toMatch(/flex-wrap:\s*wrap/);
  });
});
