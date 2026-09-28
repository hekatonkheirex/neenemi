import type { ConsumablesFamily, ConsumablesOutputRecord, ConsumablesRecord } from './types';
import type { ServiceRecord } from '../servicios/types';

export type LegacyFamilyMonth = {
  month: string;
  originalQuantity: number;
  compatibleQuantity: number;
  otherQuantity: number;
  originalCostUsd: number;
  compatibleCostUsd: number;
  otherCostUsd: number;
};

export type LegacyFamilyAnalysis = {
  family: ConsumablesFamily;
  records: number;
  tonerRecords: number;
  otherRecords: number;
  originalQuantity: number;
  compatibleQuantity: number;
  otherQuantity: number;
  originalCostUsd: number;
  compatibleCostUsd: number;
  otherCostUsd: number;
  monthly: LegacyFamilyMonth[];
};

export type LegacyContractCostGroup = {
  key: string;
  label: string;
  contracts: number;
  records: number;
  originalCostUsd: number;
  compatibleCostUsd: number;
  partCostUsd: number;
};

export type LegacyServiceTrendRow = {
  month: string;
  services: number;
  consumables: number;
  originals: number;
  compatibles: number;
};

export type LegacySwapFlags = {
  flaggedOutputIds: Set<string>;
  flaggedServiceIds: Set<string>;
  flaggedSerials: Set<string>;
};

type TonerSignal = {
  date: string;
  classification: 'original' | 'compatible';
  color: string | null;
  source: 'output' | 'service';
  id: string;
  order: number;
};

const TONER_MENTION_PAREN_RE = /TONER\s*(?:T0[36]\s*)?[([]\s*([OG])\s*[)\]]/gi;
const TONER_MENTION_BARE_RE = /TONER\s+(?:T0[36]\s+)?([OG])\b(?!\w)/gi;

export function buildFamilyAnalysis(records: readonly ConsumablesRecord[], family: ConsumablesFamily): LegacyFamilyAnalysis {
  const familyRecords = records.filter((record) => record.recordKind === 'consumable' && record.family === family);
  const monthly = new Map<string, LegacyFamilyMonth>();
  let tonerRecords = 0;
  let otherRecords = 0;
  let originalQuantity = 0;
  let compatibleQuantity = 0;
  let otherQuantity = 0;
  let originalCostUsd = 0;
  let compatibleCostUsd = 0;
  let otherCostUsd = 0;

  for (const record of familyRecords) {
    const isToner = record.category === 'toner';
    const month = getMonth(record);
    const current = monthly.get(month) ?? {
      month,
      originalQuantity: 0,
      compatibleQuantity: 0,
      otherQuantity: 0,
      originalCostUsd: 0,
      compatibleCostUsd: 0,
      otherCostUsd: 0,
    };

    if (!isToner) {
      otherRecords += 1;
      otherQuantity += record.quantity;
      otherCostUsd += record.costUsd;
      current.otherQuantity += record.quantity;
      current.otherCostUsd += record.costUsd;
    } else if (record.classification === 'original') {
      tonerRecords += 1;
      originalQuantity += record.quantity;
      originalCostUsd += record.costUsd;
      current.originalQuantity += record.quantity;
      current.originalCostUsd += record.costUsd;
    } else {
      tonerRecords += 1;
      compatibleQuantity += record.quantity;
      compatibleCostUsd += record.costUsd;
      current.compatibleQuantity += record.quantity;
      current.compatibleCostUsd += record.costUsd;
    }

    monthly.set(month, current);
  }

  return {
    family,
    records: familyRecords.length,
    tonerRecords,
    otherRecords,
    originalQuantity,
    compatibleQuantity,
    otherQuantity,
    originalCostUsd,
    compatibleCostUsd,
    otherCostUsd,
    monthly: [...monthly.values()].sort(compareMonths),
  };
}

export function buildContractCostGroups(records: readonly ConsumablesRecord[]): LegacyContractCostGroup[] {
  type MutableGroup = LegacyContractCostGroup & { contractKeys: Set<string> };
  const groups = new Map<string, MutableGroup>();

  for (const record of records) {
    const key = record.contractType || 'Sin tipo';
    const current = groups.get(key) ?? {
      key,
      label: key,
      contracts: 0,
      records: 0,
      originalCostUsd: 0,
      compatibleCostUsd: 0,
      partCostUsd: 0,
      contractKeys: new Set<string>(),
    };
    const contractKey = record.contractReference || record.equipmentId || record.customerName || record.id;
    current.contractKeys.add(contractKey);
    current.records += 1;
    if (record.recordKind === 'part') current.partCostUsd += record.costUsd;
    else if (record.classification === 'original') current.originalCostUsd += record.costUsd;
    else current.compatibleCostUsd += record.costUsd;
    current.contracts = current.contractKeys.size;
    groups.set(key, current);
  }

  return [...groups.values()]
    .map(({ contractKeys: _contractKeys, ...group }) => group)
    .sort((left, right) => totalGroupCost(right) - totalGroupCost(left) || left.label.localeCompare(right.label, 'es'));
}

