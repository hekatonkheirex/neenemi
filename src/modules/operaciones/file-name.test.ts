import { describe, expect, it } from 'vitest';
import { toFileSafeName } from './file-name';

describe('toFileSafeName', () => {
  it('quita la extensión del archivo de origen', () => {
    expect(toFileSafeName('20260918_120817.xlsx')).toBe('20260918-120817');
    expect(toFileSafeName('Contadores.XLS')).toBe('Contadores');
  });
  it('quita acentos y símbolos, y usa un respaldo si queda vacío', () => {
    expect(toFileSafeName('Pág. Ñandú / 1')).toBe('Pag-Nandu-1');
    expect(toFileSafeName('???')).toBe('equipo');
  });
});
