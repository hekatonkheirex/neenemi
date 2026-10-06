import { cn } from '../cn';

type StatusState = 'ready' | 'pending' | 'error';

const dot: Record<StatusState, string> = { ready: 'bg-[#2f8f5b]', pending: 'bg-[#e08a00]', error: 'bg-[#d92d20]' };

/** Línea de estado del módulo (región en vivo): punto de color + mensaje. */
export function StatusLine({ state, children }: { state: StatusState; children: React.ReactNode }) {
  return (
    <div aria-live="polite" className="my-4 flex items-center gap-2.5 text-sm text-ink-2 dark:text-[#b4c3dc]">
      <div aria-hidden="true" className={cn('size-2.5 shrink-0 rounded-full', dot[state])} />
      <div>{children}</div>
    </div>
  );
}