export function buildServiceTrendRows(
  services: readonly ServiceRecord[],
  outputs: readonly ConsumablesOutputRecord[],
): LegacyServiceTrendRow[] {
  const rows = new Map<string, LegacyServiceTrendRow>();
  const outputSerialsByMonth = new Map<string, Set<string>>();

  for (const output of outputs) {
    if (output.recordKind !== 'consumable' || !isServiceConsumable(output)) continue;
    const month = getMonth(output);
    const current = ensureServiceTrendRow(rows, month);
    current.consumables += 1;
    if (output.classification === 'original') current.originals += 1;
    else current.compatibles += 1;
    const serials = outputSerialsByMonth.get(month) ?? new Set<string>();
    if (output.serialNumber) serials.add(output.serialNumber);
    outputSerialsByMonth.set(month, serials);
  }

  for (const service of services) {
    const month = getMonth(service);
    const current = ensureServiceTrendRow(rows, month);
    if (service.serialNumber && outputSerialsByMonth.get(month)?.has(service.serialNumber)) current.services += 1;
  }

  return [...rows.values()].sort(compareMonths);
}

export function buildSwapFlags(
  services: readonly ServiceRecord[],
  outputs: readonly ConsumablesOutputRecord[],
): LegacySwapFlags {
  const signalsBySerial = new Map<string, TonerSignal[]>();
  let order = 0;

  for (const output of outputs) {
    if (!output.serialNumber || output.recordKind !== 'consumable' || output.category !== 'toner') continue;
    const signals = signalsBySerial.get(output.serialNumber) ?? [];
    signals.push({
      date: output.recordedAt || output.month,
      classification: output.classification,
      color: colorOf(output.description),
      source: 'output',
      id: output.id,
      order: order++,
    });
    signalsBySerial.set(output.serialNumber, signals);
  }

  for (const service of services) {
    if (!service.serialNumber) continue;
    const mentions = extractTonerMentions(`${service.partsUsed}\n${service.taskCompleted}`);
    if (mentions.length === 0) continue;
    const signals = signalsBySerial.get(service.serialNumber) ?? [];
    for (const classification of mentions) {
      signals.push({
        date: service.recordedAt || service.month,
        classification,
        color: null,
        source: 'service',
        id: service.id,
        order: order++,
      });
    }
    signalsBySerial.set(service.serialNumber, signals);
  }

  const flaggedOutputIds = new Set<string>();
  const flaggedServiceIds = new Set<string>();
  const flaggedSerials = new Set<string>();

  for (const [serialNumber, signals] of signalsBySerial) {
    const sorted = [...signals].sort((left, right) => left.date.localeCompare(right.date) || left.order - right.order);
    for (let index = 0; index < sorted.length - 1; index += 1) {
      const current = sorted[index];
      const next = sorted[index + 1];
      if (current.classification !== 'compatible' || next.classification !== 'original') continue;
      if (current.color && next.color && current.color !== next.color) continue;
      if (!withinDays(current.date, next.date, 3)) continue;

      flaggedSerials.add(serialNumber);
      for (const signal of [current, next]) {
        if (signal.source === 'output') flaggedOutputIds.add(signal.id);
        else flaggedServiceIds.add(signal.id);
      }
    }
  }

  return { flaggedOutputIds, flaggedServiceIds, flaggedSerials };
}

export function isServiceConsumable(output: ConsumablesOutputRecord): boolean {
  return output.category === 'toner' || output.category === 'cilindro';
}

function ensureServiceTrendRow(rows: Map<string, LegacyServiceTrendRow>, month: string): LegacyServiceTrendRow {
  const current = rows.get(month) ?? { month, services: 0, consumables: 0, originals: 0, compatibles: 0 };
  rows.set(month, current);
  return current;
}

function getMonth(record: { month: string; recordedAt: string }): string {
  return record.month || record.recordedAt.slice(0, 7) || 'Sin fecha';
}

function compareMonths(left: { month: string }, right: { month: string }): number {
  if (left.month === 'Sin fecha') return right.month === 'Sin fecha' ? 0 : 1;
  if (right.month === 'Sin fecha') return -1;
  return left.month.localeCompare(right.month);
}

function totalGroupCost(group: Pick<LegacyContractCostGroup, 'originalCostUsd' | 'compatibleCostUsd' | 'partCostUsd'>): number {
  return group.originalCostUsd + group.compatibleCostUsd + group.partCostUsd;
}

function withinDays(left: string, right: string, days: number): boolean {
  const leftTime = Date.parse(left);
  const rightTime = Date.parse(right);
  if (!Number.isFinite(leftTime) || !Number.isFinite(rightTime)) return false;
  return Math.abs(rightTime - leftTime) <= days * 24 * 60 * 60 * 1000;
}

function colorOf(description: string): string | null {
  const value = description.toUpperCase();
  if (/YELLOW|AMARILLO/.test(value)) return 'Y';
  if (/CYAN/.test(value)) return 'C';
  if (/MAGENTA/.test(value)) return 'M';
  if (/BLACK|NEGRO/.test(value)) return 'K';
  return null;
}

function extractTonerMentions(text: string): Array<'original' | 'compatible'> {
  if (!text) return [];
  const found: Array<{ index: number; letter: string }> = [];
  let match: RegExpExecArray | null;
  TONER_MENTION_PAREN_RE.lastIndex = 0;
  while ((match = TONER_MENTION_PAREN_RE.exec(text))) found.push({ index: match.index, letter: match[1].toUpperCase() });
  TONER_MENTION_BARE_RE.lastIndex = 0;
  while ((match = TONER_MENTION_BARE_RE.exec(text))) {
    if (match[1] === match[1].toUpperCase()) found.push({ index: match.index, letter: match[1] });
  }
  found.sort((left, right) => left.index - right.index);
  return found.map((item) => item.letter === 'O' ? 'original' : 'compatible');
}
