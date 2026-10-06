import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import changelogSource from '../../CHANGELOG.md?raw';
import { parseChangelog } from '../core/changelog';
import { cn } from '../core/cn';
import { dialogPanel } from '../core/dialog';
import { Button } from '../core/ui/button';

const entries = parseChangelog(changelogSource);

/** Backtick spans become <code>; everything else stays plain text. */
function renderText(text: string) {
  return text.split('`').map((part, index) => (
    index % 2 ? <code key={index} className="rounded-md bg-paper px-1 py-0.5 text-[0.78rem] text-navy dark:bg-navy dark:text-white">{part}</code> : part
  ));
}

export default function ChangelogDialog({ currentVersion, onClose }: { currentVersion: string; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      className={cn(dialogPanel, 'w-[min(42rem,calc(100vw-2rem))]')}
      aria-labelledby="changelog-title"
      // Esc dispara "cancel": se cierra por el padre, que desmonta el diálogo.
      onCancel={(event) => { event.preventDefault(); onClose(); }}
      onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
    >
      <div className="flex max-h-[min(44rem,calc(100vh-2rem))] flex-col">
        <div className="flex items-start justify-between gap-4 border-b border-navy/10 px-5 py-4 dark:border-sky/20">
          <div>
            <div className="eyebrow">DCSS SUITE</div>
            <h2 id="changelog-title" className="text-xl font-bold tracking-tight text-navy dark:text-white">Historial de cambios</h2>
          </div>
          <Button variant="ghost" size="icon" className="size-8" autoFocus onClick={onClose} aria-label="Cerrar historial">
            <X aria-hidden="true" />
          </Button>
        </div>
        <ol className="m-0 list-none overflow-y-auto px-5 pb-4">
          {entries.map((entry) => {
            const current = entry.version === currentVersion;
            return (
              <li key={entry.version} className={cn('border-b border-navy/10 py-3.5 before:content-none last:border-0 dark:border-sky/15', current && 'mt-2 -mx-3 rounded-xl border-0 bg-sky/10 px-3')}>
                <div className="mb-1 flex items-center gap-2.5 text-sm">
                  <div className="font-bold text-navy dark:text-white">v{entry.version}</div>
                  {current && <div className="rounded-md bg-[#176b45] px-2 py-0.5 text-xs font-bold tracking-wide text-white">Instalada</div>}
                  <time dateTime={entry.date} className="ml-auto text-xs tabular-nums text-ink-2 dark:text-[#9fb2d1]">{entry.date}</time>
                </div>
                <div className="text-sm leading-relaxed break-words text-ink-2 dark:text-[#c3d1e8]">{renderText(entry.text)}</div>
              </li>
            );
          })}
          {!entries.length && <li><div className="py-3.5 text-sm text-ink-2 dark:text-[#c3d1e8]">Sin historial disponible.</div></li>}
        </ol>
      </div>
    </dialog>
  );
}
