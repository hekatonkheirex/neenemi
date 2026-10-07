import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import Dashboard from './Dashboard';
import type { SuiteOverview } from '../db/overview';

const base = { moduleCount: 12, overviewError: '', backupLevel: null, onNavigate: () => {} };
const withData = (over: object = {}) => ({
  counts: { contracts: 1234 },
  appliedImports: 1,
  recentImports: [],
  lastAppliedAt: '2026-03-04T12:00:00Z',
  dashboard: { portfolio: { activeEquipment: 40, activeEquipmentWithReadings: 25, activeContracts: 20, activeCustomers: 15, unknownContracts: 2, contractsByType: [{ type: 'Leasing', count: 7 }] }, canon: { discontinued: 4, scheduled: 6, unknown: 1 } },
  ...over,
}) as unknown as SuiteOverview;

describe('Dashboard', () => {
  it('sin datos muestra guiones, el conteo de módulos y «Cargando…» en lugar de ceros', () => {
    const markup = renderToStaticMarkup(<Dashboard {...base} overview={null} />);
    expect(markup).toContain('aria-label="Resumen de la suite"');
    expect(markup).toContain('>12</div>');
    expect(markup.match(/>—<\/div>/g)).toHaveLength(2);
    expect(markup).toContain('Cargando…');
  });

  it('con error no muestra ceros y lo dice', () => {
    const markup = renderToStaticMarkup(<Dashboard {...base} overview={null} overviewError="Sin conexión." />);
    expect(markup).toContain('role="alert"');
    expect(markup).toContain('No disponible');
  });

  it('con datos formatea contratos, fecha, cartera y Canon', () => {
    const markup = renderToStaticMarkup(<Dashboard {...base} overview={withData()} />);
    expect(markup).toContain('>15</div>');
    expect(markup).toContain('clientes con contrato activo');
    expect(markup).not.toContain('1.234');
    expect(markup).toContain('>04/03/2026</div>');
    expect(markup).toContain('Contratos activos · Leasing');
    expect(markup).toContain('Equipos con contrato activo');
    expect(markup).toContain('>40</div>');
    expect(markup).toContain('Abierto, Alquiler, Leasing y Mantenimiento');
    expect(markup).toContain('Modelos sin fecha de fin: 1');
  });

  it('la última carga aplicada sale de la base aunque las recientes no estén aplicadas', () => {
    const overview = withData({ recentImports: [{ appliedAt: null }, { appliedAt: null }], lastAppliedAt: '2026-02-01T12:00:00Z' });
    expect(renderToStaticMarkup(<Dashboard {...base} overview={overview} />)).toContain('>01/02/2026</div>');
    expect(renderToStaticMarkup(<Dashboard {...base} overview={withData({ lastAppliedAt: null })} />)).not.toContain('2026</div>');
  });

  it('muestra los tres bloques de gráficos', () => {
    const markup = renderToStaticMarkup(<Dashboard {...base} overview={withData()} />);
    expect(markup).toContain('aria-label="Gráficos de los módulos"');
    expect(markup).toContain('Top 10 clientes por costo');
    expect(markup).toContain('Control de viáticos');
  });

  it('aviso de respaldo solo cuando corresponde', () => {
    const warn = (level: 'never' | 'stale' | 'pending' | 'ok', overview: SuiteOverview | null) => renderToStaticMarkup(<Dashboard {...base} backupLevel={level as never} overview={overview} />).includes('Datos y respaldos');
    expect(warn('pending', withData())).toBe(true);
    expect(warn('stale', withData())).toBe(true);
    expect(warn('never', withData())).toBe(true);
    expect(warn('never', null)).toBe(false);
    expect(warn('ok', withData())).toBe(false);
  });

  it('usa solo tokens de marca y sin clases heredadas', () => {
    const markup = renderToStaticMarkup(<Dashboard {...base} overview={null} />);
    expect(markup).not.toMatch(/summary-card|summary-value|hero-block/);
    expect(markup).toContain('dark:bg-panel');
  });
});
