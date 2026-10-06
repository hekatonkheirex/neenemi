import { useEffect, useMemo, useRef, useState, type ChangeEvent, type KeyboardEvent } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import { Tick02Icon } from '@hugeicons/core-free-icons';
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
    <div ref={rootRef} className="destination-combobox">
      <input
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
        <div className="destination-combobox-menu">
          {suggestions.length > 0 ? (
            <ul id={listboxId} role="listbox">
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
                    className={isHighlighted ? 'highlighted' : undefined}
                  >
                    <span>{municipality}</span>
                    {isSelected && <HugeiconsIcon icon={Tick02Icon} size={14} strokeWidth={2.5} aria-hidden="true" />}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p role="status">No encontré ese municipio. Podés mantener el destino escrito manualmente.</p>
          )}
          <small>{suggestions.length} {suggestions.length === 1 ? 'coincidencia' : 'municipios'} · búsqueda sin acentos</small>
        </div>
      )}
      <small className="destination-combobox-hint">Seleccioná un municipio o escribí un destino personalizado.</small>
    </div>
  );
}
