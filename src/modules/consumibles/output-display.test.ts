import { describe, expect, it } from 'vitest';
import { outputOperationalDetail, outputSourceDetail } from './output-display';
import type { ConsumablesOutputRecord } from './types';

function makeRecord(details: ConsumablesOutputRecord['sourceDetails']): ConsumablesOutputRecord {
  return {
    id: 'output-1',
    sourceType: null,
    recordKind: 'part',
    documentNumber: 1001,
    recordedAt: '2026-06-01',
    month: '2026-06',
    modelLabel: 'iR ADV C3325i',
    serialNumber: 'SER-001',
    partCode: 'RP-001',
    description: 'Fusor',
    quantity: 1,
    yieldPages: 0,
    technician: 'Tec Uno',
    serviceReportNumber: 9001,
    sourceCustomerName: 'Cliente',
    sourceUnitPricePyg: 100000,
    sourceTotalPyg: 100000,
    sourceDetails: details,
    classification: 'original',
    category: 'repuesto',
    family: 'GPR53',
    customerName: 'Cliente',
    customerType: '',
    commercialArea: '',
    contractReference: '',
    orderReference: '',
    contractCommercialArea: '',
    division: '',
    contractType: 'Mantenimiento',
    equipmentId: 'equipment-1',
    sourceFileName: 'salida.xlsx',
    sourceSheetName: 'Hoja 1',
    sourceRowNumber: 2,
  };
}

describe('outputSourceDetail', () => {
  it('matches accented labels and source aliases', () => {
    const record = makeRecord([
      { label: 'Contrato (fuente)', value: 'CTR-001' },
      { label: 'Observaciones', value: 'Entregar en recepción' },
    ]);

    expect(outputSourceDetail(record, ['Contrato'])).toBe('CTR-001');
    expect(outputSourceDetail(record, ['Observaciones'])).toBe('Entregar en recepción');
  });

  it('returns an empty value when the source column was not populated', () => {
    expect(outputSourceDetail(makeRecord([]), ['Contacto'])).toBe('');
  });

  it('prefers the structured projection and falls back to the original row detail', () => {
    const record = makeRecord([{ label: 'Observaciones', value: 'Fila original' }]);
    record.sourceOperational = { observations: 'Campo operativo' };

    expect(outputOperationalDetail(record, 'observations', ['Observaciones'])).toBe('Campo operativo');
    expect(outputOperationalDetail(makeRecord([{ label: 'Contacto', value: 'Ana' }]), 'contact', ['Contacto'])).toBe('Ana');
  });
});
