import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { readCssBundle } from '../test-support/css';
import BackupAlertDot from './BackupAlertDot';

describe('BackupAlertDot', () => {
  it('es accesible y trae el anillo y el núcleo animados', () => {
    const markup = renderToStaticMarkup(<BackupAlertDot />);
    expect(markup).toContain('aria-label="Respaldo pendiente"');
    expect(markup).toContain('nav-alert-ring');
    expect(markup).toContain('nav-alert-core');
  });

  it('anima con CSS (compositor) y no con JavaScript: el latido infinito mantenía ocupado el hilo principal', () => {
    const css = readCssBundle('src/index.css');
    expect(css).toMatch(/\.nav-alert-ring \{[^}]*animation:\s*nav-alert-ring 2\.4s[^}]*infinite/);
    expect(css).toMatch(/@keyframes nav-alert-ring \{[^@]*scale\(2\.8\)/);
    expect(css).toMatch(/prefers-reduced-motion: reduce\) \{\s*\.nav-alert, \.nav-alert-core \{ animation: none; \}\s*\.nav-alert-ring \{ display: none; \}/);
    expect(readFileSync('src/app/BackupAlertDot.tsx', 'utf8')).not.toMatch(/from 'framer-motion'/);
  });
});
