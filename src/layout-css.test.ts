import { readCssBundle } from './test-support/css';
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

// Regresiones de layout encontradas medidas en 960-1350 px (el mínimo de la ventana Electron es 960).
const css = readCssBundle('src/index.css');

describe('layout entre 960 y 1350 px', () => {
  it('las acciones de la cabecera pueden pasar a otra línea', () => {
    expect(fs.readFileSync('src/core/ui/page-header.tsx', 'utf8')).toContain('flex flex-wrap items-end justify-between gap-4');
    expect(fs.readFileSync('src/core/ui/page-header.tsx', 'utf8')).toContain('flex flex-wrap items-center gap-2');
  });

  it('los filtros de Mantenimiento envuelven en una rejilla auto-fit y la tabla desplaza dentro de su tarjeta', () => {
    const module = fs.readFileSync('src/modules/operaciones/MantenimientoModule.tsx', 'utf8');
    expect(module).toContain('grid-cols-[repeat(auto-fit,minmax(min(100%,12rem),1fr))]');
    expect(module).not.toMatch(/maintenance-normal-toggle/);
    expect(css).not.toMatch(/\.maintenance-(?!print|executive-print|page\b)[a-z-]+/);
  });


  it('Proformas: bajo 1500 px el lateral pasa a celdas del grid y el Resumen es una barra fija inferior', () => {
    const module = fs.readFileSync('src/modules/ventas/ProformasModule.tsx', 'utf8');
    expect(module).toContain('min-[1500px]:grid-cols-[minmax(0,1fr)_22rem]');
    expect(module).toContain('<aside className="contents min-[1500px]:grid');
    expect(module).toContain('sticky bottom-0 z-10');
    expect(module).toContain('min-[1500px]:static');
  });


  it('PDF de MPS: el título no hereda el h1 global y las tarjetas no heredan el estilo de tarjeta de theme.css', () => {
    expect(css).toMatch(/\.mps-print-title-row h1\s*{\s*max-width:\s*none[^}]*letter-spacing:\s*-0\.01em/);
    // theme.css pinta [class*='-card'] (incluye mps-print-meta-card); la anulación necesita más especificidad.
    expect(css).toMatch(/html body\[data-print-mode='mps-analysis'\] \.mps-print-meta-card\s*{\s*border:\s*0;\s*background:\s*transparent;\s*box-shadow:\s*none/);
  });

  describe('tablas de Consumibles (medido a 960-1440 px)', () => {
    const panels = fs.readFileSync('src/modules/consumibles/LegacyAnalysisPanels.tsx', 'utf8');
    const module = fs.readFileSync('src/modules/consumibles/ConsumiblesModule.tsx', 'utf8');

    it('las tablas desplazan dentro de su tarjeta y son contenedor para que el detalle ocupe el ancho visible', () => {
      expect(panels).toContain('wrapperClassName="@container max-h-[40rem]"');
      expect(panels).toContain('sticky left-0 box-border w-[100cqw]');
      expect(module.match(/<Table className="min-w-\[/g)?.length).toBeGreaterThanOrEqual(5);
    });

    it('el CSS de las tablas heredadas ya no existe', () => {
      expect(css).not.toMatch(/\.(catalog-table|consumables-table|outputs-table|legacy-[a-z-]*table|contract-analytics-table|dispatch-equipment-table)/);
    });
  });

  it('Consumibles: la columna lateral de importaciones baja bajo 1500 px', () => {
    const module = fs.readFileSync('src/modules/consumibles/ConsumiblesModule.tsx', 'utf8');
    expect(module).toContain('min-[1500px]:grid-cols-[minmax(0,1fr)_22rem]');
    expect(css).not.toMatch(/\.consumables-layout/);
  });

  it('Viáticos: la tabla de viajes desplaza dentro de su tarjeta y no parte fecha ni importe', () => {
    const module = fs.readFileSync('src/modules/viaticos/ViaticosModule.tsx', 'utf8');
    expect(module).toContain('<Table className="min-w-[48rem] [overflow-wrap:normal]">');
    expect(module.match(/whitespace-nowrap font-mono text-xs/g)).toHaveLength(1);
    expect(module).toContain('whitespace-nowrap font-semibold tabular-nums');
  });

  it('Consumibles: la columna de fecha no parte el origen en 2-3 líneas', () => {
    const module = fs.readFileSync('src/modules/consumibles/ConsumiblesModule.tsx', 'utf8');
    expect(module).toContain('<TableCell className="min-w-[9rem]">');
  });
});

describe('revisión visual 2026-10', () => {
  const indexCss = css;
  const themeCss = readCssBundle('src/theme.css');

  it('h1 global de herramienta: tope de 3.25rem y sin tracking extremo', () => {
    expect(indexCss).toMatch(/\nh1\s*{[^}]*font-size:\s*clamp\(2\.25rem,\s*3\.6vw,\s*3\.25rem\)[^}]*letter-spacing:\s*-0\.045em/);
  });

  it('el botón primario deshabilitado no brilla ni responde al puntero (Button compartido)', () => {
    const button = fs.readFileSync('src/core/ui/button.tsx', 'utf8');
    expect(button).toContain('disabled:pointer-events-none disabled:opacity-50');
    expect(button).toContain('bg-brand');
    expect(indexCss).not.toMatch(/\.primary-button/);
  });

});


describe('barra de paginación', () => {
  it('usa utilidades Tailwind y el Button compartido: sin CSS heredado de .pagination-*', () => {
    const source = fs.readFileSync('src/core/PaginationControls.tsx', 'utf8');
    expect(source).toContain('flex flex-wrap items-center justify-between gap-3');
    expect(source).toContain("from './ui/button'");
    expect(css).not.toMatch(/\.pagination-(controls|count|page|size|actions)/);
  });
});

describe('Discontinuador', () => {
  const module = fs.readFileSync('src/modules/operaciones/DescontinuadorModule.tsx', 'utf8');

  it('las tarjetas de resumen, los modelos y la cartera se adaptan al ancho de su tarjeta', () => {
    expect(module).toContain('@[44rem]:grid-cols-2 @[68rem]:grid-cols-3');
    expect(module).toContain('grid-cols-[repeat(auto-fill,minmax(min(100%,13rem),1fr))]');
    expect(module).toContain('@[56rem]:grid-cols-[minmax(16rem,1fr)_minmax(0,2.2fr)]');
  });

  it('las tablas desplazan dentro de su tarjeta y no parten fechas ni estados', () => {
    expect(module.match(/<Table className="min-w-\[/g)?.length).toBeGreaterThanOrEqual(3);
    expect(module).toContain('<Badge className="whitespace-nowrap"');
    expect(css).not.toMatch(/\.(discontinuation-|stock-table|operations-table)/);
  });
});
