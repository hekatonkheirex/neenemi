import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import App from '../app/App';
import { ConfirmDialogView } from './ConfirmDialog';
import { confirmAction, currentConfirm, resolveConfirm } from './confirm';

const base = { title: 'Quitar carga', message: 'Se quitará la carga.', confirmLabel: 'Quitar carga' };

describe('confirmAction', () => {
  it('resuelve true al confirmar y false al cancelar', async () => {
    const yes = confirmAction(base);
    resolveConfirm(true);
    const no = confirmAction(base);
    resolveConfirm(false);
    expect(await yes).toBe(true);
    expect(await no).toBe(false);
    expect(currentConfirm()).toBeNull();
  });

  it('atiende en orden las confirmaciones simultáneas', async () => {
    const first = confirmAction({ ...base, title: 'A' });
    const second = confirmAction({ ...base, title: 'B' });
    expect(currentConfirm()?.title).toBe('A');
    resolveConfirm(true);
    expect(currentConfirm()?.title).toBe('B');
    resolveConfirm(false);
    expect([await first, await second]).toEqual([true, false]);
  });

  it('no hace nada si se resuelve sin confirmación pendiente', () => {
    expect(() => resolveConfirm(true)).not.toThrow();
  });
});

describe('ConfirmDialogView', () => {
  it('nombra la acción, enlaza título y descripción y marca la acción destructiva', () => {
    const markup = renderToStaticMarkup(<ConfirmDialogView request={base} onResolve={() => {}} />);
    expect(markup).toContain('aria-labelledby="confirm-dialog-title"');
    expect(markup).toContain('aria-describedby="confirm-dialog-message"');
    expect(markup).toMatch(/<button[^>]*>Quitar carga<\/button>/);
    expect(markup).toContain('data-tone="danger"');
    expect(markup).toContain('bg-[#b42318]');
    expect(markup).toMatch(/<button[^>]*>Cancelar<\/button>/);
    expect(markup).toContain('backdrop:backdrop-blur-sm');
  });

  it('no marca como destructiva una confirmación neutra', () => {
    const markup = renderToStaticMarkup(<ConfirmDialogView request={{ ...base, tone: 'default' }} onResolve={() => {}} />);
    expect(markup).toContain('data-tone="default"');
    expect(markup).not.toContain('bg-[#b42318]');
  });
});

describe('navegación', () => {
  it('marca Resumen con aria-current="page"', () => {
    expect(renderToStaticMarkup(<App />)).toContain('aria-current="page"');
  });
});

describe('sin window.confirm', () => {
  it('ningún módulo usa el diálogo nativo', async () => {
    const { execSync } = await import('node:child_process');
    const hits = execSync("grep -rln 'window\\.confirm(' src --include=*.tsx --include=*.ts || true", { encoding: 'utf8' }).trim();
    expect(hits).toBe('');
  });
});
