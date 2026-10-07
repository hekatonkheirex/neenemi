import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import SourceDataPanel from '../modules/consumibles/SourceDataPanel';

describe('Inicio de la suite', () => {

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
