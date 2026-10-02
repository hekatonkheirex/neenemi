/** Mensaje de error persistente junto al campo inválido, en español (la burbuja nativa desaparece y no la leen todos los lectores de pantalla). */

type ValidityLike = Pick<ValidityState, 'valueMissing' | 'typeMismatch' | 'rangeUnderflow' | 'rangeOverflow' | 'patternMismatch' | 'tooShort' | 'tooLong' | 'stepMismatch' | 'badInput'>;
type ControlLike = { validity: ValidityLike; validationMessage: string; type?: string; min?: string; max?: string; minLength?: number; maxLength?: number };

export function fieldErrorMessage(el: ControlLike): string {
  const v = el.validity;
  if (v.valueMissing) return el.type === 'file' ? 'Elige un archivo.' : 'Este campo es obligatorio.';
  if (v.badInput) return 'El valor no es válido.';
  if (v.typeMismatch) return el.type === 'email' ? 'Escribe un correo válido.' : el.type === 'url' ? 'Escribe una dirección válida.' : 'El formato no es válido.';
  if (v.rangeUnderflow) return `Debe ser como mínimo ${el.min}.`;
  if (v.rangeOverflow) return `Debe ser como máximo ${el.max}.`;
  if (v.stepMismatch) return 'El valor no es un múltiplo permitido.';
  if (v.tooShort) return `Usa al menos ${el.minLength} caracteres.`;
  if (v.tooLong) return `Usa como máximo ${el.maxLength} caracteres.`;
  if (v.patternMismatch) return 'El formato no es válido.';
  return el.validationMessage || 'El valor no es válido.';
}

const SELECTOR = 'input:not([type=hidden]):not([type=file]), select, textarea';
let counter = 0;

function show(el: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement): void {
  const host = el.closest('label') ?? el.parentElement;
  if (!host) return;
  let note = el.dataset.errorId ? document.getElementById(el.dataset.errorId) : null;
  if (!note) {
    el.dataset.errorId = `field-error-${++counter}`;
    note = document.createElement('small');
    note.id = el.dataset.errorId;
    note.className = 'field-error';
    note.setAttribute('role', 'alert');
    host.appendChild(note);
  }
  note.textContent = fieldErrorMessage(el);
  el.setAttribute('aria-invalid', 'true');
  el.setAttribute('aria-describedby', note.id);
}

function clear(el: HTMLElement): void {
  if (!el.dataset.errorId) return;
  document.getElementById(el.dataset.errorId)?.remove();
  delete el.dataset.errorId;
  el.removeAttribute('aria-invalid');
  el.removeAttribute('aria-describedby');
}

/** Una vez para toda la app. Devuelve la función que quita los oyentes. */
export function installFieldErrors(): () => void {
  const isField = (t: EventTarget | null): t is HTMLInputElement => t instanceof HTMLElement && t.matches(SELECTOR);
  // `invalid` no burbujea: se escucha en captura. preventDefault oculta la burbuja nativa; el foco se mueve a mano al primero.
  // Los `invalid` de un mismo envío salen seguidos y en orden del documento: el primero recibe el foco.
  let focusPending = false;
  const onInvalid = (e: Event) => {
    if (!isField(e.target)) return;
    e.preventDefault();
    show(e.target);
    if (focusPending) return;
    focusPending = true;
    e.target.focus();
    setTimeout(() => { focusPending = false; }, 0);
  };
  const recheck = (e: Event) => { if (isField(e.target) && e.target.dataset.errorId && e.target.checkValidity()) clear(e.target); };
  const onBlur = (e: Event) => { if (isField(e.target) && e.target.matches(':user-invalid')) show(e.target); };
  document.addEventListener('invalid', onInvalid, true);
  document.addEventListener('input', recheck, true);
  document.addEventListener('change', recheck, true);
  document.addEventListener('focusout', onBlur, true);
  return () => {
    document.removeEventListener('invalid', onInvalid, true);
    document.removeEventListener('input', recheck, true);
    document.removeEventListener('change', recheck, true);
    document.removeEventListener('focusout', onBlur, true);
  };
}
