import type { SourceDetail } from './source-details';

export default function SourceDetails({ details }: { details: readonly SourceDetail[] }) {
  if (details.length === 0) return null;

  return (
    <details className="source-details">
      <summary>Ver datos del origen ({details.length})</summary>
      <div className="source-details-grid">
        {details.map((detail) => (
          <div className="source-detail-item" key={`${detail.label}:${detail.value}`}>
            <span>{detail.label}</span>
            <strong>{detail.value}</strong>
          </div>
        ))}
      </div>
    </details>
  );
}
