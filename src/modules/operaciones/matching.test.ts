import { describe, expect, it } from 'vitest';
import { comparableModelKey, createModelSupportLookup, findModelSupport, modelMatchScore } from './matching';
import type { ModelDiscontinuationRecord } from './repository';

describe('operations model matching', () => {
  it('ignores voltage annotations when matching installed and Canon models', () => {
    expect(comparableModelKey('iR 1210 (230V)')).toBe(comparableModelKey('Canon iR 1210'));
    expect(modelMatchScore('iR 1210 (230V)', 'Canon iR 1210')).toBe(3);
  });

  it('recognizes imageRUNNER and IR-ADV aliases', () => {
    expect(modelMatchScore('imageRUNNER ADVANCE C5535', 'IR-ADV C5535')).toBe(3);
    expect(modelMatchScore('IRC5535', 'imageRUNNER ADVANCE C5535')).toBe(3);
  });

  it('removes stock descriptions and electrical noise without losing the model code', () => {
    expect(comparableModelKey('Impresora Canon IR ADV 525i 220-240V 50HZ USED')).toBe('IRADV525I');
  });

  it('keeps the iR 5000 V model code when matching the IR1643 family', () => {
    const oldModel: ModelDiscontinuationRecord = {
      id: 'old',
      modelLabel: 'iR 5000 V',
      partCode: '',
      endsAt: '2015-12-31',
      voltage: null,
      sourceNotes: [],
      sourceName: 'canon.xlsx',
      sourceLabel: null,
      installedCount: 0,
      installedModels: [],
      status: 'discontinued',
    };
    const currentModel = { ...oldModel, id: 'current', modelLabel: 'IR 1643 I', endsAt: '2028-12-01', status: 'scheduled' as const };
    const currentFaxModel = { ...currentModel, id: 'fax', modelLabel: 'IR 1643 IF' };
    const support = [oldModel, currentModel, currentFaxModel];

    expect(comparableModelKey(oldModel.modelLabel)).toBe('IR5000V');
    expect(modelMatchScore('FOTOCOPIADORA CANON IR1643i II', oldModel.modelLabel)).toBe(0);
    expect(findModelSupport('FOTOCOPIADORA CANON IR1643i II', support)).toBe(currentModel);
    expect(findModelSupport('FOTOCOPIADORA CANON IR1643IF II', support)).toBe(currentFaxModel);
  });

  it('deduplicates installed model labels before resolving Canon support', () => {
    const support: ModelDiscontinuationRecord = {
      id: 'canon-1',
      modelLabel: 'Canon iR 1210',
      partCode: '',
      endsAt: null,
      voltage: null,
      sourceNotes: [],
      sourceName: 'canon.xlsx',
      sourceLabel: null,
      installedCount: 0,
      installedModels: [],
      status: 'discontinued',
    };

    const lookup = createModelSupportLookup(['iR 1210', 'iR 1210', 'Canon iR 1210'], [support]);

    expect([...lookup.keys()]).toEqual(['iR 1210', 'Canon iR 1210']);
    expect(lookup.get('iR 1210')).toBe(support);
    expect(lookup.get('Canon iR 1210')).toBe(support);
  });
});
