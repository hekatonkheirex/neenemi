import { lazy, Suspense, useEffect, useState } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  AiBrain01Icon,
  Airplane01Icon,
  Alert02Icon,
  Analytics01Icon,
  Calculator01Icon,
  CloudIcon,
  GridViewIcon,
  Invoice01Icon,
  PrinterIcon,
  ShieldEnergyIcon,
  Tag01Icon,
  Wrench01Icon,
} from '@hugeicons/core-free-icons';
import type { SuiteOverview } from '../db/overview';
import { suiteModules, type SuiteModule } from './modules';
import { persistTheme, readTheme, type Theme } from './theme';
import ImportArchivePanel from './ImportArchivePanel';
import DatabaseRecoveryPanel, { type BackupHealth } from './DatabaseRecoveryPanel';
import { version as suiteVersion } from '../../package.json';
import suiteLogoUrl from '../../build/icon.png';
import { confirmAction } from '../core/confirm';
import ConfirmDialogHost from '../core/ConfirmDialog';
import CommandPalette from './CommandPalette';
import BackupAlertDot from './BackupAlertDot';
import ModuleSkeleton from './ModuleSkeleton';
import ChangelogDialog from './ChangelogDialog';
import { persistLastModule, readLastModule } from './lastModule';
import { guardUnload, hasUnsavedChanges } from '../core/unsavedChanges';
import { installFieldErrors } from '../core/fieldErrors';
import { buildPaletteEntries } from './commandPaletteModel';

const MantenimientoModule = lazy(() => import('../modules/operaciones/MantenimientoModule'));
const DescontinuadorModule = lazy(() => import('../modules/operaciones/DescontinuadorModule'));
const ListadoPreciosModule = lazy(() => import('../modules/ventas/ListadoPreciosModule'));
const ProformasModule = lazy(() => import('../modules/ventas/ProformasModule'));
const MpsModule = lazy(() => import('../modules/mps/MpsModule'));
const ConsumiblesModule = lazy(() => import('../modules/consumibles/ConsumiblesModule'));
const ViaticosModule = lazy(() => import('../modules/viaticos/ViaticosModule'));
const UniflowModule = lazy(() => import('../modules/uniflow/UniflowModule'));
const SoftwareSelectorModule = lazy(() => import('../modules/software-selector/SoftwareSelectorModule'));
const SlaModule = lazy(() => import('../modules/sla/SlaModule'));
const CoberturaModule = lazy(() => import('../modules/cobertura/CoberturaModule'));
const TrackingModule = lazy(() => import('../modules/tracking/TrackingModule'));

type Health = {
  ok: boolean;
  database: 'ready' | 'error';
};

type ClearImportedFilesResponse = {
  ok: boolean;
  batches: number;
  files: number;
  archivedFiles: number;
  error?: string;
};

type ClearImportsMessage = {
  tone: 'success' | 'error';
  text: string;
};

type ImportArchiveBatch = {
  id: string;
  sourceName: string;
};

const sectionOrder: SuiteModule['section'][] = ['servicio técnico', 'administrativo', 'software', 'herramientas'];

const sectionLabels: Record<SuiteModule['section'], string> = {
  'servicio técnico': 'Servicio Técnico',
  administrativo: 'Administrativo',
  software: 'Software',
  herramientas: 'Herramientas',
};

const moduleIcons = {
  mantenimiento: Wrench01Icon,
  descontinuador: Alert02Icon,
  consumibles: Analytics01Icon,
  mps: Calculator01Icon,
  cobertura: PrinterIcon,
  viaticos: Airplane01Icon,
  tracking: Analytics01Icon,
  uniflow: CloudIcon,
  'listado-precios': Tag01Icon,
  proformas: Invoice01Icon,
  sla: ShieldEnergyIcon,
  'software-selector': AiBrain01Icon,
} satisfies Record<(typeof suiteModules)[number]['id'], typeof PrinterIcon>;

const numberFormat = new Intl.NumberFormat('es-PY');
const dateFormat = new Intl.DateTimeFormat('es-PY', { day: '2-digit', month: '2-digit', year: 'numeric' });

const functionalModuleIds = new Set(['mantenimiento', 'descontinuador', 'listado-precios', 'proformas', 'mps', 'consumibles', 'viaticos', 'tracking', 'uniflow', 'software-selector', 'sla', 'cobertura']);

