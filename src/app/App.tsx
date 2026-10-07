import { lazy, Suspense, useEffect, useLayoutEffect, useState } from 'react';
import { motion, MotionConfig } from 'framer-motion';
import type { SuiteOverview } from '../db/overview';
import { suiteModules, type SuiteModule } from './modules';
import { persistTheme, readTheme, type Theme } from './theme';
import { type BackupHealth } from './DatabaseRecoveryPanel';
import { version as suiteVersion } from '../../package.json';
import suiteLogoUrl from '../../build/icon.png';
import { confirmAction } from '../core/confirm';
import ConfirmDialogHost from '../core/ConfirmDialog';
import CommandPalette from './CommandPalette';
import Sidebar from './Sidebar';
import Topbar from './Topbar';
import Dashboard from './Dashboard';
import Configuration, { type ClearImportsMessage } from './Configuration';
import ModuleSkeleton from './ModuleSkeleton';
import ChangelogDialog from './ChangelogDialog';
import { persistLastModule, readLastModule } from './lastModule';
import { guardUnload, hasUnsavedChanges } from '../core/unsavedChanges';
import { installFieldErrors } from '../core/fieldErrors';
import { installEllipsisTitles } from '../core/ellipsisTitles';
import { buildPaletteEntries } from './commandPaletteModel';
import { readJson } from '../core/http';
import { HEALTH_TIMEOUT_MS, nextFailureCount, sameHealth, shouldAlert, type HealthCheckResult } from './health-monitor';

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

const HEALTH_DOWN: Health = { ok: false, database: 'error' };

type ClearImportedFilesResponse = {
  ok: boolean;
  batches: number;
  files: number;
  archivedFiles: number;
  error?: string;
};

const sectionOrder: SuiteModule['section'][] = ['servicio técnico', 'administrativo', 'software', 'herramientas'];

