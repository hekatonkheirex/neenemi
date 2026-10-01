import { describe, expect, it } from 'vitest';
import { suiteModules } from './modules';

describe('suite module manifest', () => {
  it('contains every included legacy tool exactly once', () => {
    expect(suiteModules).toHaveLength(13);
    expect(suiteModules.map((module) => module.id)).not.toContain('servicios');
    expect(new Set(suiteModules.map((module) => module.id)).size).toBe(suiteModules.length);
    expect(new Set(suiteModules.map((module) => module.route)).size).toBe(suiteModules.length);

    for (const module of suiteModules) {
      expect(module.sourceProject).not.toBe('redact-ds');
      expect(module.owner).toBeTruthy();
      expect(module.inputs.length).toBeGreaterThan(0);
      expect(module.outputs.length).toBeGreaterThan(0);
    }
  });

  it('keeps shared data ownership explicit', () => {
    expect(suiteModules.find((module) => module.id === 'catalogo')?.dataOwner).toEqual([
      'parts',
      'part_prices',
      'inventory_snapshots',
      'catalog_model_families',
      'catalog_model_notes',
      'catalog_service_items',
      'import_batches',
    ]);
    expect(suiteModules.find((module) => module.id === 'mantenimiento')?.dataOwner).toContain(
      'contract_equipment',
    );
    expect(suiteModules.find((module) => module.id === 'descontinuador')?.dataOwner).toEqual([
      'customers',
      'contracts',
      'contract_equipment',
      'equipment_models',
      'canon_discontinuation_items',
      'waldbott_stock_items',
      'import_batches',
    ]);
    expect(suiteModules.find((module) => module.id === 'mps')?.dataOwner).toEqual([
      'equipment_models',
      'model_mps_profiles',
      'mps_consumables',
      'import_batches',
    ]);
    expect(suiteModules.find((module) => module.id === 'consumibles')?.dataOwner).toEqual([
      'customers',
      'contracts',
      'contract_equipment',
      'consumables_usage_records',
      'consumables_output_records',
      'import_batches',
    ]);
    expect(suiteModules.find((module) => module.id === 'viaticos')?.dataOwner).toEqual([
      'travel_trips',
      'travel_cost_catalog',
      'travel_historical_snapshots',
      'import_batches',
    ]);
    expect(suiteModules.find((module) => module.id === 'uniflow')?.dataOwner).toEqual([
      'uniflow_price_lists',
      'parts',
      'part_prices',
      'app_settings',
    ]);
    expect(suiteModules.find((module) => module.id === 'software-selector')?.dataOwner).toEqual([
      'app_settings',
    ]);
    expect(suiteModules.find((module) => module.id === 'sla')?.dataOwner).toEqual([
      'app_settings',
    ]);
    expect(suiteModules.find((module) => module.id === 'cobertura')?.dataOwner).toEqual([
      'equipment_models',
      'app_settings',
    ]);
  });
});
