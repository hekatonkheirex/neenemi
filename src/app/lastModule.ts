export const LAST_MODULE_STORAGE_KEY = 'datasystems-suite-last-module';

export type ModuleStorage = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
};

/** Devuelve el último módulo abierto si sigue existiendo; si no, null (Inicio). */
export function readLastModule(storage: ModuleStorage | undefined, validIds: readonly string[]): string | null {
  try {
    const id = storage?.getItem(LAST_MODULE_STORAGE_KEY);
    return id && validIds.includes(id) ? id : null;
  } catch {
    return null;
  }
}

export function persistLastModule(id: string | null, storage: ModuleStorage | undefined): void {
  try {
    if (id) storage?.setItem(LAST_MODULE_STORAGE_KEY, id);
    else storage?.removeItem(LAST_MODULE_STORAGE_KEY);
  } catch {
    // La navegación debe seguir funcionando sin almacenamiento.
  }
}
