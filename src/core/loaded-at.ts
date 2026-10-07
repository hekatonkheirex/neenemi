const loadedAtFormat = new Intl.DateTimeFormat('es-PY', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });

/** "Cargado el 07/10/2026, 14:32" desde un ISO; null si falta o no es una fecha válida. */
export function formatLoadedAt(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : `Cargado el ${loadedAtFormat.format(date)}`;
}
