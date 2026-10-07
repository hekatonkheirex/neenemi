import { describe, expect, it } from 'vitest';
import { coverageNote } from './DashboardMaintenanceChart';

describe('coverageNote', () => {
  it('reports readings against equipment on active contracts', () => {
    expect(coverageNote({ activeEquipment: 3000, activeEquipmentWithReadings: 1800 })).toBe(
      '1.800 de 3.000 equipos en contratos activos tienen lecturas de contadores (60%). El resto no entra en este análisis.',
    );
  });

  it.each([null, undefined, { activeEquipment: 0, activeEquipmentWithReadings: 0 }])('hides the note without an active base: %j', (value) => {
    expect(coverageNote(value)).toBeNull();
  });
});
