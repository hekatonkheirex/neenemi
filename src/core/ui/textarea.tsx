import type { TextareaHTMLAttributes } from 'react';
import { cn } from '../cn';

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        'w-full rounded-xl border border-navy/20 bg-white px-3 py-2.5 text-sm leading-relaxed text-navy placeholder:text-ink-2 ' +
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky ' +
          'dark:border-sky/30 dark:bg-navy/50 dark:text-white dark:placeholder:text-[#8fa5c7]',
        className,
      )}
      {...props}
    />
  );
}
