import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import Dashboard from './Dashboard';
import type { SuiteOverview } from '../db/overview';

const base = { moduleCount: 12, importsRefreshKey: 0, onBackupLevel: () => {}, onClearImports: () => {}, clearingImports: false, clearImportsMessage: null };

describe('Dashboard', () => {
  it('sin datos muestra guiones y el conteo de módulos', () => {
    const markup = renderToStaticMarkup(<Dashboard {...base} overview={null} />);
    expect(markup).toContain('aria-label="Resumen de la suite"');
    expect(markup).toContain('>12</div>');
    expect(markup.match(/>—<\/div>/g)).toHaveLength(2);
  });

  it('con datos formatea contratos y la fecha de la última carga aplicada', () => {
    const overview = { counts: { contracts: 1234 }, recentImports: [{ appliedAt: '2026-03-04T12:00:00Z' }] } as unknown as SuiteOverview;
    const markup = renderToStaticMarkup(<Dashboard {...base} overview={overview} />);
    expect(markup).toContain('>1.234</div>');
    expect(markup).toContain('>04/03/2026</div>');
  });

  it('usa solo tokens de marca y sin clases heredadas de las tarjetas', () => {
    const markup = renderToStaticMarkup(<Dashboard {...base} overview={null} />);
    expect(markup).not.toMatch(/summary-card|summary-value|hero-block/);
    expect(markup).toContain('dark:bg-panel');
  });
});
