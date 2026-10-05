import type { ReactNode } from 'react';

export type LegacyChartSeries = {
  label: string;
  color: string;
  values: readonly number[];
};

export type LegacyChartSegment = {
  label: string;
  color: string;
  value: number;
};

const chartNumber = new Intl.NumberFormat('es-PY', { maximumFractionDigits: 0 });
const CHART_WIDTH = 760;
/** Ancho aproximado de un carácter del rótulo de valor (11 px, negrita). */
const VALUE_LABEL_CHAR_WIDTH = 6.8;

export function LegacyLineChart({
  labels,
  series,
  valueFormatter = formatChartNumber,
  ariaLabel,
}: {
  labels: readonly string[];
  series: readonly LegacyChartSeries[];
  valueFormatter?: (value: number) => string;
  ariaLabel: string;
}) {
  if (labels.length === 0 || series.length === 0) return <LegacyChartEmpty />;

  const height = 280;
  const margin = { top: 20, right: 18, bottom: 48, left: 54 };
  const plotWidth = CHART_WIDTH - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const maximum = Math.max(...series.flatMap((item) => item.values), 1);
  const xAt = (index: number) => margin.left + (labels.length === 1 ? plotWidth / 2 : (index / (labels.length - 1)) * plotWidth);
  const yAt = (value: number) => margin.top + plotHeight - (value / maximum) * plotHeight;

  return (
    <LegacyChartFigure ariaLabel={ariaLabel} series={series} valueFormatter={valueFormatter}>
      <svg className="legacy-chart-svg" viewBox={`0 0 ${CHART_WIDTH} ${height}`} role="img" aria-label={ariaLabel}>
        <ChartGrid margin={margin} plotHeight={plotHeight} maximum={maximum} valueFormatter={valueFormatter} />
        {series.map((item) => {
          const points = labels.map((_, index) => `${xAt(index)},${yAt(item.values[index] ?? 0)}`).join(' ');
          return <polyline key={item.label} points={points} fill="none" stroke={item.color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />;
        })}
        {series.map((item) => labels.map((label, index) => (
          <circle key={`${item.label}-${label}-${index}`} cx={xAt(index)} cy={yAt(item.values[index] ?? 0)} r="4" fill={item.color} stroke="var(--ds-chart-surface)" strokeWidth="2">
            <title>{`${item.label} · ${label}: ${valueFormatter(item.values[index] ?? 0)}`}</title>
          </circle>
        )))}
        <ChartXAxis labels={labels} xAt={xAt} height={height} margin={margin} />
      </svg>
    </LegacyChartFigure>
  );
}

export function LegacyStackedBarChart({
  labels,
  series,
  valueFormatter = formatChartNumber,
  ariaLabel,
}: {
  labels: readonly string[];
  series: readonly LegacyChartSeries[];
  valueFormatter?: (value: number) => string;
  ariaLabel: string;
}) {
  if (labels.length === 0 || series.length === 0) return <LegacyChartEmpty />;

  const height = 290;
  const margin = { top: 20, right: 18, bottom: 60, left: 54 };
  const plotWidth = CHART_WIDTH - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const totals = labels.map((_, index) => series.reduce((sum, item) => sum + (item.values[index] ?? 0), 0));
  const maximum = Math.max(...totals, 1);
  const slotWidth = plotWidth / labels.length;
  const barWidth = Math.max(12, slotWidth * 0.68);

  return (
    <LegacyChartFigure ariaLabel={ariaLabel} series={series} valueFormatter={valueFormatter}>
      <svg className="legacy-chart-svg" viewBox={`0 0 ${CHART_WIDTH} ${height}`} role="img" aria-label={ariaLabel}>
        <ChartGrid margin={margin} plotHeight={plotHeight} maximum={maximum} valueFormatter={valueFormatter} />
        {labels.map((label, index) => {
          let accumulated = 0;
          const x = margin.left + index * slotWidth + (slotWidth - barWidth) / 2;
          return <g key={label}>
            {series.map((item) => {
              const value = item.values[index] ?? 0;
              const y = margin.top + plotHeight - ((accumulated + value) / maximum) * plotHeight;
              const segmentHeight = (value / maximum) * plotHeight;
              accumulated += value;
              return value > 0 ? <rect key={item.label} x={x} y={y} width={barWidth} height={Math.max(segmentHeight, 1)} rx="3" fill={item.color}>
                <title>{`${label} · ${item.label}: ${valueFormatter(value)}`}</title>
              </rect> : null;
            })}
            <text className="legacy-chart-axis-label" x={x + barWidth / 2} y={height - 28} textAnchor="middle">{truncate(label, 16)}</text>
          </g>;
        })}
      </svg>
    </LegacyChartFigure>
  );
}

export function LegacyHorizontalStackedBars({
  labels,
  series,
  valueFormatter = formatChartNumber,
  ariaLabel,
}: {
  labels: readonly string[];
  series: readonly LegacyChartSeries[];
  valueFormatter?: (value: number) => string;
  ariaLabel: string;
}) {
  if (labels.length === 0 || series.length === 0) return <LegacyChartEmpty />;

  const rowHeight = 30;
  const height = Math.max(220, labels.length * rowHeight + 54);
  const margin = { top: 18, right: 18, bottom: 28, left: 170 };
  const plotWidth = CHART_WIDTH - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const totals = labels.map((_, index) => series.reduce((sum, item) => sum + (item.values[index] ?? 0), 0));
  const maximum = Math.max(...totals, 1);
  // La barra más larga deja sitio al texto de su total: sin esto el rótulo se salía del gráfico.
  const labelRoom = Math.max(...totals.map((total) => valueFormatter(total).length)) * VALUE_LABEL_CHAR_WIDTH + 14;
  const barWidth = Math.max(plotWidth - labelRoom, plotWidth / 2);

  return (
    <LegacyChartFigure ariaLabel={ariaLabel} series={series} valueFormatter={valueFormatter}>
      <svg className="legacy-chart-svg legacy-chart-svg-tall" viewBox={`0 0 ${CHART_WIDTH} ${height}`} role="img" aria-label={ariaLabel}>
        {labels.map((label, index) => {
          const y = margin.top + index * rowHeight;
          let accumulated = 0;
          return <g key={label}>
            <text className="legacy-chart-axis-label legacy-chart-axis-label-left" x={margin.left - 12} y={y + 16} textAnchor="end">{truncate(label, 25)}</text>
            <rect className="legacy-chart-track" x={margin.left} y={y + 5} width={plotWidth} height="18" rx="5" />
            {series.map((item) => {
              const value = item.values[index] ?? 0;
              const x = margin.left + (accumulated / maximum) * barWidth;
              const width = (value / maximum) * barWidth;
              accumulated += value;
              return value > 0 ? <rect key={item.label} x={x} y={y + 5} width={Math.max(width, 2)} height="18" rx="5" fill={item.color}>
                <title>{`${label} · ${item.label}: ${valueFormatter(value)}`}</title>
              </rect> : null;
            })}
            <text className="legacy-chart-axis-label legacy-chart-axis-label-value" x={margin.left + (totals[index] / maximum) * barWidth + 8} y={y + 18}>{valueFormatter(totals[index])}</text>
          </g>;
        })}
      </svg>
    </LegacyChartFigure>
  );
}

export function LegacyDonutChart({
  segments,
  valueFormatter = formatChartNumber,
  ariaLabel,
  centerLabel,
}: {
  segments: readonly LegacyChartSegment[];
  valueFormatter?: (value: number) => string;
  ariaLabel: string;
  centerLabel?: string;
}) {
  const visibleSegments = segments.filter((segment) => segment.value > 0);
  const total = visibleSegments.reduce((sum, segment) => sum + segment.value, 0);
  if (total <= 0) return <LegacyChartEmpty />;

  const radius = 76;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <div className="legacy-donut-layout">
      <svg className="legacy-donut-svg" viewBox="0 0 240 240" role="img" aria-label={ariaLabel}>
        <circle className="legacy-donut-track" cx="120" cy="120" r={radius} fill="none" strokeWidth="28" />
        {visibleSegments.map((segment) => {
          const length = (segment.value / total) * circumference;
          const dashOffset = -offset;
          offset += length;
          return <circle key={segment.label} cx="120" cy="120" r={radius} fill="none" stroke={segment.color} strokeWidth="28" strokeDasharray={`${length} ${circumference - length}`} strokeDashoffset={dashOffset} transform="rotate(-90 120 120)">
            <title>{`${segment.label}: ${valueFormatter(segment.value)}`}</title>
          </circle>;
        })}
        <text className="legacy-donut-total" x="120" y="116" textAnchor="middle">{valueFormatter(total)}</text>
        <text className="legacy-donut-label" x="120" y="138" textAnchor="middle">{centerLabel ?? 'total'}</text>
      </svg>
      <div className="legacy-chart-legend">
        {visibleSegments.map((segment) => <div key={segment.label} className="legacy-chart-legend-item"><i style={{ backgroundColor: segment.color }} /><span>{segment.label}</span><strong>{valueFormatter(segment.value)}</strong></div>)}
      </div>
    </div>
  );
}

