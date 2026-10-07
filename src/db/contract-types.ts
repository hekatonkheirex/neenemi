/** Contract types the department treats as the active portfolio. Single source for the Inicio queries and their copy. */
export const ACTIVE_CONTRACT_TYPES = ['Abierto', 'Alquiler', 'Leasing', 'Mantenimiento'] as const;

// Constants, never user input: safe to inline in SQL.
export const ACTIVE_CONTRACT_TYPES_SQL = ACTIVE_CONTRACT_TYPES.map((type) => `'${type}'`).join(', ');

export const ACTIVE_CONTRACT_TYPES_TEXT = new Intl.ListFormat('es', { style: 'long', type: 'conjunction' }).format(ACTIVE_CONTRACT_TYPES);
