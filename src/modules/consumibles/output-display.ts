import type { ConsumablesOutputRecord, ConsumablesOutputSourceOperational } from './types';

/**
 * Reads a populated field from the original dispatch headers. The parser keeps
 * unknown columns in sourceDetails, so these aliases let the main views expose
 * the historical fields without depending on one exact spelling.
 */
export function outputSourceDetail(
  record: ConsumablesOutputRecord,
  labels: readonly string[],
): string {
  const normalizedLabels = new Set(labels.map(normalizeLabel));
  return record.sourceDetails.find((detail) => {
    const normalizedDetail = normalizeLabel(detail.label);
    return [...normalizedLabels].some((label) => label === normalizedDetail || normalizedDetail.startsWith(`${label} `));
  })?.value ?? '';
}

export function outputOperationalDetail(
  record: ConsumablesOutputRecord,
  key: keyof ConsumablesOutputSourceOperational,
  labels: readonly string[],
): string {
  return record.sourceOperational?.[key] || outputSourceDetail(record, labels);
}

function normalizeLabel(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}
