import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { buildMpsAnalysis } from './analysis';
import { calculateMpsProjection } from './calculations';
import MpsPrintReport, { formatConsumableName } from './MpsPrintReport';
import type { MpsModel } from './repository';

const model: MpsModel = {
  id: 'mps-print-1',
  modelId: 'legacy-print-1',
  brand: 'Canon',
  modelLabel: 'iR ADV C3325i',
  speedPpm: 25,
  isColor: true,
  recVolumeMin: 1000,
  recVolumeMax: 10000,
  isCustom: false,
  isEditable: false,
  consumables: [
    { id: 'toner-k', name: 'Tóner negro', type: 'toner', yieldPages: 36000, color: 'black', sku: 'C-EXV 55 BK' },
    { id: 'drum-k', name: 'Unidad de tambor', type: 'drum', yieldPages: 120000, color: 'monochrome', sku: 'NPG-67 DRUM' },
  ],
};

describe('MPS print report', () => {
  it('renders the legacy report metadata and five-year replacement table', () => {
    const analysis = buildMpsAnalysis(model, 5000);
    if (!analysis) throw new Error('La prueba requiere un análisis válido.');
    const markup = renderToStaticMarkup(
      <MpsPrintReport model={model} analysis={analysis} projections={calculateMpsProjection(model, 5000)} />,
    );

    expect(markup).toContain('Estimación de insumos y suministros Canon');
    expect(markup).toContain('Canon iR ADV C3325i');
    expect(markup).toContain('5.000 páginas/mes');
    expect(markup).toContain('Unidad de tambor');
    expect(markup).toContain('Año 5');
    expect(markup).toContain('C-EXV 55 BK');
  });
});

describe('formatConsumableName', () => {
  it('no añade "(OTHER)" ni "(MONOCHROME)": solo colores reales', () => {
    expect(formatConsumableName('Rodillo de Separación', 'other')).toBe('Rodillo de Separación');
    expect(formatConsumableName('Unidad de tambor', 'monochrome')).toBe('Unidad de tambor');
    expect(formatConsumableName('Unidad de tambor', '')).toBe('Unidad de tambor');
  });

  it('no repite el color si el nombre ya lo dice (con o sin acentos y mayúsculas)', () => {
    expect(formatConsumableName('Tóner Negro T03', 'black')).toBe('Tóner Negro T03');
    expect(formatConsumableName('TÓNER CIÁN T12', 'cyan')).toBe('TÓNER CIÁN T12');
    expect(formatConsumableName('Tóner Amarillo T12', 'yellow')).toBe('Tóner Amarillo T12');
    expect(formatConsumableName('Unidad Reveladora Amarilla', 'yellow')).toBe('Unidad Reveladora Amarilla');
    expect(formatConsumableName('Cartucho Negra', 'black')).toBe('Cartucho Negra');
  });

  it('añade el color en español cuando el nombre no lo trae', () => {
    expect(formatConsumableName('Tóner T12', 'cyan')).toBe('Tóner T12 (Cian)');
    expect(formatConsumableName('Revelador GPR-53', 'Magenta')).toBe('Revelador GPR-53 (Magenta)');
  });

  it('el informe ya no imprime el color en inglés y mayúsculas', () => {
    const analysis = buildMpsAnalysis(model, 5000);
    if (!analysis) throw new Error('La prueba requiere un análisis válido.');
    const markup = renderToStaticMarkup(
      <MpsPrintReport model={model} analysis={analysis} projections={calculateMpsProjection(model, 5000)} />,
    );
    expect(markup).not.toMatch(/\((BLACK|OTHER|MONOCHROME)\)/);
    expect(markup).toContain('Tóner negro');
  });
});
