import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { suiteModules } from './modules';

// Cada módulo con PageHeader debe titularse igual que su entrada del sidebar.
const files: Record<string, string> = {
  mantenimiento: 'src/modules/operaciones/MantenimientoModule.tsx',
  consumibles: 'src/modules/consumibles/ConsumiblesModule.tsx',
  tracking: 'src/modules/tracking/TrackingModule.tsx',
  viaticos: 'src/modules/viaticos/ViaticosModule.tsx',
  'listado-precios': 'src/modules/ventas/ListadoPreciosModule.tsx',
  descontinuador: 'src/modules/operaciones/DescontinuadorModule.tsx',
  proformas: 'src/modules/ventas/ProformasModule.tsx',
  'software-selector': 'src/modules/software-selector/SoftwareSelectorModule.tsx',
  uniflow: 'src/modules/uniflow/UniflowModule.tsx',
  cobertura: 'src/modules/cobertura/CoberturaModule.tsx',
  mps: 'src/modules/mps/MpsModule.tsx',
  sla: 'src/modules/sla/SlaModule.tsx',
};

describe('títulos de módulo', () => {
  it('cubre todos los módulos del sidebar', () => {
    expect(Object.keys(files).sort()).toEqual(suiteModules.map((m) => m.id).sort());
  });
  it.each(suiteModules.map((m) => [m.id, m.label] as const))('%s usa el nombre del sidebar', (id, label) => {
    const src = readFileSync(files[id], 'utf8');
    expect(src).toContain(`title="${label}"`);
  });
});
