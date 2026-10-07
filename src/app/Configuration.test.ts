import { describe, expect, it } from 'vitest';
import { clearMessageAfterNavigation } from './Configuration';

const message = { tone: 'success', text: 'Limpieza finalizada' } as const;

describe('clearMessageAfterNavigation', () => {
  it('drops the clear-imports result when leaving Configuración', () => {
    expect(clearMessageAfterNavigation(message, null)).toBeNull();
    expect(clearMessageAfterNavigation(message, 'mantenimiento')).toBeNull();
  });

  it('keeps it while staying in Configuración', () => {
    expect(clearMessageAfterNavigation(message, 'configuracion')).toBe(message);
  });
});
