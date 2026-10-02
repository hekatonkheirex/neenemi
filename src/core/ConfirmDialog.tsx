import { useEffect, useRef, useSyncExternalStore } from 'react';
import { currentConfirm, resolveConfirm, subscribeConfirm, type ConfirmRequest } from './confirm';

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
      className="confirm-dialog"
      aria-labelledby="confirm-dialog-title"
      aria-describedby="confirm-dialog-message"
      // Esc dispara "cancel": se resuelve como rechazo y se deja que el host desmonte el diálogo.
      onCancel={(event) => { event.preventDefault(); onResolve(false); }}
    >
      <h2 id="confirm-dialog-title">{request.title}</h2>
      <p id="confirm-dialog-message">{request.message}</p>
      <div className="confirm-dialog-actions">
        {/* Cancelar tiene el foco inicial: la acción destructiva nunca se activa con un Enter accidental. */}
        <button className="secondary-button" type="button" autoFocus onClick={() => onResolve(false)}>
          {request.cancelLabel ?? 'Cancelar'}
        </button>
        <button
          className={danger ? 'primary-button confirm-dialog-danger' : 'primary-button'}
          type="button"
          onClick={() => onResolve(true)}
        >
          {request.confirmLabel}
        </button>
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
