import { describe, expect, it } from 'vitest';
import type { MaintenanceAnalysis } from './analysis';
import { maintenanceAnalysisMatchesSearch } from './search';

const analysis: MaintenanceAnalysis = {
  serialNumber: 'WXF04807',
  modelLabel: 'FOTOCOPIADORA CANON IR ADV C5535i',
  customerName: 'Cliente de prueba',
  contractReference: 'AF001/26-R0',
  periods: [{
    period: '2026-09',
    paperType: 'Negro A4',
    copies: 12_500,
    counter: 480_000,
    appliedWaste: 0.2,
    optimalMonthly: 20_000,
    ratio: 0.625,
    status: 'ATENCIÓN',
    sourceSheetName: 'Contadores',
    sourceRowNumber: 8,
    sourceDetails: [
      { label: 'División', value: 'Fotocopiadoras' },
      { label: 'Sucursal', value: 'Encarnación' },
    ],
  }],
  averageCopies: 12_500,
  matchedModelLabel: 'Canon iR ADV C5535i',
  usefulLife: 1_500_000,
  optimalBase: 25_000,
  maxWaste: 0.68,
  appliedWaste: 0.2,
  optimalMonthly: 20_000,
  ratio: 0.625,
  status: 'ATENCIÓN',
  recommendedAction: 'Inspeccionar el equipo en la sucursal.',
  latestCounter: 480_000,
  usefulLifePercent: 32,
};

describe('maintenanceAnalysisMatchesSearch', () => {
  it('encuentra metadatos operativos preservados dentro del historial', () => {
    expect(maintenanceAnalysisMatchesSearch(analysis, 'Encarnacion')).toBe(true);
    expect(maintenanceAnalysisMatchesSearch(analysis, 'Fotocopiadoras')).toBe(true);
    expect(maintenanceAnalysisMatchesSearch(analysis, '480 000')).toBe(true);
  });

  it('normaliza tildes, separadores y consultas vacías', () => {
    expect(maintenanceAnalysisMatchesSearch(analysis, 'AF001 26')).toBe(true);
    expect(maintenanceAnalysisMatchesSearch(analysis, '   ')).toBe(true);
    expect(maintenanceAnalysisMatchesSearch(analysis, 'serie inexistente')).toBe(false);
  });
});
