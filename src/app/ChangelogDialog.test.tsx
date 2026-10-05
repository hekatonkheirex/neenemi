import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import App from './App';
import ChangelogDialog from './ChangelogDialog';
import { version } from '../../package.json';

describe('historial de cambios', () => {
  it('lista el historial completo, marca la versión instalada y expone el diálogo con nombre accesible', () => {
    const markup = renderToStaticMarkup(<ChangelogDialog currentVersion={version} onClose={() => {}} />);
    expect(markup).toContain('role="dialog"');
    expect(markup).toContain('aria-labelledby="changelog-title"');
    expect(markup).toContain(`v${version}`);
    expect(markup).toContain('Instalada');
    expect(markup).toContain('v0.1.1<');
    expect(markup.match(/<li/g)!.length).toBeGreaterThanOrEqual(46);
  });
  it('la barra lateral muestra la versión como botón que abre el historial, cerrado por defecto', () => {
    const markup = renderToStaticMarkup(<App />);
    expect(markup).toMatch(new RegExp(`<button[^>]*sidebar-version-link[^>]*aria-haspopup="dialog"[^>]*>Versión v${version.replace(/\./g, '\\.')}</button>`));
    expect(markup).not.toContain('changelog-dialog');
  });
  it('ya no muestra "Solo en este equipo" ni "SQLite local lista"', () => {
    const markup = renderToStaticMarkup(<App />);
    expect(markup).not.toContain('Solo en este equipo');
    expect(markup).not.toContain('SQLite local lista');
  });
});
