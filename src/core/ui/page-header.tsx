import type { ReactNode } from 'react';
import { Eyebrow } from './card';

/** Cabecera de módulo: eyebrow, título, descripción y acciones. El tamaño del h1 lo fija `.page-content h1` (theme/22-datasys-redesign.css). */
export function PageHeader({ eyebrow, title, lead, actions }: { eyebrow: string; title: string; lead?: string; actions?: ReactNode }) {
  return (
    <section className="flex flex-wrap items-end justify-between gap-4 print:block">
      <div className="min-w-0 max-w-3xl">
        <Eyebrow className="mb-4">{eyebrow}</Eyebrow>
        <h1>{title}</h1>
        {lead ? <div className="lead text-base leading-relaxed text-ink-2 dark:text-[#b4c3dc]">{lead}</div> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2 print:hidden">{actions}</div> : null}
    </section>
  );
}
