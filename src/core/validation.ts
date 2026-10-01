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

export function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}


export function isNonNegativeNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}


export function isPositiveNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}


export function decodeBase64(value: string): Uint8Array | null {
  if (!/^[a-zA-Z0-9+/]*={0,2}$/.test(value) || value.length % 4 !== 0) return null;
  const contents = Buffer.from(value, 'base64');
  return contents.byteLength > 0 ? new Uint8Array(contents) : null;
}


export function queryString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

export function isOptionalNonNegativeNumber(value: unknown): value is number | null | undefined {
  return value === undefined || value === null || isNonNegativeNumber(value);
}

