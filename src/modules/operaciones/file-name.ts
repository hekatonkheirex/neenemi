/** Nombre apto para archivo: sin acentos, sin la extensión del origen (.xlsx) y con guiones. */
export function toFileSafeName(value: string): string {
  return value
    .replace(/\.(xlsx?|csv|pdf)$/i, '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 72) || 'equipo';
}
