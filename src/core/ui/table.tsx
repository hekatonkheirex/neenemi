import type { HTMLAttributes, TdHTMLAttributes, ThHTMLAttributes } from 'react';
import { cn } from '../cn';

// Primitivas shadcn/ui de tabla con tokens de marca. Los colores de texto de <th>/<td> llevan "!" (important) porque el CSS
// heredado del tema claro (theme/01-mantenimiento.css) los fija con más especificidad; quitar al borrar ese CSS.

export function Table({ className, wrapperClassName, ...props }: HTMLAttributes<HTMLTableElement> & { wrapperClassName?: string }) {
  return (
    <div className={cn('overflow-auto rounded-xl border border-navy/10 dark:border-sky/20', wrapperClassName)}>
      <table className={cn('w-full caption-bottom border-collapse text-sm', className)} {...props} />
    </div>
  );
}

export const TableHeader = ({ className, ...props }: HTMLAttributes<HTMLTableSectionElement>) => (
  <thead className={cn('sticky top-0 bg-paper dark:bg-[#13233f]', className)} {...props} />
);

export const TableBody = (props: HTMLAttributes<HTMLTableSectionElement>) => <tbody {...props} />;

export const TableRow = ({ className, ...props }: HTMLAttributes<HTMLTableRowElement>) => (
  <tr className={cn('border-b border-navy/10 last:border-0 hover:bg-sky/5 dark:border-sky/15', className)} {...props} />
);

export const TableHead = ({ className, ...props }: ThHTMLAttributes<HTMLTableCellElement>) => (
  <th
    className={cn('whitespace-nowrap px-3 py-2 text-left text-xs font-bold text-navy! dark:text-white!', className)}
    {...props}
  />
);

export const TableCell = ({ className, ...props }: TdHTMLAttributes<HTMLTableCellElement>) => (
  <td className={cn('px-3 py-2 align-top text-ink-2! dark:text-[#d6e2f5]!', className)} {...props} />
);
