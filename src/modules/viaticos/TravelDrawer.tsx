import { useEffect, useRef, type ReactNode } from 'react';

type TravelDrawerProps = {
  eyebrow: string;
  title: string;
  /** Esc, la X y el clic en el fondo piden cerrar; quien lo monta decide (p. ej. confirmar si hay cambios). */
  onRequestClose: () => void;
  children: ReactNode;
};

/** Panel lateral modal (<dialog> nativo: foco atrapado, Esc, devuelve el foco al botón que lo abrió). Se monta solo abierto. */
export default function TravelDrawer({ eyebrow, title, onRequestClose, children }: TravelDrawerProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
    // Por defecto el foco cae en la X (primer elemento enfocable): aquí se viene a escribir.
    dialog?.querySelector<HTMLElement>('.travel-drawer-body input, .travel-drawer-body select, .travel-drawer-body textarea')?.focus();
  }, []);

  return (
    <dialog
      ref={ref}
      className="travel-drawer"
      aria-labelledby="travel-drawer-title"
      onCancel={(event) => { event.preventDefault(); onRequestClose(); }}
      // Un clic en el fondo (::backdrop) llega con el propio <dialog> como destino.
      onClick={(event) => { if (event.target === event.currentTarget) onRequestClose(); }}
    >
      <header className="travel-drawer-header">
        <div>
          <div className="eyebrow">{eyebrow}</div>
          <h2 id="travel-drawer-title">{title}</h2>
        </div>
        <button className="travel-drawer-close" type="button" aria-label="Cerrar panel" onClick={onRequestClose}>×</button>
      </header>
      <div className="travel-drawer-body">{children}</div>
    </dialog>
  );
}
