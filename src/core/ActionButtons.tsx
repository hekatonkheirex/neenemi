import { Download, LoaderCircle, Printer, Upload } from 'lucide-react';
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ChangeEvent, ReactNode, Ref } from 'react';
import { cn } from './cn';
import { Button, buttonVariants } from './ui/button';

// Botones por intencion: cargar (UploadButton, acento celeste), exportar (ExportButton, acento verde),
// procesar (Button default, naranja) y neutro (Button outline). Los ganchos .upload-button y .export-button se conservan:
// el CSS de algunos módulos (src/styles/index/25-action-buttons.css) los usa para ubicarlos.
// ponytail: el texto va sin <span>; el CSS heredado del tema claro colorea los <span> con más especificidad.

export function UploadIcon() {
  return <Upload className="size-4" aria-hidden="true" focusable="false" />;
}

export function DownloadIcon() {
  return <Download className="size-4" aria-hidden="true" focusable="false" />;
}

/** Reemplaza el icono mientras el botón está ocupado; sin giro si el sistema pide menos movimiento. */
export function BusySpinner() {
  return <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" focusable="false" data-busy-spinner />;
}

export interface UploadButtonProps {
  label: ReactNode;
  busy?: boolean;
  busyLabel?: string;
  accept: string;
  multiple?: boolean;
  disabled?: boolean;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
  id?: string;
  name?: string;
  title?: string;
  'aria-label'?: string;
  'aria-describedby'?: string;
  className?: string;
  inputRef?: Ref<HTMLInputElement>;
}

/** Unico lugar con `<input type="file">` visible para el usuario: el input queda transparente sobre el boton. */
export function UploadButton({ label, busy = false, busyLabel = 'Importando…', accept, multiple, disabled = false, onChange, className, inputRef, ...input }: UploadButtonProps) {
  const off = disabled || busy;
  return (
    <label
      className={cn(buttonVariants({ variant: 'upload' }), 'upload-button relative cursor-pointer focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-sky', off && 'is-disabled cursor-not-allowed opacity-55', className)}
      title={input.title}
    >
      {busy ? <BusySpinner /> : <UploadIcon />}
      {busy ? busyLabel : label}
      <input
        ref={inputRef}
        type="file"
        id={input.id}
        name={input.name}
        aria-label={input['aria-label']}
        aria-describedby={input['aria-describedby']}
        accept={accept}
        multiple={multiple}
        disabled={off}
        onChange={onChange}
      />
    </label>
  );
}

export interface ExportButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'type' | 'children'> {
  busy?: boolean;
  busyLabel?: string;
  children: ReactNode;
}

export function ExportButton({ busy = false, busyLabel = 'Exportando…', className, children, disabled, ...rest }: ExportButtonProps) {
  return (
    <button {...rest} type="button" className={cn(buttonVariants({ variant: 'export' }), 'export-button', className)} disabled={disabled || busy} aria-busy={busy || undefined}>
      {busy ? <BusySpinner /> : <DownloadIcon />}
      {busy ? busyLabel : children}
    </button>
  );
}

export type PrintButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'type' | 'children'> & { busy?: boolean; children?: ReactNode };

/** «Imprimir / PDF»: spinner y «Preparando…» mientras se arma y guarda el PDF; evita el doble clic. */
export function PrintButton({ busy = false, children = 'Imprimir / PDF', disabled, ...rest }: PrintButtonProps) {
  return (
    <Button {...rest} variant="outline" disabled={disabled || busy} aria-busy={busy || undefined}>
      {busy ? <BusySpinner /> : <Printer />}
      {busy ? 'Preparando…' : children}
    </Button>
  );
}

export type UploadTriggerProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'type' | 'children'> & { children: ReactNode };

/** Boton "cargar" que no abre el selector de archivos: abre un dialogo con su propia zona de carga. */
export function UploadTriggerButton({ className, children, ...rest }: UploadTriggerProps) {
  return (
    <button {...rest} type="button" className={cn(buttonVariants({ variant: 'upload' }), 'upload-button', className)}>
      <UploadIcon />
      {children}
    </button>
  );
}

/** Enlace de descarga con el aspecto del botón «exportar» (icono de descarga, verde). */
export function ExportLink({ className, children = 'Descargar original', size, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & { size?: 'default' | 'sm' }) {
  return (
    <a {...rest} className={cn(buttonVariants({ variant: 'export', size }), 'export-button w-fit', className)}>
      <DownloadIcon />
      {children}
    </a>
  );
}
