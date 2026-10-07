import { useCallback, useRef, useState } from 'react';

/** Ejecuta `task` marcando ocupado; un segundo llamado durante la espera se ignora. Pura para poder testearla sin DOM. */
export async function runExclusive<T>(lock: { current: boolean }, setBusy: (busy: boolean) => void, task: () => Promise<T>): Promise<T | undefined> {
  if (lock.current) return undefined;
  lock.current = true;
  setBusy(true);
  try {
    return await task();
  } finally {
    lock.current = false;
    setBusy(false);
  }
}

/** `[busy, run]`: `run(task)` activa `busy` mientras dura la tarea y evita la doble exportación. */
export function useBusy(): [boolean, <T>(task: () => Promise<T>) => Promise<T | undefined>] {
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const run = useCallback(<T,>(task: () => Promise<T>) => runExclusive(lock, setBusy, task), []);
  return [busy, run];
}
