import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { cn } from './cn';
import { dialogPanel } from './dialog';

type ModalDialogProps = {
  labelledBy: string;
  describedBy?: string;
  /** Esc y el clic en el fondo piden cerrar; quien lo monta decide (p. ej. ignorarlo mientras trabaja). */
  onRequestClose: () => void;
  className?: string;
  children: ReactNode;
};

/** <dialog> nativo modal (foco atrapado, Esc, fondo difuminado). Se monta solo abierto y se cierra al desmontarse. */
export default function ModalDialog({ labelledBy, describedBy, onRequestClose, className, children }: ModalDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useLayoutEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
    return () => dialog?.close();
  }, []);

  return (
    <dialog
      ref={ref}
      className={cn(dialogPanel, 'w-[min(48rem,calc(100vw-2rem))]', className)}
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      onCancel={(event) => { event.preventDefault(); onRequestClose(); }}
      onMouseDown={(event) => { if (event.target === event.currentTarget) onRequestClose(); }}
    >
      <div className="flex max-h-[calc(100vh-2rem)] flex-col">{children}</div>
    </dialog>
  );
}

export const modalHeaderClass = 'flex shrink-0 items-start justify-between gap-4 border-b border-navy/10 p-5 dark:border-sky/20';
export const modalBodyClass = 'grid min-h-0 gap-4 overflow-y-auto p-5 [overflow-wrap:anywhere]';
export const modalFooterClass = 'flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-navy/10 p-5 dark:border-sky/20';
