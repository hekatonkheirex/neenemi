import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { hasUnsavedChanges, registerUnsaved } from '../core/unsavedChanges';
import ModuleSkeleton from './ModuleSkeleton';
import { LAST_MODULE_STORAGE_KEY, persistLastModule, readLastModule, type ModuleStorage } from './lastModule';

function memoryStorage(initial: Record<string, string> = {}): ModuleStorage & { data: Record<string, string> } {
  const data = { ...initial };
  return {
    data,
    getItem: (key) => data[key] ?? null,
    setItem: (key, value) => { data[key] = value; },
    removeItem: (key) => { delete data[key]; },
  };
}

const ids = ['catalogo', 'mps'];

describe('último módulo', () => {
  it('restaura un módulo guardado que existe', () => {
    expect(readLastModule(memoryStorage({ [LAST_MODULE_STORAGE_KEY]: 'mps' }), ids)).toBe('mps');
  });

  it('cae al Resumen si el id guardado ya no existe, no hay valor o no hay storage', () => {
    expect(readLastModule(memoryStorage({ [LAST_MODULE_STORAGE_KEY]: 'borrado' }), ids)).toBeNull();
    expect(readLastModule(memoryStorage(), ids)).toBeNull();
    expect(readLastModule(undefined, ids)).toBeNull();
  });

  it('guarda el módulo y borra la clave al volver al Resumen', () => {
    const storage = memoryStorage();
    persistLastModule('catalogo', storage);
    expect(storage.data[LAST_MODULE_STORAGE_KEY]).toBe('catalogo');
    persistLastModule(null, storage);
    expect(storage.data[LAST_MODULE_STORAGE_KEY]).toBeUndefined();
  });

  it('no falla si el storage lanza (modo privado, permisos)', () => {
    const broken: ModuleStorage = {
      getItem: () => { throw new Error('denied'); },
      setItem: () => { throw new Error('denied'); },
      removeItem: () => { throw new Error('denied'); },
    };
    expect(readLastModule(broken, ids)).toBeNull();
    expect(() => persistLastModule('mps', broken)).not.toThrow();
  });
});

describe('cambios sin guardar', () => {
  it('cuenta cada borrador y se libera al desmontar', () => {
    expect(hasUnsavedChanges()).toBe(false);
    const releaseA = registerUnsaved();
    const releaseB = registerUnsaved();
    releaseA();
    expect(hasUnsavedChanges()).toBe(true);
    releaseB();
    expect(hasUnsavedChanges()).toBe(false);
  });

  it('liberar dos veces no rompe el conteo de otros borradores', () => {
    const a = registerUnsaved();
    const b = registerUnsaved();
    a();
    a();
    expect(hasUnsavedChanges()).toBe(true);
    b();
    expect(hasUnsavedChanges()).toBe(false);
  });
});

describe('ModuleSkeleton', () => {
  it('anuncia la carga a lectores de pantalla y oculta los bloques decorativos', () => {
    const markup = renderToStaticMarkup(<ModuleSkeleton />);
    expect(markup).toContain('role="status"');
    expect(markup).toContain('aria-busy="true"');
    expect(markup).toContain('Cargando módulo…');
    expect(markup).toContain('skeleton-table');
  });
});
