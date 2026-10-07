import { describe, expect, it } from 'vitest';
import { ACTIVE_CONTRACT_TYPES, ACTIVE_CONTRACT_TYPES_SQL, ACTIVE_CONTRACT_TYPES_TEXT } from './contract-types';

describe('active contract types', () => {
  it('derive the SQL list and the copy from one list', () => {
    expect(ACTIVE_CONTRACT_TYPES_SQL).toBe("'Abierto', 'Alquiler', 'Leasing', 'Mantenimiento'");
    expect(ACTIVE_CONTRACT_TYPES_TEXT).toBe('Abierto, Alquiler, Leasing y Mantenimiento');
    expect(ACTIVE_CONTRACT_TYPES).toHaveLength(4);
  });
});
