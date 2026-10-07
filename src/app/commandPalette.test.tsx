import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import App from './App';
import CommandPalette from './CommandPalette';
import { buildPaletteEntries, filterPaletteEntries } from './commandPaletteModel';
import { suiteModules } from './modules';

const labels = { 'servicio técnico': 'Servicio Técnico', administrativo: 'Administrativo', software: 'Software', herramientas: 'Herramientas' } as const;
const entries = buildPaletteEntries(suiteModules, labels);

describe('filterPaletteEntries', () => {

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

  it('encuentra Configuración por las tareas de datos y respaldos', () => {
    expect(filterPaletteEntries(entries, 'respaldos').map(entry => entry.id)).toEqual(['configuracion']);
    expect(filterPaletteEntries(entries, 'originales').map(entry => entry.id)).toEqual(['configuracion']);
    expect(filterPaletteEntries(entries, 'CONFIGURACION').map(entry => entry.id)).toEqual(['configuracion']);
  });
});

describe('CommandPalette', () => {
  it('expone combobox + listbox accesibles', () => {
    const markup = renderToStaticMarkup(<CommandPalette entries={entries} onSelect={() => {}} onClose={() => {}} />);
    expect(markup).toContain('role="combobox"');
    expect(markup).toContain('role="listbox"');
    expect(markup).toContain('aria-selected="true"');
    expect(markup).toContain('Gestor de mantenimiento');
    expect(markup).toMatch(/<dialog[^>]*aria-label="Ir a un módulo"/);
    expect(markup).toContain('backdrop:backdrop-blur-sm');
    expect(markup).not.toMatch(/class="[^"]*command-palette/);
  });
});

describe('Inicio', () => {
  const markup = renderToStaticMarkup(<App />);

  it('ofrece la paleta en la barra superior', () => {
    expect(markup).toContain('aria-keyshortcuts="Control+K Meta+K"');
  });

});
