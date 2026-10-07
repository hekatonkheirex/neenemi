import type { BackupHealth } from './DatabaseRecoveryPanel';

/** Una sola frase para «una semana o más»: la usan el aviso de Inicio y el panel de Configuración. */
export const STALE_BACKUP_PHRASE = 'una semana o más';

/** Frase corta del aviso de Inicio; el caso «never» es el valor por defecto. */
export function backupBannerText(level: BackupHealth['level']): string {
  if (level === 'pending') return 'La base cambió desde el último respaldo.';
  if (level === 'stale') return `El último respaldo tiene ${STALE_BACKUP_PHRASE}.`;
  return 'Hay información cargada y todavía no se generó un respaldo.';
}
