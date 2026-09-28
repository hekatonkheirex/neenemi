export type SourceDetail = {
  label: string;
  value: string;
};

export function buildSourceDetails(fields: readonly (readonly [string, unknown])[]): SourceDetail[] {
  return fields.flatMap(([label, value]) => {
    const text = formatSourceValue(value);
    return text ? [{ label, value: text }] : [];
  });
}

export function buildCompleteSourceDetails(
  headers: readonly unknown[],
  row: readonly unknown[],
  fields: readonly (readonly [string, unknown])[],
): SourceDetail[] {
  const details = buildSourceDetails(fields);
  const knownLabels = fields.map(([label]) => normalizeSourceLabel(label));
  const additional = headers.flatMap((header, index) => {
    const value = formatSourceValue(row[index]);
    const label = formatSourceHeader(header, index);
    const normalizedLabel = normalizeSourceLabel(label);
    if (!value || !normalizedLabel || isPlaceholderSourceHeader(label)) return [];
    if (knownLabels.some((knownLabel) => labelsOverlap(knownLabel, normalizedLabel))) return [];
    return [{ label, value }];
  });

  return [...details, ...additional];
}

export function formatSourceValue(value: unknown): string {
  if (value === undefined || value === null || value === '') return '';
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'boolean') return value ? 'Sí' : 'No';
  return String(value).trim();
}

export function sourceOperationalValues(value: object | null | undefined): string[] {
  if (!value) return [];
  return Object.values(value).map(formatSourceValue).filter(Boolean);
}

export function serializeSourceDetails(details: readonly SourceDetail[] | undefined): string {
  return JSON.stringify(details ?? []);
}

export function parseSourceDetails(value: string | null | undefined): SourceDetail[] {
  if (!value) return [];

  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return [];

    return parsed.flatMap((item) => {
      if (!isRecord(item) || typeof item.label !== 'string' || typeof item.value !== 'string') return [];
      const label = item.label.trim();
      const detailValue = item.value.trim();
      return label && detailValue && !isPlaceholderSourceHeader(label) ? [{ label, value: detailValue }] : [];
    });
  } catch {
    return [];
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function formatSourceHeader(value: unknown, index: number): string {
  const text = formatSourceValue(value).replace(/\s+/g, ' ').trim();
  return text || `Columna ${index + 1}`;
}

function normalizeSourceLabel(value: unknown): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function labelsOverlap(left: string, right: string): boolean {
  return left === right || left.startsWith(`${right} `) || right.startsWith(`${left} `);
}

function isPlaceholderSourceHeader(value: string): boolean {
  return /^(?:header|unused|other|columna|column)[ -_]\d+$/i.test(value.trim());
}
