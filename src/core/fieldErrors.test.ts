import { describe, expect, it } from 'vitest';
import { fieldErrorMessage } from './fieldErrors';

const ok = { valueMissing: false, typeMismatch: false, rangeUnderflow: false, rangeOverflow: false, patternMismatch: false, tooShort: false, tooLong: false, stepMismatch: false, badInput: false };
const msg = (flags: Partial<typeof ok>, extra: object = {}) => fieldErrorMessage({ validity: { ...ok, ...flags }, validationMessage: 'nativo', ...extra });

describe('fieldErrorMessage', () => {
  it.each([
    [{ valueMissing: true }, {}, 'Este campo es obligatorio.'],
    [{ valueMissing: true }, { type: 'file' }, 'Elige un archivo.'],
    [{ typeMismatch: true }, { type: 'email' }, 'Escribe un correo válido.'],
    [{ rangeUnderflow: true }, { min: '1' }, 'Debe ser como mínimo 1.'],
    [{ rangeOverflow: true }, { max: '9' }, 'Debe ser como máximo 9.'],
    [{ tooShort: true }, { minLength: 3 }, 'Usa al menos 3 caracteres.'],
    [{ badInput: true }, {}, 'El valor no es válido.'],
    [{ patternMismatch: true }, { title: 'No puede quedar vacío.' }, 'No puede quedar vacío.'],
    [{ patternMismatch: true }, {}, 'El formato no es válido.'],
    [{}, {}, 'nativo'],
  ])('%j %j -> %s', (flags, extra, expected) => {
    expect(msg(flags, extra)).toBe(expected);
  });

  it('un campo obligatorio vacío gana a otros errores', () => {
    expect(msg({ valueMissing: true, patternMismatch: true })).toBe('Este campo es obligatorio.');
  });
});

describe('formularios con asterisco', () => {
  it('Marca y Modelo del editor MPS son required (el chequeo JS queda solo como respaldo)', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync(new URL('../modules/mps/MpsModelEditor.tsx', import.meta.url), 'utf8');
    expect(src).toMatch(/<span>Marca \*<\/span><input required pattern="\.\*\\S\.\*" title="[^"]+" name="brand"/);
    expect(src).toMatch(/<span>Modelo \*<\/span><input required pattern="\.\*\\S\.\*" title="[^"]+" name="model"/);
  });
});
