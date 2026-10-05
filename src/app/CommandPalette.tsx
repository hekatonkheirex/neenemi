import { useEffect, useRef, useState } from 'react';
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
      className="command-palette"
      aria-label="Ir a un módulo"
      onCancel={(event) => { event.preventDefault(); onClose(); }}
      onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
    >
      <input
        className="command-palette-input"
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
      <ul id="command-palette-list" className="command-palette-list" role="listbox" aria-label="Módulos">
        {results.map((entry, i) => (
          <li
            key={entry.id ?? 'resumen'}
            id={`command-palette-${i}`}
            role="option"
            aria-selected={i === index}
            className={i === index ? 'active' : undefined}
            // Chromium emite mousemove sintéticos (movement 0) al cambiar el layout; no deben robar la selección del teclado.
            onMouseMove={(event) => { if (event.movementX || event.movementY) setActive(i); }}
            onClick={() => onSelect(entry.id)}
          >
            <span>{entry.label}</span>
            <small>{entry.hint}</small>
          </li>
        ))}
        {results.length === 0 ? <li className="command-palette-empty" role="presentation">Sin resultados para “{query}”.</li> : null}
      </ul>
    </dialog>
  );
}
