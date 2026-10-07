/** Canonical form of an equipment serial: NFKC, collapsed whitespace, upper case. Shared by the db layer and every module that matches serials. */
export function normalizeSerial(value: string): string {
  return value.normalize('NFKC').trim().replace(/\s+/g, ' ').toUpperCase();
}
