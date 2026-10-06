import { useEffect, useRef, useState } from 'react';
import { cn } from '../core/cn';
import { dialogPanel } from '../core/dialog';
import { filterPaletteEntries, type PaletteEntry } from './commandPaletteModel';

type Props = { entries: readonly PaletteEntry[]; onSelect: (id: string | null) => void; onClose: () => void };

/** Se monta solo mientras está abierta: el estado se reinicia en cada apertura. */
export default function CommandPalette({ entries, onSelect, onClose }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const results = filterPaletteEntries(entries, query);
  const index = Math.min(active, Math.max(results.length - 1, 0));

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      setActive((index + step + results.length) % Math.max(results.length, 1));
    } else if (event.key === 'Enter' && results[index]) {
      event.preventDefault();
      onSelect(results[index].id);
    }
  }

  return (
    <dialog
      ref={ref}
      className={cn(dialogPanel, 'mt-[12vh] mb-auto w-[min(32rem,calc(100vw-2rem))] p-2.5')}
      aria-label="Ir a un módulo"
      onCancel={(event) => { event.preventDefault(); onClose(); }}
      onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
    >
      <input
        className="w-full rounded-xl border border-navy/20 bg-paper px-3 py-2.5 text-sm text-navy placeholder:text-ink-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky dark:border-sky/30 dark:bg-navy/60 dark:text-white dark:placeholder:text-[#8fa5c7]"
        role="combobox"
        aria-expanded="true"
        aria-controls="command-palette-list"
        aria-activedescendant={results[index] ? `command-palette-${index}` : undefined}
        aria-label="Buscar módulo"
        placeholder="Ir a un módulo…"
        autoFocus
        value={query}
        onChange={(event) => { setQuery(event.target.value); setActive(0); }}
        onKeyDown={onKeyDown}
      />
      {/* ponytail: <div> y no <ul>/<li>/<span>/<small>: el CSS heredado del tema claro les pone color con más especificidad. */}
      <div id="command-palette-list" className="mt-2 max-h-80 overflow-y-auto" role="listbox" aria-label="Módulos">
        {results.map((entry, i) => (
          <div
            key={entry.id ?? 'resumen'}
            id={`command-palette-${i}`}
            role="option"
            aria-selected={i === index}
            className={cn(
              'flex cursor-pointer items-baseline justify-between gap-4 rounded-xl px-3 py-2 text-sm text-navy dark:text-white',
              i === index && 'bg-sky/15 shadow-[inset_3px_0_0_var(--color-sky)]',
            )}
            // Chromium emite mousemove sintéticos (movement 0) al cambiar el layout; no deben robar la selección del teclado.
            onMouseMove={(event) => { if (event.movementX || event.movementY) setActive(i); }}
            onClick={() => onSelect(entry.id)}
          >
            <div>{entry.label}</div>
            <div className="text-xs text-ink-2 dark:text-[#8fa5c7]">{entry.hint}</div>
          </div>
        ))}
        {results.length === 0 ? <div className="px-3 py-2 text-sm text-ink-2 dark:text-[#8fa5c7]">Sin resultados para “{query}”.</div> : null}
      </div>
    </dialog>
  );
}
