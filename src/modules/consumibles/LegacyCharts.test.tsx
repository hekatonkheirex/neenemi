import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { LegacyHorizontalStackedBars } from './LegacyCharts';

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
});
