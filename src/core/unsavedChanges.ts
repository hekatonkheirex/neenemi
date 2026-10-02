import { useEffect } from 'react';

const dirty = new Set<symbol>();

export function hasUnsavedChanges(): boolean {
  return dirty.size > 0;
}

/** beforeunload: cancela el cierre o la recarga solo si hay borradores sin guardar. */
export function guardUnload(event: { preventDefault: () => void; returnValue?: unknown }): void {
  if (!hasUnsavedChanges()) return;
  event.preventDefault();
  event.returnValue = '';
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
