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
    const xs = [...html.matchAll(/data-role="axis-label-value" x="([\d.]+)"/g)].map((m) => Number(m[1]));
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
      const xs = [...html.matchAll(/data-role="axis-label" x="([\d.]+)" y="[\d.]+" text-anchor="end"/g)].map((m) => Number(m[1]));
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

  it('Línea: la última marca del eje X (2026-07) cabe en el lienzo', () => {
    const labels = ['2026-01', '2026-02', '2026-07'];
    const html = renderToStaticMarkup(<LegacyLineChart ariaLabel="t" labels={labels} series={[{ label: 's', color: '#000', values: [1, 2, 3] }]} />);
    const x = Number([...html.matchAll(/data-role="axis-label" x="([\d.]+)" y="[\d.]+" text-anchor="middle">2026-07/g)][0][1]);
    expect(x + (7 * 6.6) / 2).toBeLessThanOrEqual(760);
  });

  it('Línea: con muchos meses se muestran como mucho 12 marcas del eje X para que no se pisen', () => {
    const labels = Array.from({ length: 24 }, (_, index) => `2025-${String(index + 1).padStart(2, '0')}`);
    const html = renderToStaticMarkup(<LegacyLineChart ariaLabel="t" labels={labels} series={[{ label: 's', color: '#000', values: labels.map((_, index) => index) }]} />);
    const xLabels = [...html.matchAll(/data-role="axis-label" x="[\d.]+" y="[\d.]+" text-anchor="middle"/g)];
    expect(xLabels.length).toBeLessThanOrEqual(12);
    expect(xLabels.length).toBeGreaterThan(0);
  });
});
