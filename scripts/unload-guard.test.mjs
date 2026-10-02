import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const { attachUnloadGuard } = require('../electron/unload-guard.cjs');

function setup(choice) {
  let handler;
  const window = { webContents: { on: (name, fn) => { if (name === 'will-prevent-unload') handler = fn; } } };
  const dialog = { showMessageBoxSync: vi.fn(() => choice) };
  attachUnloadGuard(window, dialog);
  const event = { preventDefault: vi.fn() };
  handler(event);
  return { dialog, event, window };
}

describe('attachUnloadGuard', () => {
  it('con "Salir sin guardar" ignora la cancelación del renderer (la ventana se cierra)', () => {
    const { event } = setup(1);
    expect(event.preventDefault).toHaveBeenCalledOnce();
  });

  it('con "Seguir editando" no llama preventDefault (la ventana sigue abierta)', () => {
    const { event } = setup(0);
    expect(event.preventDefault).not.toHaveBeenCalled();
  });

  it('el diálogo ofrece seguir editando por defecto y al cancelar con Esc', () => {
    const { dialog, window } = setup(0);
    const [parent, options] = dialog.showMessageBoxSync.mock.calls[0];
    expect(parent).toBe(window);
    expect(options.buttons).toEqual(['Seguir editando', 'Salir sin guardar']);
    expect(options.defaultId).toBe(0);
    expect(options.cancelId).toBe(0);
  });
});
