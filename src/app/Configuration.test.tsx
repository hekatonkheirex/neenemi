import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import Configuration, { clearMessageAfterNavigation } from './Configuration';

const message = { tone: 'success', text: 'Limpieza finalizada' } as const;

describe('clearMessageAfterNavigation', () => {
  it('drops the clear-imports result when leaving Configuración', () => {
    expect(clearMessageAfterNavigation(message, null)).toBeNull();
    expect(clearMessageAfterNavigation(message, 'mantenimiento')).toBeNull();
  });

  it('keeps it while staying in Configuración', () => {
    expect(clearMessageAfterNavigation(message, 'configuracion')).toBe(message);
  });
});

describe('Configuration', () => {
  const markup = renderToStaticMarkup(<Configuration refreshKey={0} onBackupLevel={() => {}} onClearImports={() => {}} clearingImports={false} clearImportsMessage={null} />);

  it('usa la cabecera común y dice qué se puede hacer aquí', () => {
    expect(markup).toContain('CONFIGURACIÓN / DATOS Y RESPALDOS');
    expect(markup).toContain('<h1>Configuración</h1>');
    expect(markup).toContain('Respalda y restaura la base local');
  });

  it('reúne el panel de respaldo y el de archivos originales', () => {
    expect(markup).toContain('aria-label="Respaldo y recuperación de la base"');
    expect(markup).toContain('aria-label="Importaciones y archivos originales"');
  });

  it('los títulos bajan en orden: un h1 y los paneles como h2, sin saltar a h3', () => {
    const levels = [...markup.matchAll(/<h([1-6])[ >]/g)].map((match) => Number(match[1]));
    expect(levels[0]).toBe(1);
    expect(levels.filter((level) => level === 1)).toHaveLength(1);
    levels.reduce((previous, level) => {
      expect(level - previous).toBeLessThanOrEqual(1);
      return level;
    }, 0);
  });

  it('los dos paneles usan la tarjeta común', () => {
    const cards = markup.match(/<section[^>]*rounded-2xl border border-navy\/10 bg-white p-5 shadow-md[^>]*>/g) ?? [];
    expect(cards).toHaveLength(2);
  });

  it('muestra el resultado de la limpieza cuando existe', () => {
    const withMessage = renderToStaticMarkup(<Configuration refreshKey={0} onBackupLevel={() => {}} onClearImports={() => {}} clearingImports={false} clearImportsMessage={{ tone: 'success', text: 'Limpieza finalizada en 3 s' }} />);
    expect(withMessage).toContain('Limpieza finalizada en 3 s');
    expect(markup).not.toContain('Limpieza finalizada');
  });
});
