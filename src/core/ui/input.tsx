import type { ComponentProps } from 'react';
import { cn } from '../cn';

export function Input({ className, ...props }: ComponentProps<'input'>) {
  return (
    <input
      className={cn(
        'h-10 w-full rounded-xl border border-navy/20 bg-white px-3 text-sm text-navy placeholder:text-ink-2 ' +
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky disabled:opacity-50 ' +
          'dark:border-sky/30 dark:bg-navy/50 dark:text-white dark:placeholder:text-[#8fa5c7]',
        className,
      )}
      {...props}
    />
  );
}
