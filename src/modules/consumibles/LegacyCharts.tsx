import type { ReactNode } from 'react';
import { cn } from '../../core/cn';
import { Muted } from '../../core/ui/card';

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

// Estilos de los gráficos: utilidades Tailwind sobre los elementos SVG. data-role queda como gancho para las pruebas de geometría.
const svgClass = 'block h-auto min-h-[220px] w-full overflow-visible text-ink-2 dark:text-[#9fb2d1]';
const axisLabelClass = 'fill-current text-[11px] font-semibold';
const legendClass = 'flex min-w-0 flex-wrap gap-x-4 gap-y-2 text-[0.7rem] text-ink-2 dark:text-[#9fb2d1]';
const legendItemClass = 'inline-flex min-w-0 items-center gap-1.5';

const chartNumber = new Intl.NumberFormat('es-PY', { maximumFractionDigits: 0 });
const CHART_WIDTH = 760;
/** Ancho aproximado de un carácter del rótulo de valor (11 px, negrita). */
const VALUE_LABEL_CHAR_WIDTH = 6.8;
/** Ancho aproximado de un carácter de las marcas del eje (11 px, seminegrita). */
const AXIS_LABEL_CHAR_WIDTH = 6.6;

/** Margen izquierdo que deja sitio a la marca más ancha del eje Y (con ₲ y miles el valor de 54 px la cortaba). */
function axisMarginLeft(maximum: number, valueFormatter: (value: number) => string): number {
  return Math.max(54, valueFormatter(maximum).length * AXIS_LABEL_CHAR_WIDTH + 16);
}

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
  const maximum = Math.max(...series.flatMap((item) => item.values), 1);
  // Derecha ancha: la última marca del eje X va centrada en el borde del área y su mitad sale hacia fuera.
  const margin = { top: 20, right: 32, bottom: 48, left: axisMarginLeft(maximum, valueFormatter) };
  const plotWidth = CHART_WIDTH - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const xAt = (index: number) => margin.left + (labels.length === 1 ? plotWidth / 2 : (index / (labels.length - 1)) * plotWidth);
  const yAt = (value: number) => margin.top + plotHeight - (value / maximum) * plotHeight;

  return (
    <LegacyChartFigure ariaLabel={ariaLabel} series={series} valueFormatter={valueFormatter}>
      <svg className={svgClass} viewBox={`0 0 ${CHART_WIDTH} ${height}`} role="img" aria-label={ariaLabel}>
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
  const totals = labels.map((_, index) => series.reduce((sum, item) => sum + (item.values[index] ?? 0), 0));
  const maximum = Math.max(...totals, 1);
  const margin = { top: 20, right: 18, bottom: 60, left: axisMarginLeft(maximum, valueFormatter) };
  const plotWidth = CHART_WIDTH - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const slotWidth = plotWidth / labels.length;
  const barWidth = Math.max(12, slotWidth * 0.68);

  return (
    <LegacyChartFigure ariaLabel={ariaLabel} series={series} valueFormatter={valueFormatter}>
      <svg className={svgClass} viewBox={`0 0 ${CHART_WIDTH} ${height}`} role="img" aria-label={ariaLabel}>
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
            <text className={axisLabelClass} data-role="axis-label" x={x + barWidth / 2} y={height - 28} textAnchor="middle">{truncate(label, 16)}</text>
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
      <svg className={cn(svgClass, 'min-h-[260px]')} viewBox={`0 0 ${CHART_WIDTH} ${height}`} role="img" aria-label={ariaLabel}>
        {labels.map((label, index) => {
          const y = margin.top + index * rowHeight;
          let accumulated = 0;
          return <g key={label}>
            <text className="fill-current text-[10px] font-semibold" data-role="axis-label" x={margin.left - 12} y={y + 16} textAnchor="end">{truncate(label, 25)}</text>
            <rect className="fill-navy/10 dark:fill-white/10" x={margin.left} y={y + 5} width={plotWidth} height="18" rx="5" />
            {series.map((item) => {
              const value = item.values[index] ?? 0;
              const x = margin.left + (accumulated / maximum) * barWidth;
              const width = (value / maximum) * barWidth;
              accumulated += value;
              return value > 0 ? <rect key={item.label} x={x} y={y + 5} width={Math.max(width, 2)} height="18" rx="5" fill={item.color}>
                <title>{`${label} · ${item.label}: ${valueFormatter(value)}`}</title>
              </rect> : null;
            })}
            <text className="fill-current text-[10px] font-bold" data-role="axis-label-value" x={margin.left + (totals[index] / maximum) * barWidth + 8} y={y + 18}>{valueFormatter(totals[index])}</text>
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
    <div className="grid min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,11rem),1fr))] items-center gap-4">
      <svg className="mx-auto block h-auto w-full max-w-60" viewBox="0 0 240 240" role="img" aria-label={ariaLabel}>
        <circle className="stroke-navy/10 dark:stroke-white/10" cx="120" cy="120" r={radius} fill="none" strokeWidth="28" />
        {visibleSegments.map((segment) => {
          const length = (segment.value / total) * circumference;
          const dashOffset = -offset;
          offset += length;
          return <circle key={segment.label} cx="120" cy="120" r={radius} fill="none" stroke={segment.color} strokeWidth="28" strokeDasharray={`${length} ${circumference - length}`} strokeDashoffset={dashOffset} transform="rotate(-90 120 120)">
            <title>{`${segment.label}: ${valueFormatter(segment.value)}`}</title>
          </circle>;
        })}
        <text className="fill-navy font-extrabold dark:fill-white" x="120" y="116" textAnchor="middle" style={{ fontSize: donutTotalFontSize(valueFormatter(total)) }}>{valueFormatter(total)}</text>
        <text className="fill-ink-2 text-[10px] font-bold dark:fill-[#9fb2d1]" x="120" y="138" textAnchor="middle">{centerLabel ?? 'total'}</text>
      </svg>
      <div className={legendClass}>
        {visibleSegments.map((segment) => <div key={segment.label} className={legendItemClass}><i className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: segment.color }} /><span className="min-w-0 truncate">{segment.label}</span><strong className="text-[0.68rem] font-bold text-navy dark:text-[#d6e2f5]">{valueFormatter(segment.value)}</strong></div>)}
      </div>
    </div>
  );
}

function LegacyChartFigure({ children, ariaLabel, series, valueFormatter }: { children: ReactNode; ariaLabel: string; series: readonly LegacyChartSeries[]; valueFormatter: (value: number) => string }) {
  return <figure className="m-0 grid min-w-0 gap-3">
    {children}
    <figcaption className={legendClass} aria-label={`Leyenda de ${ariaLabel}`}>
      {series.map((item) => <span className={legendItemClass} key={item.label}><i className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: item.color }} /><span className="min-w-0 truncate">{item.label}</span><strong className="text-[0.68rem] font-bold text-navy dark:text-[#d6e2f5]">{valueFormatter(Math.max(...item.values, 0))} máx.</strong></span>)}
    </figcaption>
  </figure>;
}

