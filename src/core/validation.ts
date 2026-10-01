export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

/** Cuerpo `{ text, fileName? }` de los analizadores de pliegos: texto de hasta 250.000 caracteres. */
export function parseTextAnalysisInput(value: unknown, defaultFileName: string): { text: string; fileName: string } | null {
  if (!isRecord(value) || !isNonEmptyString(value.text)) return null;
  if (value.text.length > 250_000) return null;
  if (value.fileName !== undefined && !isNonEmptyString(value.fileName)) return null;
  return { text: value.text, fileName: value.fileName === undefined ? defaultFileName : value.fileName };
}
