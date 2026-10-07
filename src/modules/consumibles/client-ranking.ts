import type { ConsumablesRecord } from './types';

export type CostParts = { originalQuantity: number; originalCostUsd: number; compatibleQuantity: number; compatibleCostUsd: number; partQuantity: number; partCostUsd: number; totalCostUsd: number; records: number; equipment: number };
export type RankingClientRow = CostParts & { key: string; clientName: string; customerType: string; commercialArea: string; equipmentIds: Set<string> };

export const CONSUMABLES_COST_COLORS = {
  // Azul medio: el azul marino de la marca desaparecía sobre el panel oscuro.
  original: '#4f7bc4',
  compatible: '#ff6b00',
  parts: '#7c3aed',
};

const integerFormat = new Intl.NumberFormat('es-PY', { maximumFractionDigits: 0 });

export function emptyCostParts(): CostParts {
  return { originalQuantity: 0, originalCostUsd: 0, compatibleQuantity: 0, compatibleCostUsd: 0, partQuantity: 0, partCostUsd: 0, totalCostUsd: 0, records: 0, equipment: 0 };
}

export function addRecordToCostParts(target: CostParts, record: ConsumablesRecord) {
  target.records += 1;
  target.totalCostUsd += record.costUsd;
  if (record.recordKind === 'part') {
    target.partQuantity += record.quantity;
    target.partCostUsd += record.costUsd;
  } else if (record.classification === 'original') {
    target.originalQuantity += record.quantity;
    target.originalCostUsd += record.costUsd;
  } else {
    target.compatibleQuantity += record.quantity;
    target.compatibleCostUsd += record.costUsd;
  }
}

export function buildClientRows(records: ConsumablesRecord[]): RankingClientRow[] {
  const byClient = new Map<string, RankingClientRow>();
  for (const record of records) {
    const key = record.customerName || 'Sin cliente';
    const current = byClient.get(key) ?? { key, clientName: key, customerType: record.customerType, commercialArea: record.commercialArea, equipmentIds: new Set<string>(), ...emptyCostParts() };
    addRecordToCostParts(current, record);
    current.equipmentIds.add(record.equipmentId || record.serialNumber);
    current.equipment = current.equipmentIds.size;
    if (!current.customerType && record.customerType) current.customerType = record.customerType;
    if (!current.commercialArea && record.commercialArea) current.commercialArea = record.commercialArea;
    byClient.set(key, current);
  }
  return [...byClient.values()];
}

export function rankClientRows(rows: readonly RankingClientRow[]): RankingClientRow[] {
  // El sort estable conserva el orden de aparición del cliente cuando los costos empatan.
  return [...rows].sort((left, right) => -(left.totalCostUsd - right.totalCostUsd));
}

export function formatPygValue(valuePyg: number): string {
  return `₲ ${integerFormat.format(Math.round(valuePyg))}`;
}
