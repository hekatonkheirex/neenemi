import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { formatMonth, MonthPicker, monthValue } from './month-picker';

describe('month-picker helpers', () => {
  it('formatea AAAA-MM en español y rechaza valores inválidos', () => {
    expect(formatMonth('2026-10')).toBe('octubre 2026');
    expect(formatMonth('2026-01')).toBe('enero 2026');
    for (const bad of ['', '2026-13', '2026-00', '26-10', 'abc']) expect(formatMonth(bad)).toBe('');
  });
  it('arma el valor AAAA-MM con ceros', () => {
    expect(monthValue(2026, 0)).toBe('2026-01');
    expect(monthValue(2026, 11)).toBe('2026-12');
  });
});

describe('MonthPicker', () => {
  it('muestra el mes elegido o el texto vacío, con popover cerrado', () => {
    const set = renderToStaticMarkup(<MonthPicker label="Desde" value="2026-10" onChange={() => {}} />);
    expect(set).toContain('octubre 2026');
    expect(set).toContain('aria-label="Desde: octubre 2026"');
    expect(set).toContain('aria-expanded="false"');
    expect(set).not.toContain('role="dialog"');
    expect(renderToStaticMarkup(<MonthPicker value="" onChange={() => {}} />)).toContain('Todos');
  });
});
