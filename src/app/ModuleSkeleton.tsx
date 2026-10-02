/** Fallback de Suspense: reserva el layout de un módulo (título, tarjetas, tabla) para evitar el salto al cargar. */
export default function ModuleSkeleton() {
  return (
    <div className="page-content module-skeleton" role="status" aria-busy="true">
      <span className="visually-hidden">Cargando módulo…</span>
      <div className="skeleton-block skeleton-eyebrow" aria-hidden="true" />
      <div className="skeleton-block skeleton-title" aria-hidden="true" />
      <div className="skeleton-cards" aria-hidden="true">
        <div className="skeleton-block" />
        <div className="skeleton-block" />
        <div className="skeleton-block" />
      </div>
      <div className="skeleton-block skeleton-table" aria-hidden="true" />
    </div>
  );
}
