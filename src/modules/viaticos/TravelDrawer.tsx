import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { cn } from '../../core/cn';
import { dialogPanel } from '../../core/dialog';
import { Button } from '../../core/ui/button';
import { CardHeader } from '../../core/ui/card';

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
    dialog?.querySelector<HTMLElement>('[data-drawer-body] input, [data-drawer-body] select, [data-drawer-body] textarea')?.focus();
  }, []);

  return (
    <dialog
      ref={ref}
      className={cn(dialogPanel, 'mr-0 ml-auto h-dvh max-h-none w-[min(34rem,100vw)] max-w-[100vw] rounded-r-none')}
      aria-labelledby="travel-drawer-title"
      onCancel={(event) => { event.preventDefault(); onRequestClose(); }}
      // Un clic en el fondo (::backdrop) llega con el propio <dialog> como destino.
      onClick={(event) => { if (event.target === event.currentTarget) onRequestClose(); }}
    >
      <div className="flex h-full min-h-0 flex-col">
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-navy/10 p-5 dark:border-sky/20">
          <CardHeader eyebrow={eyebrow} title={<span id="travel-drawer-title">{title}</span>} />
          <Button variant="ghost" size="icon" onClick={onRequestClose} aria-label="Cerrar panel"><X /></Button>
        </header>
        <div data-drawer-body className="grid min-h-0 flex-1 content-start gap-4 overflow-y-auto p-5">{children}</div>
      </div>
    </dialog>
  );
}
