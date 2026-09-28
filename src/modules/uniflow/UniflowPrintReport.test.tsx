import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { DEFAULT_UNIFLOW_PRICE_CATALOG } from './catalog';
import { calculateUniflowConfiguration } from './pricing';
import UniflowPrintReport from './UniflowPrintReport';

describe('uniFLOW print report', () => {
  it('renders the legacy proposal sections and all calculated license groups', () => {
    const results = calculateUniflowConfiguration([
      { id: 't1', modelName: 'iRADV DX 8905', quantity: 12, withCIP: true },
      { id: 't2', modelName: 'iR C3326', quantity: 3, withCIP: true },
    ], 36, DEFAULT_UNIFLOW_PRICE_CATALOG);
    const markup = renderToStaticMarkup(<UniflowPrintReport results={results} clientName="Cliente de prueba" />);

    expect(markup).toContain('uniFLOW Online');
    expect(markup).toContain('Cliente de prueba');
    expect(markup).toContain('1. Equipos Canon Seleccionados');
    expect(markup).toContain('3575B806AA');
    expect(markup).toContain('3575B831AA');
    expect(markup).toContain('3575B819AA');
    expect(markup).toContain('3575B793AA');
    expect(markup).toContain('Total contrato acumulado (36 meses)');
  });
});
