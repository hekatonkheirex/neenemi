import { describe, expect, it } from 'vitest';
import {
  classifyCategory,
  classifyCode,
  classifyRecordKind,
  detectFamily,
  detectFamilyFromConsumable,
  descMentionsForeignModel,
  usdToPyg,
} from './analysis';

describe('consumibles analysis helpers', () => {
  it('detects the supported printer families from equipment and descriptions', () => {
    expect(detectFamily('IMPRESORA CANON IRADV DX 717')).toBe('T03');
    expect(detectFamily('Canon imageRUNNER 1643i')).toBe('T06');
    expect(detectFamily('iR ADV C3325i')).toBe('GPR53');
    expect(detectFamilyFromConsumable('GPR-53', 'Tóner compatible')).toBe('GPR53');
    expect(detectFamily('Canon LBP 226dw')).toBeNull();
  });

  it('keeps the legacy original/compatible and category rules', () => {
    expect(classifyCode('2725C002AA')).toBe('original');
    expect(classifyCode('CRG-T03')).toBe('compatible');
    expect(classifyCategory('KIT DE CILINDRO')).toBe('cilindro');
    expect(classifyCategory('ROLLER ADF')).toBe('rodillo');
    expect(classifyRecordKind('repuestos', 'MOTOR PRINCIPAL')).toBe('part');
    expect(classifyRecordKind('repuestos', 'KIT DE RODILLO')).toBe('consumable');
  });

  it('rejects descriptions that name a foreign printer model', () => {
    expect(descMentionsForeignModel('Tóner para IR ADV C3325i')).toBe(false);
    expect(descMentionsForeignModel('Tóner para IR ADV C5860i')).toBe(true);
  });

  it('converts normalized USD values back to whole guaranies for display', () => {
    expect(usdToPyg(1)).toBe(5969);
    expect(usdToPyg(Number.NaN)).toBe(0);
  });
});
