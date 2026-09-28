import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { buildMpsAnalysis } from './analysis';
import { calculateMpsProjection } from './calculations';
import MpsPrintReport from './MpsPrintReport';
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
