import { useEffect } from 'react';

const dirty = new Set<symbol>();

export function hasUnsavedChanges(): boolean {
  return dirty.size > 0;
}

/** Marca un borrador como sin guardar; devuelve la función que lo libera. */
export function registerUnsaved(): () => void {
  const key = Symbol('unsaved');
  dirty.add(key);
  return () => { dirty.delete(key); };
}

/** Un módulo con un borrador sin guardar llama useUnsavedChanges(esBorradorModificado). */
export function useUnsavedChanges(isDirty: boolean): void {
  useEffect(() => (isDirty ? registerUnsaved() : undefined), [isDirty]);
}
