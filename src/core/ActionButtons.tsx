import type { ButtonHTMLAttributes, ChangeEvent, ReactNode, Ref } from 'react';

// Botones por intencion: cargar (UploadButton, acento celeste), exportar (ExportButton, acento verde),
// procesar (.primary-button) y neutro (.secondary-button). Ver src/styles/index/27-action-buttons.css.

const iconProps = { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true, focusable: false } as const;

export function UploadIcon() {
  return <svg {...iconProps}><path d="M12 16V4m0 0-4 4m4-4 4 4M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" /></svg>;
}

export function DownloadIcon() {
  return <svg {...iconProps}><path d="M12 4v12m0 0-4-4m4 4 4-4M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" /></svg>;
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
export function UploadButton({ label, busy = false, busyLabel = 'Importando…', accept, multiple, disabled = false, onChange, className = '', inputRef, ...input }: UploadButtonProps) {
  const off = disabled || busy;
  return (
    <label className={`secondary-button upload-button${off ? ' is-disabled' : ''}${className ? ` ${className}` : ''}`} title={input.title}>
      <UploadIcon />
      <span>{busy ? busyLabel : label}</span>
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

export function ExportButton({ busy = false, busyLabel = 'Exportando…', className = '', children, disabled, ...rest }: ExportButtonProps) {
  return (
    <button {...rest} type="button" className={`secondary-button export-button${className ? ` ${className}` : ''}`} disabled={disabled || busy} aria-busy={busy || undefined}>
      <DownloadIcon />
      <span>{busy ? busyLabel : children}</span>
    </button>
  );
}
