import type { ReactNode } from 'react';
import type { SuiteOverview } from '../db/overview';
import { cn } from '../core/cn';
import DatabaseRecoveryPanel, { type BackupHealth } from './DatabaseRecoveryPanel';
import ImportArchivePanel from './ImportArchivePanel';

export type ClearImportsMessage = { tone: 'success' | 'error'; text: string };
export type ImportArchiveBatch = { id: string; sourceName: string };

type DashboardProps = {
  moduleCount: number;
  overview: SuiteOverview | null;
  onBackupLevel: (level: BackupHealth['level']) => void;
  importsRefreshKey: number;
  onClearImports: () => void;
  clearingImports: boolean;
  clearImportsMessage: ClearImportsMessage | null;
};

const numberFormat = new Intl.NumberFormat('es-PY');
const dateFormat = new Intl.DateTimeFormat('es-PY', { day: '2-digit', month: '2-digit', year: 'numeric' });

// ponytail: texto en <div>, no <span>/<p>/<strong>: el CSS heredado del tema claro les pone color con más especificidad.
function SummaryCard({ value, label, accent }: { value: ReactNode; label: string; accent?: boolean }) {
  return (
    <div
      className={cn(
        '@container flex min-h-30 flex-col justify-between rounded-2xl border p-5 shadow-md',
        accent
          ? 'border-brand/60 bg-linear-to-br from-navy to-[#25406b] text-white'
          : 'border-navy/10 bg-white text-navy dark:border-sky/20 dark:bg-panel dark:text-white',
      )}
    >
      <div className="whitespace-nowrap text-[clamp(1.1rem,12cqi,2.5rem)] font-extrabold tracking-tight">{value}</div>
      <div className={cn('text-xs', accent ? 'text-white/80' : 'text-ink-2 dark:text-[#9fb2d1]')}>{label}</div>
    </div>
  );
}

export default function Dashboard({
  moduleCount,
  overview,
  onBackupLevel,
  importsRefreshKey,
  onClearImports,
  clearingImports,
  clearImportsMessage,
}: DashboardProps) {
  const lastApplied = overview?.recentImports.find((item) => item.appliedAt)?.appliedAt;

  return (
    <div className="page-content">
      <section>
        <div className="eyebrow">DCSS SUITE / DATA SYSTEMS</div>
        <h1>DCSS Suite</h1>
        <div className="max-w-3xl text-base leading-relaxed text-ink-2 dark:text-[#b4c3dc]">
          Un solo Electron, una base local y todos los módulos de trabajo en el mismo lugar.
        </div>
      </section>

      <section aria-label="Resumen de la suite" className="my-6 grid gap-3 md:grid-cols-3">
        <SummaryCard accent value={moduleCount} label="módulos funcionales" />
        <SummaryCard value={overview ? numberFormat.format(overview.counts.contracts) : '—'} label="contratos en cartera" />
        <SummaryCard value={lastApplied ? dateFormat.format(new Date(lastApplied)) : '—'} label="última carga aplicada" />
      </section>

      <DatabaseRecoveryPanel
        refreshKey={importsRefreshKey}
        onHealthChange={onBackupLevel}
        onClearImports={onClearImports}
        clearingImports={clearingImports}
        clearMessage={clearImportsMessage}
      />

      <ImportArchivePanel refreshKey={importsRefreshKey} />

      <div className="mt-6 text-xs text-ink-2 dark:text-[#9fb2d1]">
        Los proyectos actuales permanecen intactos mientras validamos esta nueva aplicación.
      </div>
    </div>
  );
}