function getThemeStorage(): Storage | undefined {
  if (typeof window === 'undefined') {
    return undefined;
  }

  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

export default function App() {
  const [health, setHealth] = useState<Health | null>(null);
  const [changelogOpen, setChangelogOpen] = useState(false);
  const [overview, setOverview] = useState<SuiteOverview | null>(null);
  const [activeModuleId, setActiveModuleId] = useState<string | null>(() => readLastModule(getThemeStorage(), suiteModules.map((module) => module.id)));
  const [theme, setTheme] = useState<Theme>(() => readTheme(getThemeStorage()));
  const [clearingImports, setClearingImports] = useState(false);
  const [clearImportsMessage, setClearImportsMessage] = useState<ClearImportsMessage | null>(null);
  const [importsRefreshKey, setImportsRefreshKey] = useState(0);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [backupLevel, setBackupLevel] = useState<BackupHealth['level'] | null>(null);

  const activeModule = suiteModules.find((module) => module.id === activeModuleId);

  useEffect(() => {
    window.addEventListener('beforeunload', guardUnload);
    return () => window.removeEventListener('beforeunload', guardUnload);
  }, []);

  useEffect(() => installFieldErrors(), []);

  useEffect(() => {
    persistLastModule(activeModuleId, getThemeStorage());
  }, [activeModuleId]);

  async function navigateTo(id: string | null) {
    if (id === activeModuleId) return;
    if (hasUnsavedChanges()) {
      const leave = await confirmAction({
        title: 'Salir sin guardar',
        message: 'Hay cambios sin guardar en este módulo. Si sales ahora se perderán.',
        confirmLabel: 'Salir sin guardar',
      });
      if (!leave) return;
    }
    setActiveModuleId(id);
  }

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', theme === 'light' ? '#f4f6f9' : '#09101c');
    persistTheme(theme, getThemeStorage());
  }, [theme]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'k') return;
      event.preventDefault();
      setPaletteOpen((open) => !open);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function checkHealth() {
      try {
        const response = await fetch('/api/health', { signal: AbortSignal.timeout(3000) });
        if (!response.ok) throw new Error('health check failed');
        const value = (await response.json()) as Health;
        if (!cancelled) setHealth(value);
      } catch {
        if (!cancelled) setHealth({ ok: false, database: 'error' });
      }
    }
    void checkHealth();
    const interval = window.setInterval(() => void checkHealth(), 5000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    if (activeModuleId !== null) return undefined;
    let cancelled = false;
    setOverview(null);
    fetch('/api/overview', { signal: AbortSignal.timeout(10000) })
      .then(async (response) => {
        if (!response.ok) throw new Error('overview request failed');
        return (await response.json()) as SuiteOverview;
      })
      .then((value) => {
        if (!cancelled) setOverview(value);
      })
      .catch(() => undefined);

    return () => { cancelled = true; };
  }, [activeModuleId, importsRefreshKey]);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/system/backup/status', { cache: 'no-store' })
      .then(async (response) => (response.ok ? (await response.json()) as BackupHealth : null))
      .then((value) => { if (!cancelled && value) setBackupLevel(value.level); })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [activeModuleId, importsRefreshKey]);

  const backupDue = backupLevel !== null && backupLevel !== 'ok';

  async function clearImportedFiles() {
    if (clearingImports) return;
    const confirmed = await confirmAction({
      title: 'Limpiar todas las cargas',
      message: 'Se quitarán las cargas importadas y sus datos derivados de la Suite. Los archivos originales se moverán al archivo recuperable; los perfiles MPS manuales, viajes manuales y configuraciones se conservarán.',
      confirmLabel: 'Limpiar cargas',
    });
    if (!confirmed) return;

    setClearingImports(true);
    setClearImportsMessage(null);
    try {
      const response = await fetch('/api/system/imports', { method: 'DELETE' });
      const result = (await response.json()) as ClearImportedFilesResponse;
      if (!response.ok) throw new Error(result.error ?? 'No se pudieron limpiar las cargas importadas.');

      setOverview(null);
      setActiveModuleId(null);
      setImportsRefreshKey((value) => value + 1);
      setClearImportsMessage({
        tone: 'success',
        text: `${result.batches.toLocaleString('es-PY')} cargas limpiadas; ${result.archivedFiles.toLocaleString('es-PY')} originales archivados.`,
      });
    } catch (error) {
      setClearImportsMessage({
        tone: 'error',
        text: error instanceof Error ? error.message : 'No se pudieron limpiar las cargas importadas.',
      });
    } finally {
      setClearingImports(false);
    }
  }

  async function removeImportBatch(batch: ImportArchiveBatch): Promise<void> {
    const response = await fetch(`/api/imports/${encodeURIComponent(batch.id)}`, { method: 'DELETE' });
    const result = (await response.json()) as { error?: string };
    if (!response.ok) throw new Error(result.error ?? `No se pudo quitar ${batch.sourceName}.`);

    try {
      const overviewResponse = await fetch('/api/overview');
      if (!overviewResponse.ok) return;
      setOverview((await overviewResponse.json()) as SuiteOverview);
    } catch {
      // The removal succeeded; a later visit to Inicio will refresh its counts.
    }
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-block">
          <img className="brand-mark" src={suiteLogoUrl} alt="" />
          <div>
            <strong>DCSS Suite</strong>
            <span>Document &amp; Collaborative Solutions Support</span>
          </div>
        </div>

        <nav className="module-nav" aria-label="Módulos de la suite">
          <button
            className={`nav-item ${activeModuleId === null ? 'active' : ''}`}
            aria-current={activeModuleId === null ? 'page' : undefined}
            type="button"
            onClick={() => void navigateTo(null)}
          >
            <span className="nav-icon" aria-hidden="true"><HugeiconsIcon icon={GridViewIcon} size={16} /></span>
            <span>Inicio</span>
            {backupDue ? <BackupAlertDot /> : null}
          </button>

          {sectionOrder.map((section) => {
            const modules = suiteModules.filter((module) => module.section === section);
            return (
              <div className="nav-group" key={section}>
                <div className="nav-label">{sectionLabels[section]}</div>
                {modules.map((module) => (
                  <button
                    className={`nav-item ${activeModuleId === module.id ? 'active' : ''}`}
                    key={module.id}
                    aria-current={activeModuleId === module.id ? 'page' : undefined}
                    type="button"
                    onClick={() => void navigateTo(module.id)}
                  >
                    <span className="nav-icon" aria-hidden="true"><HugeiconsIcon icon={moduleIcons[module.id]} size={16} /></span>
                    <span>{module.label}</span>
                  </button>
                ))}
              </div>
            );
          })}
        </nav>

        {health && !health.ok && (
          <div className="sidebar-footer" role="status">
            <span className="status-dot error" />
            <span>SQLite requiere atención</span>
          </div>
        )}
        <div className="sidebar-version">
          <button type="button" className="sidebar-version-link" onClick={() => setChangelogOpen(true)} aria-haspopup="dialog" title="Ver historial de cambios">Versión v{suiteVersion}</button>
        </div>
      </aside>

      <main className="content">
        <header className="topbar">
          <span className="breadcrumb">DCSS Suite / {activeModule?.label ?? 'Inicio'}</span>
          <div className="topbar-actions">
            <button className="palette-button" type="button" onClick={() => setPaletteOpen(true)} aria-keyshortcuts="Control+K Meta+K" title="Ir a un módulo (Ctrl/⌘ K)">
              Ir a… <kbd>Ctrl K</kbd>
            </button>
            <button
              className="theme-toggle"
              type="button"
              aria-pressed={theme === 'dark'}
              aria-label={`Cambiar a modo ${theme === 'light' ? 'oscuro' : 'claro'}`}
              title={`Cambiar a modo ${theme === 'light' ? 'oscuro' : 'claro'}`}
              onClick={() => setTheme((current) => (current === 'light' ? 'dark' : 'light'))}
            >
              <span className="theme-toggle-track" aria-hidden="true">
                <span className="theme-toggle-thumb" />
              </span>
              <span>{theme === 'light' ? 'Claro' : 'Oscuro'}</span>
            </button>
          </div>
        </header>

        <Suspense fallback={<ModuleSkeleton />}>
          {activeModule ? renderModule(activeModule) : <Dashboard
            onBackupLevel={setBackupLevel}
            overview={overview}
            importsRefreshKey={importsRefreshKey}
            onRemoveImport={removeImportBatch}
            onClearImports={() => void clearImportedFiles()}
            clearingImports={clearingImports}
            clearImportsMessage={clearImportsMessage}
          />}
        </Suspense>
      </main>
      {paletteOpen ? (
        <CommandPalette
          entries={buildPaletteEntries(suiteModules, sectionLabels)}
          onSelect={(id) => { setPaletteOpen(false); void navigateTo(id); }}
          onClose={() => setPaletteOpen(false)}
        />
      ) : null}
      <ConfirmDialogHost />
      {changelogOpen && <ChangelogDialog currentVersion={suiteVersion} onClose={() => setChangelogOpen(false)} />}
    </div>
  );
}