const sectionLabels: Record<SuiteModule['section'], string> = {
  'servicio técnico': 'Servicio Técnico',
  administrativo: 'Administrativo',
  software: 'Software',
  herramientas: 'Herramientas',
};


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
  const [overviewError, setOverviewError] = useState('');
  const [activeModuleId, setActiveModuleId] = useState<string | null>(() => readLastModule(getThemeStorage(), [...suiteModules.map((module) => module.id), 'configuracion']));
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
  useEffect(() => installEllipsisTitles(), []);

  useEffect(() => {
    persistLastModule(activeModuleId, getThemeStorage());
  }, [activeModuleId]);

  useLayoutEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
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
    let inFlight = false;
    let failures = 0;
    async function checkHealth() {
      if (inFlight) return;
      inFlight = true;
      let result: HealthCheckResult = { kind: 'unreachable' };
      let value: Health | null = null;
      try {
        const response = await fetch('/api/health', { signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS) });
        if (response.ok) {
          value = (await response.json()) as Health;
          result = value.ok ? { kind: 'ok' } : { kind: 'reported-down' };
        }
      } catch {
        // Sin respuesta a tiempo: puede ser solo una consulta pesada; se decide por fallos seguidos.
      } finally {
        inFlight = false;
      }
      failures = nextFailureCount(failures, result);
      if (cancelled) return;
      // Se guarda solo si cambió: un objeto nuevo cada 5 s re-renderizaba App y, con él, el módulo abierto entero
      // (miles de filas en Listado de precios y Discontinuador: ~2,7 s de ventana congelada cada 5 s).
      if (value && result.kind !== 'unreachable') setHealth((previous) => (sameHealth(previous, value) ? previous : value));
      else if (shouldAlert(failures, result)) setHealth((previous) => (sameHealth(previous, HEALTH_DOWN) ? previous : HEALTH_DOWN));
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
    setOverviewError('');
    fetch('/api/overview', { signal: AbortSignal.timeout(10000) })
      .then(async (response) => {
        if (!response.ok) throw new Error('No se pudo consultar el resumen de la base.');
        return (await response.json()) as SuiteOverview;
      })
      .then((value) => {
        if (!cancelled) setOverview(value);
      })
      .catch(() => { if (!cancelled) setOverviewError('No se pudo consultar el resumen de la base.'); });

    return () => { cancelled = true; };
  }, [activeModuleId, importsRefreshKey]);

  useEffect(() => {
    let cancelled = false;
    const refreshBackupLevel = () => {
      if (document.visibilityState === 'hidden') return;
      fetch('/api/system/backup/status', { cache: 'no-store' })
        .then(async (response) => (response.ok ? (await response.json()) as BackupHealth : null))
        .then((value) => { if (!cancelled && value) setBackupLevel(value.level); })
        .catch(() => undefined);
    };
    refreshBackupLevel();
    const timer = activeModuleId === null ? window.setInterval(refreshBackupLevel, 5000) : undefined;
    window.addEventListener('focus', refreshBackupLevel);
    document.addEventListener('visibilitychange', refreshBackupLevel);
    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearInterval(timer);
      window.removeEventListener('focus', refreshBackupLevel);
      document.removeEventListener('visibilitychange', refreshBackupLevel);
    };
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
    const startedAt = Date.now();
    try {
      const response = await fetch('/api/system/imports', { method: 'DELETE' });
      const result = await readJson<ClearImportedFilesResponse>(response);

      setOverview(null);
      setActiveModuleId('configuracion');
      setImportsRefreshKey((value) => value + 1);
      setClearImportsMessage({
        tone: 'success',
        text: `Limpieza finalizada en ${Math.floor((Date.now() - startedAt) / 1000)} s: ${result.batches.toLocaleString('es-PY')} cargas retiradas; ${result.archivedFiles.toLocaleString('es-PY')} originales archivados. Los datos manuales y las configuraciones se conservaron.`,
      });
    } catch (error) {
      setClearImportsMessage({
        tone: 'error',
        text: `La limpieza falló tras ${Math.floor((Date.now() - startedAt) / 1000)} s: ${error instanceof Error ? error.message : 'No se pudieron limpiar las cargas importadas.'}`,
      });
    } finally {
      setClearingImports(false);
    }
  }

  return (
    <div className="app-shell">
      <Sidebar
        activeModuleId={activeModuleId}
        sections={sectionOrder}
        sectionLabels={sectionLabels}
        backupDue={backupDue}
        sqliteWarning={Boolean(health && !health.ok)}
        version={suiteVersion}
        logoUrl={suiteLogoUrl}
        onNavigate={(id) => void navigateTo(id)}
        onOpenChangelog={() => setChangelogOpen(true)}
      />

      <main className="content">
        <Topbar
          label={activeModuleId === 'configuracion' ? 'Configuración' : activeModule?.label ?? 'Inicio'}
          theme={theme}
          onOpenPalette={() => setPaletteOpen(true)}
          onToggleTheme={() => setTheme((current) => (current === 'light' ? 'dark' : 'light'))}
        />

        <MotionConfig reducedMotion="user">
        <motion.div key={activeModuleId ?? 'inicio'} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2, ease: 'easeOut' }}>
        <Suspense fallback={<ModuleSkeleton />}>
          {activeModuleId === 'configuracion' ? <Configuration
            refreshKey={importsRefreshKey}
            onBackupLevel={setBackupLevel}
            onClearImports={() => void clearImportedFiles()}
            clearingImports={clearingImports}
            clearImportsMessage={clearImportsMessage}
          /> : activeModule ? renderModule(activeModule) : <Dashboard
            moduleCount={suiteModules.filter((module) => functionalModuleIds.has(module.id)).length}
            overview={overview}
            overviewError={overviewError}
            backupLevel={backupLevel}
            onNavigate={(id) => void navigateTo(id)}
          />}
        </Suspense>
        </motion.div>
        </MotionConfig>
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
