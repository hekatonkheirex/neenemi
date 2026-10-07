import DatabaseRecoveryPanel, { type BackupHealth } from './DatabaseRecoveryPanel';
import ImportArchivePanel from './ImportArchivePanel';
import { PageHeader } from '../core/ui/page-header';

export type ClearImportsMessage = { tone: 'success' | 'error'; text: string };

/** El resultado de la limpieza solo vale mientras se está en Configuración. */
export function clearMessageAfterNavigation(current: ClearImportsMessage | null, targetId: string | null): ClearImportsMessage | null {
  return targetId === 'configuracion' ? current : null;
}

type ConfigurationProps = {
  refreshKey: number;
  onBackupLevel: (level: BackupHealth['level']) => void;
  onClearImports: () => void;
  clearingImports: boolean;
  clearImportsMessage: ClearImportsMessage | null;
};

export default function Configuration({ refreshKey, onBackupLevel, onClearImports, clearingImports, clearImportsMessage }: ConfigurationProps) {
  return <div className="page-content grid min-w-0 grid-cols-1 gap-6 [overflow-wrap:anywhere] [&>*]:min-w-0">
    <PageHeader eyebrow="CONFIGURACIÓN / DATOS Y RESPALDOS" title="Configuración" lead="Administra la base local, sus respaldos y los archivos originales. Las cargas de trabajo permanecen en cada módulo." />
    <DatabaseRecoveryPanel refreshKey={refreshKey} onHealthChange={onBackupLevel} onClearImports={onClearImports} clearingImports={clearingImports} clearMessage={clearImportsMessage} />
    <ImportArchivePanel refreshKey={refreshKey} />
  </div>;
}
