import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AnnualActivityChart, AnnualCostChart } from './TravelAnnualCharts';
import type { HistoricalSummary } from './types';

const summary = (year: number, over: Partial<HistoricalSummary>) => ({ year, partial: false, services: 0, trips: 0, generalCost: 0, fuelCost: 0, renditions: 0, ...over }) as HistoricalSummary;
const big = [summary(2022, { services: 1485, trips: 227 })];
const data = [summary(2024, { services: 100, trips: 50, generalCost: 2_000_000 }), summary(2025, { partial: true, services: 40, trips: 20, generalCost: 900_000 })];

describe('TravelAnnualCharts', () => {
  it('actividad: una columna por año con servicios y viajes reales visibles sin hover, y marca el año en curso', () => {
    const html = renderToStaticMarkup(<AnnualActivityChart summaries={data} />);
    for (const text of ['100 servicios', '50 viajes', '40 servicios', '20 viajes', '2024', '2025', 'Cerrado', 'En curso']) expect(html).toContain(text);
    expect(html).toContain('height:88%');
    for (const value of ['>100<', '>50<', '>40<', '>20<']) expect(html).toContain(value);
  });

  it('costos: muestra importes reales en guaraníes y avisa que un año parcial no es ahorro', () => {
    const html = renderToStaticMarkup(<AnnualCostChart summaries={data} />);
    expect(html).toContain('2024: ₲ 2.000.000');
    expect(html).toContain('2025: ₲ 900.000');
    expect(html).toContain('un acumulado parcial no equivale a un año completo');
  });

  it('año sin valores no dibuja barra', () => {
    const html = renderToStaticMarkup(<AnnualCostChart summaries={[summary(2023, {})]} />);
    expect(html).toContain('height:0%');
  });
});

it('actividad: miles con separador y la barra más alta deja sitio al valor', () => {
  const html = renderToStaticMarkup(<AnnualActivityChart summaries={big} />);
  expect(html).toContain('>1.485<');
  expect(html).toContain('bottom-full');
});
