import { describe, expect, it } from 'vitest';
import type { ConsumablesOutputRecord, ConsumablesRecord } from './types';
import type { ServiceRecord } from '../servicios/types';
import { buildContractCostGroups, buildFamilyAnalysis, buildServiceTrendRows, buildSwapFlags } from './legacy-analysis';

function makeRecord(overrides: Partial<ConsumablesRecord> = {}): ConsumablesRecord {
  return {
    id: 'record-1',
    sourceType: null,
    recordedAt: '2026-08-01',
    month: '2026-08',
    modelLabel: 'iR ADV C3325i',
    serialNumber: 'SER-001',
    partCode: 'CODE-001',
    description: 'Tóner compatible',
    quantity: 2,
    costUsd: 100,
    recordKind: 'consumable',
    classification: 'compatible',
    category: 'toner',
    family: 'GPR53',
    customerName: 'Cliente 1',
    customerType: 'Publico',
    commercialArea: 'Strategic',
    contractReference: 'OV-001',
    orderReference: '',
    contractCommercialArea: '',
    division: '',
    contractType: 'Mantenimiento',
    equipmentId: 'equipment-1',
    sourceCustomerName: '',
    sourceOrderReference: '',
    sourceUnitPricePyg: null,
    sourceTotalPyg: null,
    sourceDetails: [],
    sourceFileName: 'detalles.xlsx',
    sourceSheetName: '',
    sourceRowNumber: 0,
    ...overrides,
  };
}

function makeOutput(overrides: Partial<ConsumablesOutputRecord> = {}): ConsumablesOutputRecord {
  return {
    id: 'output-1',
    sourceType: null,
    recordKind: 'consumable',
    documentNumber: 1001,
    recordedAt: '2026-08-01',
    month: '2026-08',
    modelLabel: 'iR ADV C3325i',
    serialNumber: 'SER-001',
    partCode: 'CODE-001',
    description: 'Tóner compatible black',
    quantity: 1,
    yieldPages: 0,
    technician: '',
    serviceReportNumber: 0,
    sourceCustomerName: 'Cliente 1',
    sourceUnitPricePyg: null,
    sourceTotalPyg: null,
    sourceDetails: [],
    classification: 'compatible',
    category: 'toner',
    family: 'GPR53',
    customerName: 'Cliente 1',
    customerType: 'Publico',
    commercialArea: 'Strategic',
    contractReference: 'OV-001',
    orderReference: '',
    contractCommercialArea: '',
    division: '',
    contractType: 'Mantenimiento',
    equipmentId: 'equipment-1',
    sourceFileName: 'salida.xlsx',
    sourceSheetName: '',
    sourceRowNumber: 0,
    ...overrides,
  };
}

function makeService(overrides: Partial<ServiceRecord> = {}): ServiceRecord {
  return {
    id: 'service-1',
    serviceNumber: 2001,
    orderReference: 'OV-001',
    recordedAt: '2026-08-02',
    month: '2026-08',
    serviceType: 'LAM',
    taskType: 'Reparación',
    sourceContractType: 'Mantenimiento',
    technician: 'Técnico 1',
    taskCompleted: '',
    partsUsed: '',
    modelLabel: 'iR ADV C3325i',
    serialNumber: 'SER-001',
    sourceCustomerName: 'Cliente 1',
    sourceDetails: [],
    family: 'GPR53',
    customerName: 'Cliente 1',
    customerType: 'Publico',
    commercialArea: 'Strategic',
    contractReference: 'OV-001',
    contractType: 'Mantenimiento',
    equipmentId: 'equipment-1',
    sourceFileName: 'servicios.xlsx',
    sourceSheetName: '',
    sourceRowNumber: 0,
    ...overrides,
  };
}

describe('legacy consumables analysis', () => {
  it('reconstructs family KPIs and monthly cost/quantity series', () => {
    const result = buildFamilyAnalysis([
      makeRecord({ id: 'original', classification: 'original', costUsd: 200, quantity: 4 }),
      makeRecord({ id: 'compatible', classification: 'compatible', costUsd: 100, quantity: 2 }),
      makeRecord({ id: 'other', category: 'cilindro', description: 'Cilindro', costUsd: 50, quantity: 1 }),
      makeRecord({ id: 'other-family', family: 'T03' }),
    ], 'GPR53');

    expect(result).toMatchObject({
      records: 3,
      tonerRecords: 2,
      otherRecords: 1,
      originalQuantity: 4,
      compatibleQuantity: 2,
      otherQuantity: 1,
      originalCostUsd: 200,
      compatibleCostUsd: 100,
      otherCostUsd: 50,
    });
    expect(result.monthly).toEqual([{
      month: '2026-08',
      originalQuantity: 4,
      compatibleQuantity: 2,
      otherQuantity: 1,
      originalCostUsd: 200,
      compatibleCostUsd: 100,
      otherCostUsd: 50,
    }]);
  });

  it('groups contract costs by contract type and counts distinct contracts', () => {
    const groups = buildContractCostGroups([
      makeRecord({ id: 'a', costUsd: 100, contractReference: 'OV-001', contractType: 'Mantenimiento' }),
      makeRecord({ id: 'b', costUsd: 20, recordKind: 'part', contractReference: 'OV-001', contractType: 'Mantenimiento' }),
      makeRecord({ id: 'c', costUsd: 50, classification: 'original', contractReference: 'OV-002', contractType: 'Leasing' }),
    ]);

    expect(groups).toEqual([
      { key: 'Mantenimiento', label: 'Mantenimiento', contracts: 1, records: 2, originalCostUsd: 0, compatibleCostUsd: 100, partCostUsd: 20 },
      { key: 'Leasing', label: 'Leasing', contracts: 1, records: 1, originalCostUsd: 50, compatibleCostUsd: 0, partCostUsd: 0 },
    ]);
  });

  it('counts related services only for equipment with a consumable in the same month', () => {
    const rows = buildServiceTrendRows(
      [
        makeService({ id: 'related', serialNumber: 'SER-001', recordedAt: '2026-08-03' }),
        makeService({ id: 'unrelated', serialNumber: 'SER-999', recordedAt: '2026-08-03' }),
        makeService({ id: 'next-month', serialNumber: 'SER-001', recordedAt: '2026-09-03', month: '2026-09' }),
      ],
      [
        makeOutput({ id: 'toner', serialNumber: 'SER-001', recordedAt: '2026-08-01' }),
        makeOutput({ id: 'cylinder', serialNumber: 'SER-002', recordedAt: '2026-09-01', month: '2026-09', category: 'cilindro', classification: 'original' }),
      ],
    );

    expect(rows).toEqual([
      { month: '2026-08', services: 1, consumables: 1, originals: 0, compatibles: 1 },
      { month: '2026-09', services: 0, consumables: 1, originals: 1, compatibles: 0 },
    ]);
  });

  it('flags a compatible-to-original toner sequence within three days', () => {
    const flags = buildSwapFlags(
      [makeService({ id: 'service-flag', recordedAt: '2026-08-02', partsUsed: 'Toner O' })],
      [makeOutput({ id: 'output-flag', recordedAt: '2026-08-01' })],
    );

    expect(flags.flaggedOutputIds).toEqual(new Set(['output-flag']));
    expect(flags.flaggedServiceIds).toEqual(new Set(['service-flag']));
    expect(flags.flaggedSerials).toEqual(new Set(['SER-001']));
  });
});
