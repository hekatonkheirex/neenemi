import { describe, expect, it } from 'vitest';
import { analyzeEquipmentCounters, calcAppliedWaste, findMatchingRule, type MaintenanceCounterRecord, type MaintenanceModelRule } from './analysis';

const rules: MaintenanceModelRule[] = [
  { id: '527', modelLabel: 'CANON iR-ADV DX 527 / 529', usefulLife: 1_500_000, optimalBase: 22_750, maxWaste: 0.68 },
  { id: '1643', modelLabel: 'Canon iR1643', usefulLife: 500_000, optimalBase: 13_000, maxWaste: 0.7 },
];

describe('maintenance analysis', () => {
  it('matches legacy equipment labels against imported model rules', () => {
    expect(findMatchingRule('FOTOCOPIADORA CANON IRADV DX 527i', rules)).toEqual(rules[0]);
    expect(findMatchingRule('IMPRESORA CANON MF645Cx', rules)).toBeNull();
  });

  it('keeps the legacy waste formula and classifies the latest equipment state', () => {
    expect(calcAppliedWaste(750_000, 1_500_000, 0.68)).toBeCloseTo(0.34);

    const records: MaintenanceCounterRecord[] = [
      record('2026-05', 20_000, 600_000),
      record('2026-06', 25_000, 700_000),
      record('2026-07', 30_000, 800_000),
    ];
    const [analysis] = analyzeEquipmentCounters(records, rules, 3);

    expect(analysis).toMatchObject({
      serialNumber: 'SER-001',
      matchedModelLabel: rules[0].modelLabel,
      averageCopies: 25_000,
      status: 'CRÍTICO',
      latestCounter: 800_000,
    });
    expect(analysis.periods).toHaveLength(3);
  });
});

function record(period: string, copies: number, counter: number): MaintenanceCounterRecord {
  return {
    id: period,
    customerName: 'Cliente de prueba',
    contractReference: 'OV-001',
    modelLabel: 'FOTOCOPIADORA CANON IRADV DX 527i',
    serialNumber: 'SER-001',
    period,
    paperType: 'Negro A4',
    copies,
    counter,
    maintenanceModelRuleId: '527',
  };
}
