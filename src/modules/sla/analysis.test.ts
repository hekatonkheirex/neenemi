import { describe, expect, it } from 'vitest';
import { analyzeSlaRequirements, stripSlaAccents } from './analysis';
import { DEMO_SLA_TEXT } from './constants';

describe('SLA local analysis', () => {
  it('detects the supported demo clauses and calculates the deterministic risk', () => {
    const result = analyzeSlaRequirements(DEMO_SLA_TEXT, 'pliego-demo.txt');

    expect(stripSlaAccents('Confidencialidad crítica')).toBe('Confidencialidad critica');
    expect(result.usedFallback).toBe(false);
    expect(result.items).toHaveLength(8);
    expect(result.overallRisk).toBe('critical');
    expect(result.complianceScore).toBe(50);
    expect(result.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'paper-supply', status: 'gap' }),
      expect.objectContaining({ id: 'official-channels', status: 'complies' }),
      expect.objectContaining({ id: 'meter-reading', status: 'partial' }),
    ]));
  });

  it('returns an explicit manual-review result when the text is not comparable', () => {
    const result = analyzeSlaRequirements('texto administrativo sin cláusulas de servicio', 'nota.txt');

    expect(result.usedFallback).toBe(true);
    expect(result.overallRisk).toBe('medium');
    expect(result.items).toEqual([
      expect.objectContaining({ id: 'manual-review', status: 'na', clientSource: 'nota.txt' }),
    ]);
  });
});
