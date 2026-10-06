import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import Sidebar, { moduleIcons } from './Sidebar';
import { suiteModules } from './modules';

const sections = ['servicio técnico', 'administrativo', 'software', 'herramientas'] as const;
const sectionLabels = { 'servicio técnico': 'Servicio Técnico', administrativo: 'Administrativo', software: 'Software', herramientas: 'Herramientas' };
const render = (over: Partial<Parameters<typeof Sidebar>[0]> = {}) =>
  renderToStaticMarkup(
    <Sidebar activeModuleId={null} sections={sections} sectionLabels={sectionLabels} backupDue={false} sqliteWarning={false}
      version="9.9.9" logoUrl="/logo.png" onNavigate={() => {}} onOpenChangelog={() => {}} {...over} />,
  );

describe('Sidebar', () => {
  it('tiene un icono Lucide para cada módulo y una entrada por módulo', () => {
    for (const m of suiteModules) expect(moduleIcons[m.id], m.id).toBeTruthy();
    const markup = render();
    for (const m of suiteModules) expect(markup).toContain(m.label);
    expect(markup).toContain('aria-label="Barra lateral"');
    expect(markup).toContain('aria-label="Módulos de la suite"');
  });

  it('marca solo la entrada activa con aria-current', () => {
    expect(render().match(/aria-current="page"/g)).toHaveLength(1);
    const markup = render({ activeModuleId: 'mps' });
    expect(markup.match(/aria-current="page"/g)).toHaveLength(1);
    expect(markup).toMatch(/aria-current="page"[^>]*>(?:<svg.*?<\/svg>)Calculadora de insumos MPS/);
  });

  it('conserva los ganchos de impresión y del changelog, y muestra los avisos solo cuando aplican', () => {
    const quiet = render();
    expect(quiet).toMatch(/<aside[^>]*class="sidebar /);
    expect(quiet).toMatch(/<button[^>]*sidebar-version-link[^>]*aria-haspopup="dialog"[^>]*>Versión v9\.9\.9<\/button>/);
    expect(quiet).not.toContain('Respaldo pendiente');
    expect(quiet).not.toContain('SQLite requiere atención');
    const alert = render({ backupDue: true, sqliteWarning: true });
    expect(alert).toContain('Respaldo pendiente');
    expect(alert).toContain('SQLite requiere atención');
  });

  it('usa solo tokens de marca (sin azules fuera de paleta ni hugeicons)', () => {
    const markup = render({ activeModuleId: 'sla' });
    expect(markup).not.toMatch(/#79aaff|#4277e9|#77a7ff/i);
    expect(markup).toContain('bg-panel');
    expect(markup).toContain('outline-sky');
  });
});
