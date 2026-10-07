import { describe, expect, it } from 'vitest';
import {
  classifyCategory,
  classifyCode,
  classifyRecordKind,
  detectFamily,
  detectFamilyFromConsumable,
  descMentionsForeignModel,
  formatDate,
  formatMonth,
  usdToPyg,
} from './analysis';

describe('consumibles analysis helpers', () => {
  it.each([
    ['01/08/2026', '2026-08-01', '2026-08'],
    ['1/8/2026 09:30', '2026-08-01', '2026-08'],
    ['29/02/2024', '2024-02-29', '2024-02'],
    ['31/02/2026', '', ''],
    ['29/02/2025', '', ''],
    ['2026-08-01T12:00:00Z', '2026-08-01', '2026-08'],
  ])('normalizes source date %s without changing its calendar day', (source, date, month) => {
    expect(formatDate(source)).toBe(date);
    expect(formatMonth(source)).toBe(month);
  });

  it('keeps Excel dates and month-only fallback periods usable for monthly filters', () => {
    expect(formatDate(new Date('2026-08-01T12:00:00Z'))).toBe('2026-08-01');
    expect(formatMonth('08/2026')).toBe('2026-08');
    expect(formatMonth('2026-08')).toBe('2026-08');
    expect(formatDate(new Date(Number.NaN))).toBe('');
  });

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
