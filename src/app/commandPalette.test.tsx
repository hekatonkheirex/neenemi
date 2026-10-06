import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import App from './App';
import CommandPalette from './CommandPalette';
import { buildPaletteEntries, filterPaletteEntries } from './commandPaletteModel';
import { suiteModules } from './modules';

const labels = { 'servicio técnico': 'Servicio Técnico', administrativo: 'Administrativo', software: 'Software', herramientas: 'Herramientas' } as const;
const entries = buildPaletteEntries(suiteModules, labels);

describe('filterPaletteEntries', () => {
  it('sin consulta devuelve Inicio y todos los módulos', () => {
    expect(filterPaletteEntries(entries, '')).toHaveLength(suiteModules.length + 1);
    expect(entries[0]).toMatchObject({ id: null, label: 'Inicio' });
  });

  it('ignora acentos y mayúsculas', () => {
    const ids = filterPaletteEntries(entries, 'VIATICOS').map((e) => e.id);
    expect(ids).toContain('viaticos');
  });

  it('pone primero los que empiezan con la consulta', () => {
    const result = filterPaletteEntries(entries, 'c').map((e) => e.label.toLowerCase());
    const firstNonStart = result.findIndex((label) => !label.startsWith('c'));
    expect(result.slice(firstNonStart === -1 ? result.length : firstNonStart).some((l) => l.startsWith('c'))).toBe(false);
  });

  it('busca también por sección y devuelve vacío si no hay coincidencia', () => {
    expect(filterPaletteEntries(entries, 'administrativo').length).toBeGreaterThan(0);
    expect(filterPaletteEntries(entries, 'zzzz')).toEqual([]);
  });
});

describe('CommandPalette', () => {
  it('expone combobox + listbox accesibles', () => {
    const markup = renderToStaticMarkup(<CommandPalette entries={entries} onSelect={() => {}} onClose={() => {}} />);
    expect(markup).toContain('role="combobox"');
    expect(markup).toContain('role="listbox"');
    expect(markup).toContain('aria-selected="true"');
    expect(markup).toContain('Gestor de mantenimiento');
  });
});

describe('Inicio', () => {
  const markup = renderToStaticMarkup(<App />);

  it('ofrece la paleta en la barra superior', () => {
    expect(markup).toContain('aria-keyshortcuts="Control+K Meta+K"');
  });

  it('muestra Limpiar cargas una sola vez, dentro del panel de respaldo, sin el panel Base compartida', () => {
    expect(markup.match(/Limpiar cargas/g)).toHaveLength(1);
    expect(markup).not.toContain('Base compartida');
    const clear = markup.indexOf('Limpiar cargas');
    expect(clear).toBeGreaterThan(markup.indexOf('aria-label="Respaldo y recuperación de la base"'));
    expect(clear).toBeLessThan(markup.indexOf('Archivos y filas de origen'));
    expect(markup.slice(0, markup.indexOf('</header>'))).not.toContain('Limpiar cargas');
  });
});
