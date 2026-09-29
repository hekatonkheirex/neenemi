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
import DatabaseRecoveryPanel from './DatabaseRecoveryPanel';
import { version as suiteVersion } from '../../package.json';

const CatalogModule = lazy(() => import('../modules/catalogo/CatalogModule'));
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

const sectionOrder: SuiteModule['section'][] = ['catálogo', 'operaciones', 'ventas', 'análisis', 'soporte'];

const sectionLabels: Record<SuiteModule['section'], string> = {
  catálogo: 'Catálogo',
  operaciones: 'Operaciones',
  ventas: 'Ventas',
  análisis: 'Análisis',
  soporte: 'Soporte',
};

const moduleIcons = {
  catalogo: PrinterIcon,
  mantenimiento: Wrench01Icon,
  descontinuador: Alert02Icon,
  consumibles: Analytics01Icon,
  mps: Calculator01Icon,
  cobertura: PrinterIcon,
  viaticos: Airplane01Icon,
  uniflow: CloudIcon,
  'listado-precios': Tag01Icon,
  proformas: Invoice01Icon,
  sla: ShieldEnergyIcon,
  'software-selector': AiBrain01Icon,
} satisfies Record<(typeof suiteModules)[number]['id'], typeof PrinterIcon>;

const numberFormat = new Intl.NumberFormat('es-PY');

