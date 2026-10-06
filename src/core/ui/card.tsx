import type { ElementType, HTMLAttributes, ReactNode } from 'react';
import { cn } from '../cn';

// Primitivas shadcn/ui de tarjeta con tokens de marca. Los títulos y textos van en <div>/<h*>: el CSS heredado del tema claro
// (theme/01-mantenimiento.css) colorea <p>/<span>/<strong> con más especificidad que las utilidades.

export function Card({ as: Comp = 'section', className, ...props }: HTMLAttributes<HTMLElement> & { as?: ElementType; open?: boolean }) {
  return <Comp className={cn('grid gap-4 rounded-2xl border border-navy/10 bg-white p-5 shadow-md dark:border-sky/20 dark:bg-panel', className)} {...props} />;
}

export function Eyebrow({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('text-[0.7rem] font-extrabold uppercase tracking-[0.14em] text-[#00698f] dark:text-sky', className)} {...props} />;
}

export function CardHeader({ eyebrow, title, aside, className }: { eyebrow?: string; title: ReactNode; aside?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-wrap items-start justify-between gap-3', className)}>
      <div className="min-w-0">
        {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
        <h2 className="text-lg font-bold leading-tight text-navy dark:text-white">{title}</h2>
      </div>
      {aside}
    </div>
  );
}

/** Texto secundario (notas, ayudas). */
export function Muted({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('text-xs text-ink-2 dark:text-[#9fb2d1]', className)} {...props} />;
}
