import { cn } from '../cn';
import { BusySpinner } from '../ActionButtons';

type StatusState = 'ready' | 'pending' | 'error';

const dot = { ready: 'bg-[#2f8f5b]', error: 'bg-[#d92d20]' };

/** Región en vivo: spinner durante la carga y punto de color al terminar. */
export function StatusLine({ state, children }: { state: StatusState; children: React.ReactNode }) {
  return (
    <div role={state === 'error' ? 'alert' : 'status'} aria-live={state === 'error' ? 'assertive' : 'polite'} className="my-4 flex items-center gap-2.5 text-sm text-ink-2 dark:text-[#b4c3dc]">
      {state === 'pending' ? <BusySpinner /> : <div aria-hidden="true" className={cn('size-2.5 shrink-0 rounded-full', dot[state])} />}
      <div>{children}</div>
    </div>
  );
}