function ChartGrid({ margin, plotHeight, maximum, valueFormatter }: { margin: { top: number; left: number; right: number }; plotHeight: number; maximum: number; valueFormatter: (value: number) => string }) {
  return <>
    {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
      const y = margin.top + plotHeight - ratio * plotHeight;
      return <g key={ratio}>
        <line className="stroke-current opacity-20 [stroke-dasharray:3_5]" x1={margin.left} x2={CHART_WIDTH - margin.right} y1={y} y2={y} />
        <text className={axisLabelClass} data-role="axis-label" x={margin.left - 10} y={y + 4} textAnchor="end">{valueFormatter(maximum * ratio)}</text>
      </g>;
    })}
  </>;
}

function ChartXAxis({ labels, xAt, height, margin }: { labels: readonly string[]; xAt: (index: number) => number; height: number; margin: { bottom: number } }) {
  // Con muchos puntos las marcas se pisaban: se muestra una de cada `step` (como mucho 12 marcas).
  const step = Math.max(1, Math.ceil(labels.length / 12));
  return <>{labels.map((label, index) => index % step === 0 ? <text className={axisLabelClass} data-role="axis-label" key={`${label}-${index}`} x={xAt(index)} y={height - margin.bottom + 22} textAnchor="middle">{truncate(label, 12)}</text> : null)}</>;
}

/** El total va dentro del anillo (unos 120 px libres): achica la letra en vez de dejarlo pisar el trazo. */
export function donutTotalFontSize(text: string): number {
  return Math.max(10, Math.min(17, Math.floor(120 / (text.length * 0.62))));
}

function LegacyChartEmpty() {
  return <Muted className="grid min-h-48 place-items-center text-center">No hay datos suficientes para construir este gráfico.</Muted>;
}

function formatChartNumber(value: number): string {
  return chartNumber.format(value);
}

function truncate(value: string, maximum: number): string {
  return value.length > maximum ? `${value.slice(0, maximum - 1)}…` : value;
}
