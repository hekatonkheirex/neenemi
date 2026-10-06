import type { PageRequest } from './pagination';
import { Button } from './ui/button';

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
    <nav className="flex flex-wrap items-center justify-between gap-3 text-sm text-ink-2 dark:text-[#d6e2f5]" aria-label={label}>
      <div aria-live="polite">{firstRow}–{lastRow} de {total.toLocaleString('es-PY')}</div>
      <label className="flex items-center gap-2 text-xs font-semibold">
        Filas
        <select
          className="h-8 rounded-xl border border-navy/20 bg-white px-2 text-xs text-navy focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky disabled:opacity-50 dark:border-sky/30 dark:bg-navy/50 dark:text-white"
          value={pageSize}
          onChange={(event) => onPageSizeChange(Number(event.target.value))}
          disabled={disabled}
        >
          {pageSizeOptions.map((size) => <option key={size} value={size}>{size}</option>)}
        </select>
      </label>
      <div>{totalPages === 0 ? 'Sin páginas' : `Página ${page} de ${totalPages}`}</div>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={() => onPageChange(page - 1)} disabled={disabled || page <= 1}>Anterior</Button>
        <Button variant="outline" size="sm" onClick={() => onPageChange(page + 1)} disabled={disabled || page >= totalPages}>Siguiente</Button>
      </div>
    </nav>
  );
}