function renderModule(module: SuiteModule) {
  if (module.id === 'mantenimiento') return <MantenimientoModule />;
  if (module.id === 'descontinuador') return <DescontinuadorModule />;
  if (module.id === 'listado-precios') return <ListadoPreciosModule />;
  if (module.id === 'proformas') return <ProformasModule />;
  if (module.id === 'mps') return <MpsModule />;
  if (module.id === 'consumibles') return <ConsumiblesModule />;
  if (module.id === 'viaticos') return <ViaticosModule />;
  if (module.id === 'tracking') return <TrackingModule />;
  if (module.id === 'uniflow') return <UniflowModule />;
  if (module.id === 'software-selector') return <SoftwareSelectorModule />;
  if (module.id === 'sla') return <SlaModule />;
  if (module.id === 'cobertura') return <CoberturaModule />;
  return <ModuleOverview module={module} />;
}

function Dashboard({
  onBackupLevel,
  overview,
  importsRefreshKey,
  onRemoveImport,
  onClearImports,
  clearingImports,
  clearImportsMessage,
}: {
  onBackupLevel: (level: BackupHealth['level']) => void;
  overview: SuiteOverview | null;
  importsRefreshKey: number;
  onRemoveImport: (batch: ImportArchiveBatch) => Promise<void>;
  onClearImports: () => void;
  clearingImports: boolean;
  clearImportsMessage: ClearImportsMessage | null;
}) {
  const functionalModuleCount = suiteModules.filter((module) => functionalModuleIds.has(module.id)).length;
  const lastApplied = overview?.recentImports.find((item) => item.appliedAt)?.appliedAt;

  return (
    <div className="page-content">
      <section className="hero-block">
        <div className="eyebrow">DCSS SUITE / DATA SYSTEMS</div>
        <h1>DCSS Suite</h1>
        <p className="lead">
          Un solo Electron, una base local y todos los módulos de trabajo en el mismo lugar.
        </p>
      </section>

      <section className="summary-grid" aria-label="Resumen de la suite">
        <div className="summary-card accent">
          <span className="summary-value">{functionalModuleCount}</span>
          <span className="summary-label">módulos funcionales</span>
        </div>
        <div className="summary-card">
          <span className="summary-value">{overview ? numberFormat.format(overview.counts.contracts) : '—'}</span>
          <span className="summary-label">contratos en cartera</span>
        </div>
        <div className="summary-card">
          <span className="summary-value">{lastApplied ? dateFormat.format(new Date(lastApplied)) : '—'}</span>
          <span className="summary-label">última carga aplicada</span>
        </div>
      </section>

      <DatabaseRecoveryPanel refreshKey={importsRefreshKey} onHealthChange={onBackupLevel} onClearImports={onClearImports} clearingImports={clearingImports} clearMessage={clearImportsMessage} />

      <ImportArchivePanel refreshKey={importsRefreshKey} onRemoveBatch={onRemoveImport} />

      <p className="scope-note">Los proyectos actuales permanecen intactos mientras validamos esta nueva aplicación.</p>
    </div>
  );
}

