import type { ReactNode } from 'react';
import { ArrowUpRight, TriangleAlert } from 'lucide-react';
import type { SuiteOverview } from '../db/overview';
import { cn } from '../core/cn';
import type { BackupHealth } from './DatabaseRecoveryPanel';
import { Button } from '../core/ui/button';
import { Card, CardHeader, Muted } from '../core/ui/card';
import DashboardMaintenanceChart from '../modules/mantenimiento/DashboardMaintenanceChart';
import DashboardConsumablesChart from '../modules/consumibles/DashboardConsumablesChart';
import DashboardTravelCharts from '../modules/viaticos/DashboardTravelCharts';

type DashboardProps = {
  moduleCount: number;
  overview: SuiteOverview | null;
  overviewError: string;
  backupLevel: BackupHealth['level'] | null;
  onNavigate: (id: string) => void;
};

const numberFormat = new Intl.NumberFormat('es-PY');
const dateFormat = new Intl.DateTimeFormat('es-PY', { day: '2-digit', month: '2-digit', year: 'numeric' });

function SummaryCard({ value, label, accent }: { value: ReactNode; label: string; accent?: boolean }) {
  return (
    <div className={cn(
      '@container flex min-h-30 flex-col justify-between rounded-2xl border p-5 shadow-md',
      accent ? 'border-brand/60 bg-linear-to-br from-navy to-[#25406b] text-white' : 'border-navy/10 bg-white text-navy dark:border-sky/20 dark:bg-panel dark:text-white',
    )}>
      <div className="whitespace-nowrap text-[clamp(1.1rem,12cqi,2.5rem)] font-extrabold tracking-tight">{value}</div>
      <div className={cn('text-xs', accent ? 'text-white/80' : 'text-ink-2 dark:text-[#9fb2d1]')}>{label}</div>
    </div>
  );
}

function MetricCard({ label, value, note, onClick }: { label: string; value: number | string; note: string; onClick: () => void }) {
  return <button type="button" onClick={onClick} className="grid min-w-0 content-start gap-3 rounded-xl border border-navy/10 bg-paper p-4 text-left text-navy transition-colors hover:border-sky hover:bg-sky/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky dark:border-sky/20 dark:bg-navy/30 dark:text-white">
    <div className="flex items-start justify-between gap-3 text-sm font-semibold"><div>{label}</div><ArrowUpRight className="size-4 shrink-0 text-sky" aria-hidden="true" /></div>
    <div className="text-3xl font-bold tracking-tight tabular-nums">{typeof value === 'number' ? numberFormat.format(value) : value}</div>
    <div className="text-xs leading-relaxed text-ink-2 dark:text-[#9fb2d1]">{note}</div>
  </button>;
}

