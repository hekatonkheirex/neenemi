import { cva, type VariantProps } from 'class-variance-authority';
import type { HTMLAttributes } from 'react';
import { cn } from '../cn';

// Los colores de texto llevan "!" por el CSS heredado de <span> en el tema claro (ver table.tsx).
const badgeVariants = cva('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold', {
  variants: {
    tone: {
      neutral: 'bg-navy/10 text-navy! dark:bg-white/10 dark:text-white!',
      success: 'bg-[#2f8f5b]/15 text-[#14532d]! dark:text-[#9be3b9]!',
      warning: 'bg-[#e08a00]/15 text-[#7a4a00]! dark:text-[#ffd28a]!',
      danger: 'bg-[#d92d20]/15 text-[#912018]! dark:text-[#ffb4ab]!',
    },
  },
  defaultVariants: { tone: 'neutral' },
});

export type BadgeTone = NonNullable<VariantProps<typeof badgeVariants>['tone']>;

export function Badge({ className, tone, ...props }: HTMLAttributes<HTMLDivElement> & VariantProps<typeof badgeVariants>) {
  return <div className={cn(badgeVariants({ tone }), className)} {...props} />;
}
