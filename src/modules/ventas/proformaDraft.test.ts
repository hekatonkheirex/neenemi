import { describe, expect, it } from 'vitest';
import { hasProformaDraft } from './ProformasModule';
import type { Proforma, ProformaHeader } from './types';

const header: ProformaHeader = {
  customerName: '', customerContact: '', serviceReport: '', serviceReportNumber: '', reference: '',
  issuedAt: '2026-10-02T00:00:00.000Z', attendedBy: '', modelName: '', serialNumber: '', mode: 'sin-contrato',
};
const blankLabor = [{ id: 'l1', description: '', costLocal: null, salePriceLocal: null }];

describe('hasProformaDraft', () => {
  it('una proforma recién abierta no cuenta como borrador', () => {
    expect(hasProformaDraft(null, header, [], blankLabor)).toBe(false);
  });

  it('detecta cabecera, líneas o mano de obra escritas', () => {
    expect(hasProformaDraft(null, { ...header, customerName: 'ACME' }, [], blankLabor)).toBe(true);
    expect(hasProformaDraft(null, header, [{}], blankLabor)).toBe(true);
    expect(hasProformaDraft(null, header, [], [{ ...blankLabor[0], costLocal: 0 }])).toBe(true);
  });

  it('ignora espacios en blanco', () => {
    expect(hasProformaDraft(null, { ...header, reference: '   ' }, [], blankLabor)).toBe(false);
  });

  it('una proforma guardada ya no es borrador aunque tenga datos', () => {
    expect(hasProformaDraft({} as Proforma, { ...header, customerName: 'ACME' }, [{}], blankLabor)).toBe(false);
  });
});
