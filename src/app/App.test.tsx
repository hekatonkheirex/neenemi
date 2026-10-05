import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import App from './App';
import SourceDataPanel from '../modules/consumibles/SourceDataPanel';

describe('Inicio de la suite', () => {
  it('incluye el visor global de archivos originales', () => {
    const markup = renderToStaticMarkup(<App />);

    expect(markup).toContain('Importaciones y archivos originales');
    expect(markup).toContain('Archivos y filas de origen');
    expect(markup).toContain('Una copia con datos y originales');
    expect(markup).toContain('Restaurar respaldo SQLite');
  });

  it('llama Inicio a la entrada de la barra lateral y pone el respaldo justo bajo las fichas', () => {
    const markup = renderToStaticMarkup(<App />);

    expect(markup).toContain('<span>Inicio</span>');
    expect(markup).not.toContain('<span>Resumen</span>');
    expect(markup).toContain('contratos en cartera');
    expect(markup).toContain('última carga aplicada');
    expect(markup).not.toContain('clientes en la base común');
    const cards = markup.indexOf('summary-grid');
    const recovery = markup.indexOf('Restaurar respaldo SQLite');
    expect(recovery).toBeGreaterThan(cards);
    expect(recovery).toBeLessThan(markup.indexOf('overview-panel'));
  });

  it('muestra en cada ficha de módulo el icono de la barra lateral y no su inicial', () => {
    const markup = renderToStaticMarkup(<App />);
    const symbols = [...markup.matchAll(/<span class="module-symbol"[^>]*>(.*?)<\/span>/g)].map(match => match[1]);
    expect(symbols.length).toBeGreaterThanOrEqual(13);
    expect(symbols.every(inner => inner.startsWith('<svg'))).toBe(true);
  });

  it('mantiene en Consumibles solo la carga coordinada de sus fuentes', () => {
    const markup = renderToStaticMarkup(createElement(SourceDataPanel, {
      onImportBundle: async () => {},
      onBundleFilesChange: () => {},
      onReindexSources: async () => { throw new Error('not called during render'); },
      onClearConsumables: async () => { throw new Error('not called during render'); },
      importing: false,
      bundleImporting: false,
      bundleFiles: {},
      bundleProgress: '',
      refreshKey: 0,
    }));

    expect(markup).toContain('Carga coordinada de las nueve fuentes');
    expect(markup).not.toContain('Importaciones y archivos originales');
  });
});
