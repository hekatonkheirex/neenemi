import { cva, type VariantProps } from 'class-variance-authority';
import type { HTMLAttributes } from 'react';
import { cn } from '../cn';

// Los colores de texto llevan "!" por el CSS heredado de <span> en el tema claro (ver table.tsx).
const badgeVariants = cva('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold', {
  variants: {
    tone: {
      neutral: 'bg-navy/10 text-navy! dark:bg-white/10 dark:text-white!',
      success: 'bg-status-ok/15 text-status-ok-ink! dark:text-status-ok-ink-dark!',
      warning: 'bg-status-warn/15 text-status-warn-ink! dark:text-status-warn-ink-dark!',
      danger: 'bg-status-danger/15 text-status-danger-ink! dark:text-status-danger-ink-dark!',
    },
  },
  defaultVariants: { tone: 'neutral' },
});

export type BadgeTone = NonNullable<VariantProps<typeof badgeVariants>['tone']>;

export function Badge({ className, tone, ...props }: HTMLAttributes<HTMLDivElement> & VariantProps<typeof badgeVariants>) {
  return <div className={cn(badgeVariants({ tone }), className)} {...props} />;
}
