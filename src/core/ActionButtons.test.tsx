import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ExportButton, UploadButton } from './ActionButtons';

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.tsx$/.test(entry.name) && !/\.test\.tsx$/.test(entry.name) ? [path] : [];
  });
}

describe('UploadButton', () => {
  it('es un label con el icono, el texto y el input transparente (accesible por nombre)', () => {
    const html = renderToStaticMarkup(<UploadButton label="Importar planilla" accept=".xlsx" onChange={() => {}} />);
    expect(html).toContain('class="secondary-button upload-button"');
    expect(html).toContain('<svg');
    expect(html).toContain('Importar planilla');
    expect(html).toContain('type="file"');
    expect(html).toContain('accept=".xlsx"');
    expect(html).not.toContain('disabled');
  });

  it('ocupado: muestra el texto de espera y deshabilita el input', () => {
    const html = renderToStaticMarkup(<UploadButton busy label="Importar" accept=".xlsx" onChange={() => {}} />);
    expect(html).toContain('Importando…');
    expect(html).toContain('is-disabled');
    expect(html).toMatch(/<input[^>]*disabled/);
  });

  it('pasa aria-label, id, name y multiple al input', () => {
    const html = renderToStaticMarkup(<UploadButton label="x" accept=".csv" multiple id="f" name="g" aria-label="1. Informes" onChange={() => {}} />);
    expect(html).toMatch(/<input[^>]*aria-label="1. Informes"/);
    expect(html).toMatch(/<input[^>]*id="f"/);
    expect(html).toMatch(/<input[^>]*name="g"/);
    expect(html).toMatch(/<input[^>]*multiple/);
  });
});

describe('ExportButton', () => {
  it('es un button type=button con el icono de descarga', () => {
    const html = renderToStaticMarkup(<ExportButton onClick={() => {}}>Exportar XLSX</ExportButton>);
    expect(html).toContain('type="button"');
    expect(html).toContain('secondary-button export-button');
    expect(html).toContain('Exportar XLSX');
    expect(html).toContain('<svg');
  });

  it('ocupado: cambia el texto, se deshabilita y marca aria-busy', () => {
    const html = renderToStaticMarkup(<ExportButton busy onClick={() => {}}>Exportar XLSX</ExportButton>);
    expect(html).toContain('Exportando…');
    expect(html).toContain('disabled');
    expect(html).toContain('aria-busy="true"');
  });
});

describe('normalizacion de botones de carga y exportacion', () => {
  const files = sourceFiles('src');

  it('ningun modulo declara <input type="file"> propio, salvo las zonas de arrastre', () => {
    // Zonas de arrastre (area completa clicable) y el input oculto que dispara un boton propio.
    const dropzones = [
      'src/app/DatabaseRecoveryPanel.tsx',
      'src/modules/cobertura/CoberturaModule.tsx',
      'src/modules/ventas/OpenContractImportPanel.tsx',
      'src/modules/ventas/SalesCatalogImportPanel.tsx',
      'src/modules/ventas/ServiceReportImportPanel.tsx',
    ];
    const offenders = files.filter((file) => file !== 'src/core/ActionButtons.tsx' && !dropzones.includes(file)
      && /type="file"/.test(readFileSync(file, 'utf8')));
    expect(offenders).toEqual([]);
  });

  it('los botones que dicen Exportar o Descargar usan ExportButton', () => {
    const offenders = files.flatMap((file) => {
      const text = readFileSync(file, 'utf8');
      return [...text.matchAll(/<button\b((?:=>|[^>])*)>\s*([^<]*)/g)]
        .filter(([, attrs, label]) => /className="[^"]*(?:primary|secondary)-button/.test(attrs) && /Exportar|Descargar/.test(label))
        .map(() => file);
    });
    expect(offenders).toEqual([]);
  });

  it('los enlaces con download usan export-button (o son enlaces de texto / CTA propio)', () => {
    const allowed = /export-button|text-button|database-backup-cta/;
    const offenders = files.flatMap((file) => {
      const text = readFileSync(file, 'utf8');
      return [...text.matchAll(/<a\b((?:=>|[^>])*)>/g)]
        .filter(([, attrs]) => /\bdownload\b/.test(attrs) && /className=/.test(attrs) && !allowed.test(attrs))
        .map(() => file);
    });
    expect(offenders).toEqual([]);
  });

  it('los botones que abren un dialogo de carga usan UploadTriggerButton', () => {
    const offenders = files.flatMap((file) => {
      const text = readFileSync(file, 'utf8');
      return [...text.matchAll(/<button\b((?:=>|[^>])*)>\s*([^<]*)/g)]
        .filter(([, attrs, label]) => /className="[^"]*secondary-button/.test(attrs) && !/upload-button/.test(attrs) && /^\{?[^}]*\b(?:Importar|Cargar|Seleccionar) (?:contrato|informe|archivo|PDF|XLSX)/.test(label))
        .map(() => file);
    });
    expect(offenders).toEqual([]);
  });
});
