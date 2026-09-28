import { describe, expect, it } from 'vitest';
import { buildMaintenanceExecutiveSummary } from './maintenance-summary';
import type { MaintenanceAnalysis } from './analysis';

describe('maintenance executive summary', () => {
  it('counts states, prioritizes alerts and derives deterministic insights', () => {
    const summary = buildMaintenanceExecutiveSummary([
      analysis('SER-1', 'Cliente A', 'Canon iR1643', 'CRÍTICO', 1.4, 1.2, 0),
      analysis('SER-2', 'Cliente A', 'Canon iR1643', 'ATENCIÓN', 1.1, 0.9, 100),
      analysis('SER-3', 'Cliente B', 'Canon iR1643', 'NORMAL', 0.7, 0.5, 250),
      analysis('SER-4', 'Cliente C', 'Modelo nuevo', 'NO_RECONOCIDO', 0, 0, 0),
    ]);

    expect(summary).toMatchObject({
      total: 4,
      normal: 1,
      critical: 1,
      attention: 1,
      unrecognized: 1,
      zeroCounters: 2,
      overworked: 2,
    });
    expect(summary.urgent.map((item) => item.serialNumber)).toEqual(['SER-1']);
    expect(summary.caution.map((item) => item.serialNumber)).toEqual(['SER-2']);
    expect(summary.urgentAll.map((item) => item.serialNumber)).toEqual(['SER-1']);
    expect(summary.cautionAll.map((item) => item.serialNumber)).toEqual(['SER-2']);
    expect(summary.unrecognizedList.map((item) => item.serialNumber)).toEqual(['SER-4']);
    expect(summary.zeroList.map((item) => item.serialNumber)).toEqual(['SER-1', 'SER-4']);
    expect(summary.recommendedExceeded.map((item) => item.serialNumber)).toEqual(['SER-3']);
    expect(summary.insights).toEqual(expect.arrayContaining([
      'Cliente A: 1 de 2 equipos en estado crítico.',
      '1 equipo superó el 100% de la vida útil configurada.',
    ]));
  });

  it('keeps KPI totals independent from the eight-row priority limit', () => {
    const critical = Array.from({ length: 9 }, (_, index) =>
      analysis(`CRIT-${index}`, 'Cliente crítico', 'Canon iR1643', 'CRÍTICO', 2 - index / 10, 0.5, 100),
    );

    const summary = buildMaintenanceExecutiveSummary(critical);

    expect(summary.critical).toBe(9);
    expect(summary.urgent).toHaveLength(8);
    expect(summary.urgentAll).toHaveLength(9);
  });

  it('keeps the last six periods for the critical trend, including zero periods', () => {
    const first = analysis('SER-1', 'Cliente A', 'Canon iR1643', 'CRÍTICO', 1.4, 1.2, 100);
    first.periods = [
      period('2026-01', 'CRÍTICO'),
      period('2026-02', 'NORMAL'),
      period('2026-03', 'CRÍTICO'),
    ];

    expect(buildMaintenanceExecutiveSummary([first]).criticalTrend).toEqual([
      { period: '2026-01', count: 1 },
      { period: '2026-02', count: 0 },
      { period: '2026-03', count: 1 },
    ]);
  });
});

function analysis(
  serialNumber: string,
  customerName: string,
  modelLabel: string,
  status: MaintenanceAnalysis['status'],
  ratio: number,
  usefulLifePercent: number,
  averageCopies: number,
): MaintenanceAnalysis {
  return {
    serialNumber,
    modelLabel,
    customerName,
    contractReference: '',
    periods: [],
    averageCopies,
    matchedModelLabel: status === 'NO_RECONOCIDO' ? null : modelLabel,
    usefulLife: 100,
    optimalBase: 100,
    maxWaste: 0.7,
    appliedWaste: 0.1,
    optimalMonthly: 100,
    ratio,
    status,
    recommendedAction: '',
    latestCounter: 0,
    usefulLifePercent,
  };
}

function period(period: string, status: MaintenanceAnalysis['status']): MaintenanceAnalysis['periods'][number] {
  return {
    period,
    paperType: '',
    copies: 100,
    counter: 100,
    appliedWaste: 0,
    optimalMonthly: 100,
    ratio: 1,
    status,
  };
}
