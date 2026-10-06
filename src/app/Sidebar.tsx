import type { ComponentType, ReactNode } from 'react';
import {
  BrainCircuit,
  Calculator,
  ChartColumn,
  Cloud,
  LayoutGrid,
  Package,
  Plane,
  Printer,
  ReceiptText,
  ShieldCheck,
  Tag,
  TriangleAlert,
  Wrench,
  type LucideProps,
} from 'lucide-react';
import { cn } from '../core/cn';
import BackupAlertDot from './BackupAlertDot';
import { suiteModules } from './modules';

type ModuleId = (typeof suiteModules)[number]['id'];
type Section = (typeof suiteModules)[number]['section'];

export const moduleIcons = {
  mantenimiento: Wrench,
  descontinuador: TriangleAlert,
  consumibles: Package,
  mps: Calculator,
  cobertura: Printer,
  viaticos: Plane,
  tracking: ChartColumn,
  uniflow: Cloud,
  'listado-precios': Tag,
  proformas: ReceiptText,
  sla: ShieldCheck,
  'software-selector': BrainCircuit,
} satisfies Record<ModuleId, ComponentType<LucideProps>>;

type SidebarProps = {
  activeModuleId: string | null;
  sections: readonly Section[];
  sectionLabels: Record<Section, string>;
  backupDue: boolean;
  sqliteWarning: boolean;
  version: string;
  logoUrl: string;
  onNavigate: (id: string | null) => void;
  onOpenChangelog: () => void;
};

// Los <span>/<p>/<li> dentro de .app-shell reciben color del CSS heredado (theme/01-mantenimiento.css, tema claro) con más
// especificidad que las utilidades: aquí solo se usan <div>, <button>, <strong> y texto directo. Quitar al migrar el CSS heredado.
const item =
  'flex w-full items-center gap-3 rounded-xl border-0 bg-transparent px-3 py-2.5 text-left text-[0.8rem] font-medium ' +
  'text-ink-2 transition-colors duration-150 hover:bg-sky/10 hover:text-navy ' +
  'focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-sky ' +
  'dark:text-[#b4c3dc] dark:hover:text-white';
const itemActive =
  'bg-sky/10 font-semibold text-navy shadow-[inset_3px_0_0_var(--color-sky)] ' +
  'dark:bg-gradient-to-r dark:from-sky/25 dark:to-sky/5 dark:text-white';

export default function Sidebar({
  activeModuleId,
  sections,
  sectionLabels,
  backupDue,
  sqliteWarning,
  version,
  logoUrl,
  onNavigate,
  onOpenChangelog,
}: SidebarProps) {
  const navButton = (id: string | null, label: string, Icon: ComponentType<LucideProps>, extra?: ReactNode) => (
    <button
      key={id ?? 'inicio'}
      type="button"
      className={cn(item, activeModuleId === id && itemActive)}
      aria-current={activeModuleId === id ? 'page' : undefined}
      onClick={() => onNavigate(id)}
    >
      <Icon className="size-4 shrink-0 text-ink-2 dark:text-sky" aria-hidden="true" />
      {label}
      {extra}
    </button>
  );

  return (
    <aside
      aria-label="Barra lateral"
      className={cn(
        // "sidebar" se conserva: los estilos de impresión ocultan .app-shell > .sidebar.
        'sidebar sticky top-0 flex h-screen flex-col self-start border-r border-navy/10 bg-white px-4 pb-4 pt-6 shadow-md',
        'dark:border-sky/20 dark:bg-panel dark:shadow-none',
        'max-[720px]:static max-[720px]:h-auto max-[720px]:border-r-0 max-[720px]:border-b max-[720px]:p-4',
      )}
    >
      <div className="flex items-center gap-2 pb-7 max-[720px]:pb-4">
        <img className="size-11 shrink-0 rounded-2xl object-contain" src={logoUrl} alt="" />
        <div>
          <strong className="block text-[0.95rem] tracking-tight text-navy dark:text-white">DCSS Suite</strong>
          <div className="mt-0.5 text-xs leading-snug text-ink-2 dark:text-[#9fb2d1]">
            Document &amp; Collaborative Solutions Support
          </div>
        </div>
      </div>

      <nav
        aria-label="Módulos de la suite"
        className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto max-[720px]:grid max-[720px]:max-h-48 max-[720px]:grid-cols-2"
      >
        {navButton(null, 'Inicio', LayoutGrid, backupDue ? <BackupAlertDot /> : null)}

        {sections.map((section) => (
          <div className="mt-4 flex flex-col gap-1 max-[720px]:contents" key={section}>
            <div className="px-3 pb-1.5 text-[0.7rem] font-extrabold uppercase tracking-[0.14em] text-ink-2 max-[720px]:hidden dark:text-[#8fa5c7]">
              {sectionLabels[section]}
            </div>
            {suiteModules
              .filter((module) => module.section === section)
              .map((module) => navButton(module.id, module.label, moduleIcons[module.id]))}
          </div>
        ))}
      </nav>

      {sqliteWarning && (
        <div role="status" className="mt-6 flex items-center gap-2 border-t border-navy/10 px-3 pt-3 text-xs text-ink-2 dark:border-sky/20 dark:text-[#9fb2d1]">
          <span className="status-dot error" />
          SQLite requiere atención
        </div>
      )}

      <div className="px-1 pt-2 text-right">
        <button
          type="button"
          className="sidebar-version-link min-h-7 rounded-lg px-2 py-1 text-[0.7rem] tracking-wide text-ink-2 underline underline-offset-4 hover:text-navy focus-visible:text-navy focus-visible:outline-2 focus-visible:outline-sky dark:text-[#8fa5c7] dark:hover:text-sky dark:focus-visible:text-sky"
          onClick={onOpenChangelog}
          aria-haspopup="dialog"
          title="Ver historial de cambios"
        >
          Versión v{version}
        </button>
      </div>
    </aside>
  );
}