export default function Dashboard({ moduleCount, overview, overviewError, backupLevel, onNavigate }: DashboardProps) {
  const lastApplied = overview?.recentImports.find((item) => item.appliedAt)?.appliedAt;
  const portfolio = overview?.dashboard.portfolio;
  const canon = overview?.dashboard.canon;
  const missing = overview ? 'Sin datos' : overviewError ? 'No disponible' : 'Cargando…';
  const hasData = overview && (overview.appliedImports > 0 || Object.values(overview.counts).some(value => value > 0));
  const backupWarning = backupLevel === 'pending' || backupLevel === 'stale' || (backupLevel === 'never' && hasData);

  return <div className="page-content min-w-0">
    <section>
      <div className="eyebrow">DCSS SUITE / DATA SYSTEMS</div>
      <h1>DCSS Suite</h1>
      <div className="max-w-3xl text-base leading-relaxed text-ink-2 dark:text-[#b4c3dc]">Un solo Electron, una base local y todos los módulos de trabajo en el mismo lugar.</div>
    </section>

    <section aria-label="Resumen de la suite" className="my-6 grid gap-3 md:grid-cols-3">
      <SummaryCard accent value={moduleCount} label="módulos funcionales" />
      <SummaryCard value={portfolio ? numberFormat.format(portfolio.activeCustomers) : '—'} label="clientes con contrato activo" />
      <SummaryCard value={lastApplied ? dateFormat.format(new Date(lastApplied)) : '—'} label="última carga aplicada" />
    </section>

    {backupWarning && <div role="status" className="mb-6 flex min-w-0 flex-wrap items-center gap-3 rounded-xl border border-brand/30 bg-brand/5 p-4 text-sm text-navy dark:text-white">
      <TriangleAlert className="size-5 shrink-0 text-brand" aria-hidden="true" />
      <div className="min-w-0 flex-1">{backupLevel === 'pending' ? 'La base cambió desde el último respaldo.' : backupLevel === 'stale' ? 'El último respaldo tiene una semana o más.' : 'Hay información cargada y todavía no se generó un respaldo.'} Revisa su estado en Configuración.</div>
      <Button variant="outline" size="sm" onClick={() => onNavigate('configuracion')}>Datos y respaldos</Button>
    </div>}

    {overviewError && <div role="alert" className="mb-6 rounded-xl border border-brand/30 p-4 text-sm text-navy dark:text-white">{overviewError} Los indicadores no están disponibles; no se muestran como cero.</div>}

    <div className="grid min-w-0 gap-6" aria-label="Indicadores de los módulos" aria-busy={!overview && !overviewError}>
      <Card className="min-w-0 grid-cols-1">
        <CardHeader eyebrow="CARTERA Y EQUIPOS" title="Base instalada y contratos" />
        <Muted>Resumen general de la cartera, sin los filtros particulares de cada módulo.</Muted>
        <div className={cn('grid min-w-0 gap-3 sm:grid-cols-2', portfolio?.contractsByType.length && 'xl:grid-cols-3')}>
          <MetricCard label="Equipos con contrato activo" value={portfolio?.activeEquipment ?? missing} note={portfolio ? 'Series únicas en contratos activos (Abierto, Alquiler, Leasing y Mantenimiento).' : 'Carga la cartera para consultar los equipos.'} onClick={() => onNavigate('descontinuador')} />
          <MetricCard label="Contratos activos" value={portfolio?.activeContracts ?? missing} note={portfolio ? `Solo los marcados como activos. Contratos sin estado: ${numberFormat.format(portfolio.unknownContracts)} (excluidos).` : 'El estado activo se toma de la cartera cargada.'} onClick={() => onNavigate('descontinuador')} />
          {portfolio?.contractsByType.map(item => <MetricCard key={item.type} label={`Contratos activos · ${item.type}`} value={item.count} note="Contratos activos de este tipo en la cartera." onClick={() => onNavigate('descontinuador')} />)}
        </div>
      </Card>

      <div className="@container min-w-0" aria-label="Gráficos de los módulos"><div className="grid min-w-0 items-stretch gap-6 @[1400px]:grid-cols-2">
        <DashboardMaintenanceChart onNavigate={onNavigate} coverage={portfolio} />
        <DashboardConsumablesChart onNavigate={onNavigate} />
        <DashboardTravelCharts onNavigate={onNavigate} />
      </div></div>

      <Card className="min-w-0 grid-cols-1">
        <CardHeader eyebrow="SOPORTE CANON" title="Ciclo de vida de los modelos" />
        <Muted>Modelos distintos de las listas Canon aplicadas, sin duplicar códigos de parte ni tensiones.</Muted>
        <div className="grid min-w-0 gap-3 sm:grid-cols-2">
          <MetricCard label="Modelos Canon discontinuados" value={canon?.discontinued ?? missing} note="Modelos cuyo fin de soporte ya ocurrió, incluida la fecha de hoy." onClick={() => onNavigate('descontinuador')} />
          <MetricCard label="Modelos Canon con fin de soporte futuro" value={canon?.scheduled ?? missing} note={canon ? `Modelos sin fecha de fin: ${numberFormat.format(canon.unknown)} (excluidos).` : 'Carga las listas Canon en Discontinuador.'} onClick={() => onNavigate('descontinuador')} />
        </div>
      </Card>
    </div>
  </div>;
}
