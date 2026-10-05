import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { donutTotalFontSize, LegacyLineChart, LegacyStackedBarChart, LegacyHorizontalStackedBars } from './LegacyCharts';

const fmt = (value: number) => `₲ ${value.toLocaleString('es-PY')}`;

describe('LegacyHorizontalStackedBars', () => {
  it('el rótulo de la barra más larga cabe dentro del lienzo (760 px)', () => {
    const html = renderToStaticMarkup(
      <LegacyHorizontalStackedBars
        ariaLabel="t"
        labels={['A', 'B']}
        series={[{ label: 's', color: '#000', values: [33_379_358, 1_000_000] }]}
        valueFormatter={fmt}
      />,
    );
    const xs = [...html.matchAll(/legacy-chart-axis-label-value" x="([\d.]+)"/g)].map((m) => Number(m[1]));
    expect(xs).toHaveLength(2);
    const widest = fmt(33_379_358).length * 6.8;
    expect(Math.max(...xs) + widest).toBeLessThanOrEqual(760);
  });

  it('Línea y barras apiladas: las marcas del eje Y no se salen por la izquierda', () => {
    const series = [{ label: 's', color: '#000', values: [2_723_113_406, 100] }];
    for (const chart of [
      <LegacyLineChart key="l" ariaLabel="t" labels={['a', 'b']} series={series} valueFormatter={fmt} />,
      <LegacyStackedBarChart key="s" ariaLabel="t" labels={['a', 'b']} series={series} valueFormatter={fmt} />,
    ]) {
      const html = renderToStaticMarkup(chart);
      const xs = [...html.matchAll(/legacy-chart-axis-label" x="([\d.]+)" y="[\d.]+" text-anchor="end"/g)].map((m) => Number(m[1]));
      expect(xs.length).toBeGreaterThan(0);
      expect(Math.min(...xs) - fmt(2_723_113_406).length * 6.6).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('donutTotalFontSize', () => {
  it('achica el total largo para que quepa en el anillo y mantiene 17 px en los cortos', () => {
    expect(donutTotalFontSize('1.153')).toBe(17);
    expect(donutTotalFontSize('₲ 2.723.113.406')).toBeLessThan(17);
    expect(donutTotalFontSize('₲ 2.723.113.406') * '₲ 2.723.113.406'.length * 0.62).toBeLessThanOrEqual(120);
    expect(donutTotalFontSize('x'.repeat(60))).toBe(10);
  });
});
