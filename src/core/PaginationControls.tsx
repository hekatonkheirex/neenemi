import type { PageRequest } from './pagination';

type PaginationControlsProps = PageRequest & {
  total: number;
  label?: string;
  disabled?: boolean;
  pageSizeOptions?: readonly number[];
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
};

export default function PaginationControls({
  page,
  pageSize,
  total,
  label = 'Paginación de registros',
  disabled = false,
  pageSizeOptions = [25, 50, 100],
  onPageChange,
  onPageSizeChange,
}: PaginationControlsProps) {
  const totalPages = Math.ceil(total / pageSize);
  const firstRow = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const lastRow = Math.min(page * pageSize, total);

  return (
    <nav className="pagination-controls" aria-label={label}>
      <span className="pagination-count" aria-live="polite">{firstRow}–{lastRow} de {total.toLocaleString('es-PY')}</span>
      <label className="pagination-size">
        <span>Filas</span>
        <select value={pageSize} onChange={(event) => onPageSizeChange(Number(event.target.value))} disabled={disabled}>
          {pageSizeOptions.map((size) => <option key={size} value={size}>{size}</option>)}
        </select>
      </label>
      <span className="pagination-page">{totalPages === 0 ? 'Sin páginas' : `Página ${page} de ${totalPages}`}</span>
      <div className="pagination-actions">
        <button className="secondary-button" type="button" onClick={() => onPageChange(page - 1)} disabled={disabled || page <= 1}>
          Anterior
        </button>
        <button className="secondary-button" type="button" onClick={() => onPageChange(page + 1)} disabled={disabled || page >= totalPages}>
          Siguiente
        </button>
      </div>
    </nav>
  );
}
