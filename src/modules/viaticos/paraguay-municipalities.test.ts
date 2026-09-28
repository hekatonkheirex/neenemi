import { describe, expect, it } from 'vitest';
import { canonicalMunicipality, PARAGUAY_MUNICIPALITIES, searchParaguayMunicipalities } from './paraguay-municipalities';

describe('municipios de Paraguay', () => {
  it('conserva los 263 municipios de la fuente legada sin duplicados', () => {
    expect(PARAGUAY_MUNICIPALITIES).toHaveLength(263);
    expect(new Set(PARAGUAY_MUNICIPALITIES).size).toBe(263);
  });

  it('encuentra y normaliza nombres aunque se escriban sin acentos', () => {
    expect(canonicalMunicipality('caazapa')).toBe('Caazapá');
    expect(canonicalMunicipality('Ypacarai')).toBe('Ypacaraí');
    expect(searchParaguayMunicipalities('mbocayaty')).toEqual(expect.arrayContaining(['Mbocayaty del Guairá', 'Mbocayaty del Yhaguy']));
  });
});