const functionalModuleIds = new Set(['catalogo', 'mantenimiento', 'descontinuador', 'listado-precios', 'proformas', 'mps', 'consumibles', 'viaticos', 'uniflow', 'software-selector', 'sla', 'cobertura']);

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
  const [overview, setOverview] = useState<SuiteOverview | null>(null);
  const [activeModuleId, setActiveModuleId] = useState<string | null>(null);
  const [theme, setTheme] = useState<Theme>(() => readTheme(getThemeStorage()));
  const [clearingImports, setClearingImports] = useState(false);
  const [clearImportsMessage, setClearImportsMessage] = useState<ClearImportsMessage | null>(null);
  const [importsRefreshKey, setImportsRefreshKey] = useState(0);

  const activeModule = suiteModules.find((module) => module.id === activeModuleId);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', theme === 'light' ? '#f4f6f9' : '#09101c');
    persistTheme(theme, getThemeStorage());
  }, [theme]);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/health')
      .then(async (response) => {
        if (!response.ok) throw new Error('health check failed');
        return (await response.json()) as Health;
      })
      .then((value) => {
        if (!cancelled) setHealth(value);
      })
      .catch(() => {
        if (!cancelled) setHealth({ ok: false, database: 'error' });
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (activeModuleId !== null) return undefined;
    let cancelled = false;
    fetch('/api/overview')
      .then(async (response) => {
        if (!response.ok) throw new Error('overview request failed');
        return (await response.json()) as SuiteOverview;
      })
      .then((value) => {
        if (!cancelled) setOverview(value);
      })
      .catch(() => {
        if (!cancelled) setOverview(null);
      });

    return () => {
      cancelled = true;
    };
  }, [activeModuleId, importsRefreshKey]);

  const databaseLabel = health?.ok
    ? 'SQLite local lista'
    : health
      ? 'SQLite requiere atención'
      : 'Conectando con SQLite';

  async function clearImportedFiles() {
    if (clearingImports) return;
    const confirmed = window.confirm(
      'Se quitarán las cargas importadas y sus datos derivados de la Suite. Los archivos originales se moverán al archivo recuperable; los perfiles MPS manuales, viajes manuales y configuraciones se conservarán. ¿Desea continuar?',
    );
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
      // The removal succeeded; a later visit to Resumen will refresh its counts.
    }
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-block">
          <div className="brand-mark" aria-hidden="true">
            <svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M9.5 8h9.8C27.1 8 31 12.5 31 20s-3.9 12-11.7 12H9.5V8Z" stroke="currentColor" strokeWidth="2.6" strokeLinejoin="round" />
              <path d="M25.3 14.5c-1.3-1.5-3.1-2.3-5.2-2.3-4.5 0-7.1 3.2-7.1 7.8s2.6 7.8 7.1 7.8c2.1 0 3.9-.8 5.2-2.3" stroke="var(--ds-orange)" strokeWidth="2.8" strokeLinecap="square" />
            </svg>
          </div>
          <div>
            <strong>DCSS Suite</strong>
            <span>Document &amp; Collaborative Solutions Support</span>
          </div>
        </div>

        <nav className="module-nav" aria-label="Módulos de la suite">
          <button
            className={`nav-item ${activeModuleId === null ? 'active' : ''}`}
            type="button"
            onClick={() => setActiveModuleId(null)}
          >
            <span className="nav-icon" aria-hidden="true"><HugeiconsIcon icon={GridViewIcon} size={16} /></span>
            <span>Resumen</span>
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
                    type="button"
                    onClick={() => setActiveModuleId(module.id)}
                  >
                    <span className="nav-icon" aria-hidden="true"><HugeiconsIcon icon={moduleIcons[module.id]} size={16} /></span>
                    <span>{module.label}</span>
                  </button>
                ))}
              </div>
            );
          })}
        </nav>

        <div className="sidebar-footer">
          <span className={`status-dot ${health?.ok ? 'ready' : health ? 'error' : 'pending'}`} />
          <span>{databaseLabel}</span>
        </div>
        <div className="sidebar-version" aria-label={`Versión v${suiteVersion}`}>
          Versión v{suiteVersion}
        </div>
      </aside>

      <main className="content">
        <header className="topbar">
          <span className="breadcrumb">DCSS Suite / {activeModule?.label ?? 'Resumen'}</span>
          <div className="topbar-actions">
            <span className="local-badge">● Solo en este equipo</span>
            {clearImportsMessage ? <span className={`global-clear-message ${clearImportsMessage.tone}`} role={clearImportsMessage.tone === 'error' ? 'alert' : 'status'}>{clearImportsMessage.text}</span> : null}
            <button
              className="global-clear-button"
              type="button"
              onClick={() => void clearImportedFiles()}
              disabled={clearingImports}
              aria-busy={clearingImports}
              title="Quitar las cargas importadas y conservar los originales en el archivo recuperable"
            >
              {clearingImports ? 'Limpiando…' : 'Limpiar cargas'}
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

        <Suspense fallback={<div className="page-content"><p className="lead">Cargando módulo…</p></div>}>
          {activeModule ? renderModule(activeModule) : <Dashboard
            onSelect={setActiveModuleId}
            overview={overview}
            importsRefreshKey={importsRefreshKey}
            onRemoveImport={removeImportBatch}
          />}
        </Suspense>
      </main>
    </div>
  );
}

function renderModule(module: SuiteModule) {
  if (module.id === 'catalogo') return <CatalogModule />;
  if (module.id === 'mantenimiento') return <MantenimientoModule />;
  if (module.id === 'descontinuador') return <DescontinuadorModule />;
  if (module.id === 'listado-precios') return <ListadoPreciosModule />;
  if (module.id === 'proformas') return <ProformasModule />;
  if (module.id === 'mps') return <MpsModule />;
  if (module.id === 'consumibles') return <ConsumiblesModule />;
  if (module.id === 'viaticos') return <ViaticosModule />;
  if (module.id === 'uniflow') return <UniflowModule />;
  if (module.id === 'software-selector') return <SoftwareSelectorModule />;
  if (module.id === 'sla') return <SlaModule />;
  if (module.id === 'cobertura') return <CoberturaModule />;
  return <ModuleOverview module={module} />;
}