function ModuleOverview({ module }: { module: SuiteModule }) {
  return (
    <div className="page-content">
      <section className="module-hero">
        <div className="eyebrow">{sectionLabels[module.section]} / MÓDULO PREPARADO</div>
        <h1>{module.label}</h1>
        <p className="lead">La ruta está lista dentro de la shell unificada. La migración funcional será incremental.</p>
      </section>

      <section className="detail-grid">
        <div className="detail-card">
          <span className="detail-label">Responsable</span>
          <strong>{module.owner}</strong>
        </div>
        <div className="detail-card">
          <span className="detail-label">Proyecto de origen</span>
          <strong>{module.sourceProject}</strong>
        </div>
        <div className="detail-card wide">
          <span className="detail-label">Datos que administra</span>
          <div className="tag-list">
            {module.dataOwner.map((table) => <span className="data-tag" key={table}>{table}</span>)}
          </div>
        </div>
      </section>

      <section className="io-panel">
        <div>
          <div className="eyebrow">CONTRATO DEL MÓDULO</div>
          <h2>Entrada y salida definidas</h2>
          <p>El contrato permite migrar la lógica sin duplicar la fuente de datos común.</p>
        </div>
        <div className="io-columns">
          <div>
            <span className="detail-label">Entradas</span>
            <ul>{module.inputs.map((input) => <li key={input}>{input}</li>)}</ul>
          </div>
          <div>
            <span className="detail-label">Salidas</span>
            <ul>{module.outputs.map((output) => <li key={output}>{output}</li>)}</ul>
          </div>
        </div>
      </section>
    </div>
  );
}
