import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import App from './App';
import SourceDataPanel from '../modules/consumibles/SourceDataPanel';

describe('Resumen de la suite', () => {
  it('incluye el visor global de archivos originales', () => {
    const markup = renderToStaticMarkup(<App />);

    expect(markup).toContain('Importaciones y archivos originales');
    expect(markup).toContain('Archivos y filas de origen');
    expect(markup).toContain('Una copia con datos y originales');
    expect(markup).toContain('Restaurar respaldo SQLite');
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
