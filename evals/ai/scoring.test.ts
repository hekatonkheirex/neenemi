import { describe, expect, it } from 'vitest';
import { EVAL_DOCUMENTS } from './fixtures';
import { normalizeForMatch, RECALL_THRESHOLD, scoreFeatures, scoreSla, summarizeFeatures, summarizeSla, verdict } from './scoring';
import { SOFTWARE_FEATURES } from '../../src/modules/software-selector/catalog';

describe('AI eval fixtures', () => {
  it('has 10 unique documents whose expected features exist in the catalog', () => {
    expect(EVAL_DOCUMENTS).toHaveLength(10);
    expect(new Set(EVAL_DOCUMENTS.map((document) => document.id)).size).toBe(10);
    const known = new Set(SOFTWARE_FEATURES.map((feature) => feature.id));
    for (const document of EVAL_DOCUMENTS) {
      expect(document.features.length).toBeGreaterThan(0);
      for (const id of document.features) expect(known.has(id), `${document.id}: ${id}`).toBe(true);
    }
  });

  it('keeps every SLA anchor present in its own document text', () => {
    for (const document of EVAL_DOCUMENTS) {
      const text = normalizeForMatch(document.text);
      for (const anchor of document.slaAnchors) expect(text.includes(normalizeForMatch(anchor)), `${document.id}: ${anchor}`).toBe(true);
    }
  });
});

describe('AI eval scoring', () => {
  const document = EVAL_DOCUMENTS[0];

  it('matches SLA anchors ignoring accents and case, and lists the missing ones', () => {
    const score = scoreSla(document, [{ clientSource: 'Tiempo máximo de 4 HORAS hábiles', clientRequirement: 'Disponibilidad de 99,5%' }]);
    expect(score).toMatchObject({ expected: 3, found: 2, missing: ['multa'] });
  });

  it('counts missing and extra features separately', () => {
    const score = scoreFeatures(document, ['secure_print_auth', 'cloud_ocr']);
    expect(score).toMatchObject({ expected: 2, found: 1, extra: 1 });
    expect(score.missing).toEqual(['cost_tracking']);
  });

  it('passes at exactly the 80% recall threshold and fails below it', () => {
    expect(RECALL_THRESHOLD).toBe(0.8);
    const row = (found: number) => ({ id: 'x', expected: 10, found, missing: [], extra: 0 });
    expect(summarizeSla([row(8)]).passed).toBe(true);
    expect(summarizeSla([row(7)]).passed).toBe(false);
    expect(summarizeFeatures([{ ...row(8), extra: 2 }]).precision).toBeCloseTo(0.8);
  });

  it('is vacuously perfect with nothing expected', () => {
    expect(summarizeSla([]).recall).toBe(1);
  });

  it('never passes a suite with unevaluated documents', () => {
    const full = summarizeSla([{ id: 'a', expected: 2, found: 2, missing: [], extra: 0 }]);
    expect(verdict(full, 1)).toBe('PASS');
    expect(verdict(full, 2)).toBe('INCOMPLETE');
    expect(verdict(summarizeSla([{ id: 'a', expected: 2, found: 0, missing: ['x', 'y'], extra: 0 }]), 1)).toBe('FAIL');
  });
});
