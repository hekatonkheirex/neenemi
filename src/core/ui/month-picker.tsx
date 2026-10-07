import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { cn } from '../cn';

const MONTHS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const FULL_MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const VALUE = /^(\d{4})-(0[1-9]|1[0-2])$/;

/** "2026-10" -> "octubre 2026"; vacío o inválido -> "". */
export function formatMonth(value: string): string {
  const match = VALUE.exec(value);
  return match ? `${FULL_MONTHS[Number(match[2]) - 1]} ${match[1]}` : '';
}

export function monthValue(year: number, monthIndex: number): string {
  return `${String(year).padStart(4, '0')}-${String(monthIndex + 1).padStart(2, '0')}`;
}

type MonthPickerProps = { value: string; onChange: (value: string) => void; placeholder?: string; label?: string; className?: string };

/** Selector de mes (valor "AAAA-MM") que reemplaza a <input type="month">, cuyo calendario nativo no admite estilos. */
export function MonthPicker({ value, onChange, placeholder = 'Todos', label, className }: MonthPickerProps) {
  const today = new Date();
  const selected = VALUE.exec(value);
  const [open, setOpen] = useState(false);
  const [year, setYear] = useState(selected ? Number(selected[1]) : today.getFullYear());
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return undefined;
    const close = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent ? event.key === 'Escape' : !root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);

  const pick = (next: string) => {
    onChange(next);
    setOpen(false);
  };
  const navButton = 'grid size-8 place-items-center rounded-lg text-navy hover:bg-sky/15 dark:text-white';
  const selectedYear = selected ? Number(selected[1]) : null;
  const selectedMonth = selected ? Number(selected[2]) - 1 : null;

  return (
    <div ref={root} className={cn('relative', className)}>
      <button
        type="button"
        aria-label={label ? `${label}: ${formatMonth(value) || placeholder}` : undefined}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => {
          setYear(selectedYear ?? today.getFullYear());
          setOpen(!open);
        }}
        className={
          'flex h-10 w-full items-center justify-between gap-2 rounded-xl border border-navy/20 bg-white px-3 text-left text-sm capitalize text-navy ' +
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky dark:border-sky/30 dark:bg-navy/50 dark:text-white'
        }
      >
        <span className={cn(!selected && 'normal-case text-ink-2 dark:text-[#8fa5c7]')}>{formatMonth(value) || placeholder}</span>
        <Calendar aria-hidden="true" className="size-4 shrink-0 text-sky" />
      </button>
      {open && (
        <div
          role="dialog"
          aria-label="Elegir mes"
          className="absolute left-0 top-full z-30 mt-2 w-64 rounded-2xl border border-navy/15 bg-white p-3 shadow-xl dark:border-sky/30 dark:bg-navy"
        >
          <div className="mb-2 flex items-center justify-between">
            <button type="button" aria-label="Año anterior" className={navButton} onClick={() => setYear(year - 1)}><ChevronLeft className="size-4" /></button>
            <span className="text-sm font-bold text-navy dark:text-white">{year}</span>
            <button type="button" aria-label="Año siguiente" className={navButton} onClick={() => setYear(year + 1)}><ChevronRight className="size-4" /></button>
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            {MONTHS.map((label, index) => {
              const isSelected = selectedYear === year && selectedMonth === index;
              const isNow = today.getFullYear() === year && today.getMonth() === index;
              return (
                <button
                  key={label}
                  type="button"
                  aria-pressed={isSelected}
                  onClick={() => pick(monthValue(year, index))}
                  className={cn(
                    'h-9 rounded-lg text-sm font-semibold transition-colors',
                    isSelected ? 'bg-brand text-navy' : 'text-navy hover:bg-sky/15 dark:text-white',
                    isNow && !isSelected && 'ring-1 ring-sky',
                  )}
                >
                  {label}
                </button>
              );
            })}
          </div>
          <div className="mt-2 flex justify-between border-t border-navy/10 pt-2 text-xs font-semibold dark:border-sky/20">
            <button type="button" className="rounded px-2 py-1 text-[#00587a] hover:bg-sky/10 dark:text-[#8bd6f2]" onClick={() => pick('')}>Limpiar</button>
            <button type="button" className="rounded px-2 py-1 text-[#00587a] hover:bg-sky/10 dark:text-[#8bd6f2]" onClick={() => pick(monthValue(today.getFullYear(), today.getMonth()))}>Este mes</button>
          </div>
        </div>
      )}
    </div>
  );
}