function Dashboard({
  onSelect,
  overview,
  importsRefreshKey,
  onRemoveImport,
}: {
  onSelect: (moduleId: string) => void;
  overview: SuiteOverview | null;
  importsRefreshKey: number;
  onRemoveImport: (batch: ImportArchiveBatch) => Promise<void>;
}) {
  const functionalModuleCount = suiteModules.filter((module) => functionalModuleIds.has(module.id)).length;

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
          <span className="summary-value">{overview ? numberFormat.format(overview.counts.customers) : '—'}</span>
          <span className="summary-label">clientes en la base común</span>
        </div>
        <div className="summary-card">
          <span className="summary-value">{overview ? numberFormat.format(overview.counts.equipment) : '—'}</span>
          <span className="summary-label">equipos instalados</span>
        </div>
      </section>

      <section className="io-panel overview-panel" aria-label="Estado de la base compartida">
        <div>
          <h2>Base compartida</h2>
          <p>
            {overview
              ? `${numberFormat.format(overview.appliedImports)} importaciones aplicadas alimentan esta instalación local.`
              : 'Consultando el estado de la base local…'}
          </p>
        </div>
        <div className="io-columns">
          <div>
            <span className="detail-label">Inventario y soporte</span>
            <ul>
              <li>{overview ? numberFormat.format(overview.counts.parts) : '—'} repuestos normalizados</li>
              <li>{overview ? numberFormat.format(overview.counts.models) : '—'} modelos Canon conocidos</li>
              <li>{overview ? numberFormat.format(overview.counts.modelSupportItems) : '—'} registros de soporte Canon</li>
              <li>{overview ? numberFormat.format(overview.counts.waldbottStockItems) : '—'} filas del stock Waldbott vigente</li>
            </ul>
          </div>
          <div>
            <span className="detail-label">Fuentes recientes</span>
            <ul>
              {overview?.recentImports.length ? overview.recentImports.map((item) => (
                <li key={item.id}>
                  <span>{item.sourceName}</span>
                  <small className="overview-import-meta">{formatImportDomain(item.domain)} · {formatImportStatus(item.status)} · {item.files} archivo{item.files === 1 ? '' : 's'}</small>
                </li>
              )) : <li>{overview ? 'Todavía no hay archivos importados.' : 'Cargando fuentes…'}</li>}
            </ul>
          </div>
        </div>
      </section>

      <DatabaseRecoveryPanel refreshKey={importsRefreshKey} />

      <ImportArchivePanel refreshKey={importsRefreshKey} onRemoveBatch={onRemoveImport} />

      <section className="section-heading">
        <div>
          <div className="eyebrow">MAPA DE TRABAJO</div>
          <h2>Módulos de la suite</h2>
        </div>
        <p>Catálogo, operaciones, consumibles, MPS, precios y proformas ya operan sobre la misma base. Las fuentes históricas se incorporan por etapas.</p>
      </section>

      <div className="module-grid">
        {suiteModules.map((module) => (
          <button className="module-card" key={module.id} type="button" onClick={() => onSelect(module.id)}>
            <span className="module-card-top">
              <span className="module-symbol">{module.label.slice(0, 1)}</span>
              <span className="module-section">{sectionLabels[module.section]}</span>
            </span>
            <strong>{module.label}</strong>
            <span>{module.outputs[0]}</span>
            <span className="module-arrow">↗</span>
          </button>
        ))}
      </div>

      <p className="scope-note">Los proyectos actuales permanecen intactos mientras validamos esta nueva aplicación.</p>
    </div>
  );
}

function formatImportDomain(domain: string): string {
  const labels: Record<string, string> = {
    catalog: 'Catálogo',
    operations: 'Cartera',
    'operations-canon': 'Soporte Canon',
    maintenance: 'Mantenimiento',
    consumibles: 'Consumibles',
    services: 'Servicios',
    viaticos: 'Viáticos',
    mps: 'MPS',
  };
  return labels[domain] ?? domain;
}

function formatImportStatus(status: SuiteOverview['recentImports'][number]['status']): string {
  if (status === 'applied') return 'Aplicada';
  if (status === 'failed') return 'Fallida';
  return 'Pendiente';
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
