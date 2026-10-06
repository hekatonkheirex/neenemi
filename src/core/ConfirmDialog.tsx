import { useEffect, useRef, useSyncExternalStore } from 'react';
import { currentConfirm, resolveConfirm, subscribeConfirm, type ConfirmRequest } from './confirm';
import { cn } from './cn';
import { dialogPanel } from './dialog';
import { Button } from './ui/button';

export function ConfirmDialogView({ request, onResolve }: { request: ConfirmRequest; onResolve: (confirmed: boolean) => void }) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  const danger = request.tone !== 'default';

  return (
    <dialog
      ref={ref}
      className={dialogPanel}
      data-tone={danger ? 'danger' : 'default'}
      aria-labelledby="confirm-dialog-title"
      aria-describedby="confirm-dialog-message"
      // Esc dispara "cancel": se resuelve como rechazo y se deja que el host desmonte el diálogo.
      onCancel={(event) => { event.preventDefault(); onResolve(false); }}
    >
      <div className="grid gap-4 p-6">
        <h2 id="confirm-dialog-title" className="text-lg font-bold text-navy dark:text-white">{request.title}</h2>
        {/* ponytail: <div> y no <p>: el CSS heredado del tema claro colorea <p> con más especificidad. */}
        <div id="confirm-dialog-message" className="text-sm leading-relaxed text-ink-2 dark:text-[#b9c9e6]">{request.message}</div>
        <div className="mt-2 flex flex-wrap justify-end gap-2">
          {/* Cancelar tiene el foco inicial: la acción destructiva nunca se activa con un Enter accidental. */}
          <Button variant="outline" autoFocus onClick={() => onResolve(false)}>
            {request.cancelLabel ?? 'Cancelar'}
          </Button>
          <Button variant={danger ? 'destructive' : 'default'} className={cn(danger && 'dark:bg-[#d92d20]')} onClick={() => onResolve(true)}>
            {request.confirmLabel}
          </Button>
        </div>
      </div>
    </dialog>
  );
}

/** Se monta una sola vez en App. */
export default function ConfirmDialogHost() {
  const request = useSyncExternalStore(subscribeConfirm, currentConfirm, () => null);
  // key fuerza un <dialog> nuevo cuando hay otra confirmación en cola.
  return request ? <ConfirmDialogView key={request.title + request.message} request={request} onResolve={resolveConfirm} /> : null;
}
