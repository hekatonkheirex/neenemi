import type { SourceDetail } from './source-details';

export default function SourceDetails({ details }: { details: readonly SourceDetail[] }) {
  if (details.length === 0) return null;

  return (
    <details className="source-details mt-2 text-xs">
      <summary className="cursor-pointer font-semibold text-[#00587a] focus-visible:outline-2 focus-visible:outline-sky dark:text-[#8bd6f2]">Ver datos del origen ({details.length})</summary>
      {/* El detalle con cientos de series no crece sin límite: tope de 22 rem con scroll. */}
      <div className="source-details-grid mt-2 grid max-h-[22rem] grid-cols-[repeat(auto-fill,minmax(min(100%,11rem),1fr))] gap-2 overflow-y-auto">
        {details.map((detail) => (
          <div className="grid min-w-0 gap-0.5 rounded-lg border border-navy/10 bg-paper p-2 [overflow-wrap:anywhere] dark:border-sky/20 dark:bg-navy/30" key={`${detail.label}:${detail.value}`}>
            <div className="text-ink-2 dark:text-[#9fb2d1]">{detail.label}</div>
            <div className="font-semibold text-navy dark:text-white">{detail.value}</div>
          </div>
        ))}
      </div>
    </details>
  );
}
