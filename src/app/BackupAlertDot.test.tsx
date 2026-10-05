import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import BackupAlertDot from './BackupAlertDot';

describe('BackupAlertDot', () => {
  it('es accesible y trae el anillo y el núcleo animados', () => {
    const markup = renderToStaticMarkup(<BackupAlertDot />);
    expect(markup).toContain('aria-label="Respaldo pendiente"');
    expect(markup).toContain('nav-alert-ring');
    expect(markup).toContain('nav-alert-core');
  });
});