function LegacyChartFigure({ children, ariaLabel, series, valueFormatter }: { children: ReactNode; ariaLabel: string; series: readonly LegacyChartSeries[]; valueFormatter: (value: number) => string }) {
  return <figure className="legacy-chart-figure">
    {children}
    <figcaption className="legacy-chart-legend" aria-label={`Leyenda de ${ariaLabel}`}>
      {series.map((item) => <span className="legacy-chart-legend-item" key={item.label}><i style={{ backgroundColor: item.color }} /><span>{item.label}</span><strong>{valueFormatter(Math.max(...item.values, 0))} máx.</strong></span>)}
    </figcaption>
  </figure>;
}

function ChartGrid({ margin, plotHeight, maximum, valueFormatter }: { margin: { top: number; left: number }; plotHeight: number; maximum: number; valueFormatter: (value: number) => string }) {
  return <>
    {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
      const y = margin.top + plotHeight - ratio * plotHeight;
      return <g key={ratio}>
        <line className="legacy-chart-gridline" x1={margin.left} x2={CHART_WIDTH - 18} y1={y} y2={y} />
        <text className="legacy-chart-axis-label" x={margin.left - 10} y={y + 4} textAnchor="end">{valueFormatter(maximum * ratio)}</text>
      </g>;
    })}
  </>;
}

function ChartXAxis({ labels, xAt, height, margin }: { labels: readonly string[]; xAt: (index: number) => number; height: number; margin: { bottom: number } }) {
  return <>{labels.map((label, index) => <text className="legacy-chart-axis-label" key={`${label}-${index}`} x={xAt(index)} y={height - margin.bottom + 22} textAnchor="middle">{truncate(label, 12)}</text>)}</>;
}

function LegacyChartEmpty() {
  return <p className="legacy-chart-empty">No hay datos suficientes para construir este gráfico.</p>;
}

function formatChartNumber(value: number): string {
  return chartNumber.format(value);
}

function truncate(value: string, maximum: number): string {
  return value.length > maximum ? `${value.slice(0, maximum - 1)}…` : value;
}
