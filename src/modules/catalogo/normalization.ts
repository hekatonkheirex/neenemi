export function normalizePartCode(value: string): string {
  return value.normalize('NFKC').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}
