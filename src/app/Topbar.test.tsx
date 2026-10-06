import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import Topbar from './Topbar';

const render = (theme: 'light' | 'dark') =>
  renderToStaticMarkup(<Topbar label="Viáticos" theme={theme} onOpenPalette={() => {}} onToggleTheme={() => {}} />);

describe('Topbar', () => {
  it('conserva el gancho de impresión y muestra el módulo activo', () => {
    const markup = render('light');
    expect(markup).toMatch(/<header class="topbar">/);
    expect(markup).toContain('DCSS Suite / Viáticos');
  });

  it('el selector de tema es un switch con estado y nombre que anuncian el destino', () => {
    const light = render('light');
    expect(light).toMatch(/role="switch"[^>]*aria-checked="false"[^>]*aria-label="Cambiar a modo oscuro"/);
    expect(light).toContain('>Claro</strong>');
    const dark = render('dark');
    expect(dark).toMatch(/aria-checked="true"[^>]*aria-label="Cambiar a modo claro"/);
    expect(dark).toContain('>Oscuro</strong>');
  });

  it('la paleta es un botón con atajo anunciado', () => {
    const markup = render('light');
    expect(markup).toContain('aria-keyshortcuts="Control+K Meta+K"');
    expect(markup).toContain('Ctrl K');
  });
});
