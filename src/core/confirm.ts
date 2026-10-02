export type ConfirmRequest = {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel?: string;
  tone?: 'danger' | 'default';
};

type Pending = { request: ConfirmRequest; resolve: (confirmed: boolean) => void };

const queue: Pending[] = [];
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

/** Reemplazo de window.confirm: devuelve true solo si la persona confirma. */
export function confirmAction(request: ConfirmRequest): Promise<boolean> {
  return new Promise((resolve) => {
    queue.push({ request, resolve });
    emit();
  });
}

export function resolveConfirm(confirmed: boolean) {
  queue.shift()?.resolve(confirmed);
  emit();
}

export function subscribeConfirm(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function currentConfirm(): ConfirmRequest | null {
  return queue[0]?.request ?? null;
}
