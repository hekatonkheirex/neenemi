import { useEffect, useMemo, useRef, useState, type ChangeEvent, type KeyboardEvent } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import { Tick02Icon } from '@hugeicons/core-free-icons';
import { Input } from '../../core/ui/input';
import { Muted } from '../../core/ui/card';
import { canonicalMunicipality, searchParaguayMunicipalities } from './paraguay-municipalities';

type DestinationComboboxProps = {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
};

export function DestinationCombobox({ id = 'travel-destination', value, onChange, required = false }: DestinationComboboxProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const suggestions = useMemo(() => searchParaguayMunicipalities(value), [value]);
  const listboxId = `${id}-listbox`;

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setIsOpen(false);
    };
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, []);

  const chooseMunicipality = (municipality: string) => {
    onChange(municipality);
    setIsOpen(false);
    setHighlightedIndex(-1);
  };

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    onChange(event.target.value);
    setIsOpen(true);
    setHighlightedIndex(0);
  };

  const handleBlur = () => {
    const canonicalValue = canonicalMunicipality(value);
    if (canonicalValue && canonicalValue !== value) onChange(canonicalValue);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setIsOpen(true);
      if (suggestions.length > 0) setHighlightedIndex((current) => current < suggestions.length - 1 ? current + 1 : 0);
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setIsOpen(true);
      if (suggestions.length > 0) setHighlightedIndex((current) => current <= 0 ? suggestions.length - 1 : current - 1);
      return;
    }
    if (event.key === 'Enter' && isOpen && suggestions.length > 0) {
      event.preventDefault();
      chooseMunicipality(suggestions[highlightedIndex >= 0 ? highlightedIndex : 0]);
      return;
    }
    if (event.key === 'Escape') {
      setIsOpen(false);
      setHighlightedIndex(-1);
    }
  };

  return (
    <div ref={rootRef} className="relative grid min-w-0 gap-1.5">
      <Input
        id={id}
        name="destination"
        required={required}
        value={value}
        onChange={handleChange}
        onFocus={() => { setIsOpen(true); setHighlightedIndex(0); }}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        placeholder="Ciudad o municipio"
        autoComplete="off"
        role="combobox"
        aria-autocomplete="list"
        aria-controls={listboxId}
        aria-expanded={isOpen}
        aria-activedescendant={isOpen && highlightedIndex >= 0 ? `${listboxId}-${highlightedIndex}` : undefined}
      />
      {isOpen && (
        <div className="absolute inset-x-0 top-10 z-20 grid gap-1 rounded-xl border border-navy/15 bg-white p-1.5 shadow-md dark:border-sky/25 dark:bg-panel">
          {suggestions.length > 0 ? (
            <ul id={listboxId} role="listbox" className="m-0 grid max-h-56 list-none gap-0.5 overflow-y-auto p-0">
              {suggestions.map((municipality, index) => {
                const isHighlighted = index === highlightedIndex;
                const isSelected = canonicalMunicipality(value) === municipality;
                return (
                  <li
                    key={municipality}
                    id={`${listboxId}-${index}`}
                    role="option"
                    aria-selected={isSelected}
                    onMouseEnter={() => setHighlightedIndex(index)}
                    onMouseDown={(event) => { event.preventDefault(); chooseMunicipality(municipality); }}
                    className={`flex cursor-pointer items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-sm text-navy before:content-none dark:text-white ${isHighlighted ? 'bg-sky/15' : ''}`}
                  >
                    <span>{municipality}</span>
                    {isSelected && <HugeiconsIcon icon={Tick02Icon} size={14} strokeWidth={2.5} aria-hidden="true" />}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p role="status" className="m-0 px-2.5 py-1.5 text-sm text-ink-2 dark:text-[#d6e2f5]">No encontré ese municipio. Podés mantener el destino escrito manualmente.</p>
          )}
          <Muted className="px-2.5 pb-1">{suggestions.length} {suggestions.length === 1 ? 'coincidencia' : 'municipios'} · búsqueda sin acentos</Muted>
        </div>
      )}
      <Muted>Seleccioná un municipio o escribí un destino personalizado.</Muted>
    </div>
  );
}
