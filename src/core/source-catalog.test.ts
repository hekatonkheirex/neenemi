import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { getSourceCoverage, isEquipmentDetailExport, latestBatch, normalizeSourceName, SOURCE_CATALOG, sourceMatchesDefinition } from './source-catalog';

describe('source catalog', () => {
  it('normalizes accents, paths and extensions for source matching', () => {
    expect(normalizeSourceName('C:\\Exportes\\Salida de Consumibles 2025 - 2026.xlsx')).toBe('salida de consumibles 2025 2026');

    const definition = SOURCE_CATALOG.find((item) => item.id === 'consumibles.dispatch');
    expect(definition).toBeDefined();
    expect(sourceMatchesDefinition(definition!, 'Salida de Consumibles 2025 - 2026.xlsx')).toBe(true);
    expect(sourceMatchesDefinition(definition!, 'Salida de Repuestos.xlsx')).toBe(false);
    expect(sourceMatchesDefinition(definition!, 'exportacion-renombrada.xlsx', 'salida-consumibles')).toBe(true);

    const canonDefinition = SOURCE_CATALOG.find((item) => item.id === 'discontinuation.canon');
    expect(canonDefinition).toBeDefined();
    expect(sourceMatchesDefinition(canonDefinition!, '2023_Discontinued_Machine_List.xlsx')).toBe(true);
    expect(sourceMatchesDefinition(canonDefinition!, '2025_Discontinued_Machine_List_(2).xlsx')).toBe(true);
    expect(sourceMatchesDefinition(canonDefinition!, 'Equipos en Contratos y en Dpto MRA.xlsx')).toBe(false);

    const equipmentDefinition = SOURCE_CATALOG.find((item) => item.id === 'fleet.equipment');
    expect(equipmentDefinition).toBeDefined();
    expect(sourceMatchesDefinition(equipmentDefinition!, 'Detalles de equipos en contrato.xlsx', 'fleet.equipment')).toBe(true);
    expect(sourceMatchesDefinition(equipmentDefinition!, 'Detalles de equipos en contrato.xlsx', 'classification')).toBe(false);
    expect(sourceMatchesDefinition(equipmentDefinition!, '20260805_184249.xlsx', null, 'operations')).toBe(true);
    expect(sourceMatchesDefinition(equipmentDefinition!, '20260805_184249.xlsx', null, 'operations-fleet-classification')).toBe(false);
  });

  it('reports import status without inventing a source when it is not loaded', () => {
    const database = new Database(':memory:');
    database.exec(`
      CREATE TABLE import_batches (
        id TEXT PRIMARY KEY,
        source_name TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        applied_at TEXT
      )
    `);
    database.exec(`
      CREATE TABLE import_source_rows (
        id TEXT PRIMARY KEY,
        batch_id TEXT NOT NULL,
        import_file_id TEXT NOT NULL,
        sheet_name TEXT NOT NULL
      )
    `);
    database.prepare('INSERT INTO import_batches (id, source_name, status, created_at, applied_at) VALUES (?, ?, ?, ?, ?)')
      .run('batch-1', 'Detalles de consumibles.xlsx', 'applied', '2026-09-10T08:00:00.000Z', '2026-09-10T08:01:00.000Z');

    const coverage = getSourceCoverage(database);
    const loaded = coverage.find((item) => item.id === 'consumibles.detail');
    const missing = coverage.find((item) => item.id === 'fleet.contract-details');

    expect(loaded?.imported).toEqual({ total: 1, applied: 1, failed: 0, lastImportedAt: '2026-09-10T08:01:00.000Z', rawRows: 0, rawSheets: 0 });
    expect(missing?.imported).toEqual({ total: 0, applied: 0, failed: 0, lastImportedAt: null, rawRows: 0, rawSheets: 0 });
    database.close();
  });

  it('does not attribute a typed classification load to the shared equipment source', () => {
    const database = new Database(':memory:');
    database.exec(`
      CREATE TABLE import_batches (
        id TEXT PRIMARY KEY,
        source_name TEXT NOT NULL,
        source_type TEXT,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        applied_at TEXT
      )
    `);
    database.exec(`
      CREATE TABLE import_source_rows (
        id TEXT PRIMARY KEY,
        batch_id TEXT NOT NULL,
        import_file_id TEXT NOT NULL,
        sheet_name TEXT NOT NULL
      )
    `);
    database.prepare('INSERT INTO import_batches (id, source_name, source_type, status, created_at, applied_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run('batch-classification', 'Detalles de equipos en contrato.xlsx', 'classification', 'applied', '2026-09-15T08:00:00.000Z', '2026-09-15T08:01:00.000Z');

    const coverage = getSourceCoverage(database);
    expect(coverage.find((item) => item.id === 'fleet.equipment')?.imported.total).toBe(0);
    expect(coverage.find((item) => item.id === 'fleet.customer-classification')?.imported.total).toBe(1);
    database.close();
  });

  it('routes Detalle de equipos en/con contrato exports to the classification card', () => {
    for (const name of ['Detalle de Equipos con Contrato.xlsx', 'Detalles de equipos en contrato.xlsx']) {
      expect(isEquipmentDetailExport(name)).toBe(true);
    }
    for (const name of ['Equipos en contrato.xlsx', '20260729_163807.xlsx', 'Clasificación de clientes.xlsx']) {
      expect(isEquipmentDetailExport(name)).toBe(false);
    }
  });

  it('keeps only the newest batch of a card listing', () => {
    const batches = [
      { id: 'a', createdAt: '2026-09-23T10:01:00.000Z' },
      { id: 'b', createdAt: '2026-10-07T09:50:00.000Z' },
      { id: 'c', createdAt: '2026-09-18T11:26:00.000Z' },
    ];
    expect(latestBatch(batches).map((batch) => batch.id)).toEqual(['b']);
    expect(latestBatch([])).toEqual([]);
  });

  it('uses the import domain for historical batches without a source type', () => {
    const database = new Database(':memory:');
    database.exec(`
      CREATE TABLE import_batches (
        id TEXT PRIMARY KEY,
        domain TEXT NOT NULL,
        source_name TEXT NOT NULL,
        source_type TEXT,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        applied_at TEXT
      )
    `);
    database.exec(`
      CREATE TABLE import_source_rows (
        id TEXT PRIMARY KEY,
        batch_id TEXT NOT NULL,
        import_file_id TEXT NOT NULL,
        sheet_name TEXT NOT NULL
      )
    `);
    database.prepare('INSERT INTO import_batches (id, domain, source_name, source_type, status, created_at, applied_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run('batch-legacy-fleet', 'operations', '20260805_184249.xlsx', null, 'applied', '2026-08-05T18:42:49.000Z', '2026-08-05T18:43:00.000Z');

    const coverage = getSourceCoverage(database);
    expect(coverage.find((item) => item.id === 'fleet.equipment')?.imported.total).toBe(1);
    expect(coverage.find((item) => item.id === 'fleet.customer-classification')?.imported.total).toBe(0);
    database.close();
  });

  it('documents the normalized field bridge for every Consumibles source', () => {
    const consumiblesSources = SOURCE_CATALOG.filter((source) => source.moduleIds.includes('consumibles'));

    expect(consumiblesSources).toHaveLength(9);
    expect(consumiblesSources.every((source) => (source.normalizedFields?.length ?? 0) > 0)).toBe(true);

    const usage = consumiblesSources.find((source) => source.id === 'consumibles.parts-usage');
    expect(usage?.normalizedFields).toContainEqual({
      source: 'Precio unitario PYG / total PYG',
      target: 'Costo normalizado y referencia PYG',
    });
  });

  it('marks the two legacy Proformas catalogs as partially recovered', () => {
    for (const id of ['proformas.catalog-consumables', 'proformas.catalog-parts']) {
      const source = SOURCE_CATALOG.find((item) => item.id === id);
      expect(source?.support).toBe('partial');
      expect(source?.supportNote).toContain('planilla separada');
      expect(source?.supportNote).toContain('XLSX original');
    }

    const consumables = SOURCE_CATALOG.find((item) => item.id === 'proformas.catalog-consumables');
    expect(sourceMatchesDefinition(consumables!, 'archivo-renombrado.xlsx', 'proformas-catalog-consumibles')).toBe(true);
  });

  it('documents the four legacy Descontinuador sources and their field bridges', () => {
    const sourceIds = ['fleet.equipment', 'fleet.customer-classification', 'discontinuation.canon', 'discontinuation.waldbott'];
    const sources = SOURCE_CATALOG.filter((source) => sourceIds.includes(source.id));

    expect(sources).toHaveLength(4);
    expect(sources.every((source) => source.origin.length > 0 && (source.normalizedFields?.length ?? 0) > 0)).toBe(true);
    expect(sources.find((source) => source.id === 'fleet.equipment')?.expectedFiles).toEqual(['Equipos en contrato.xlsx']);
    expect(sources.find((source) => source.id === 'fleet.equipment')?.origin).toBe('Superset > SGS – Contratos/Equipos en contratos');
    expect(sources.find((source) => source.id === 'fleet.customer-classification')?.origin).toContain('SGS Equipos vs Contratos');
    expect(sources.find((source) => source.id === 'discontinuation.canon')?.origin).toContain('no documenta una ruta');
    expect(sources.find((source) => source.id === 'discontinuation.canon')?.normalizedFields).toContainEqual({
      source: 'Voltage / Tensión',
      target: 'Tensión del modelo o repuesto',
    });
    expect(sources.find((source) => source.id === 'discontinuation.waldbott')?.normalizedFields).toContainEqual({
      source: 'Depósito / Deposits',
      target: 'Depósito 04',
    });
  });

  it('matches the four Descontinuador cards with their applied import batches', () => {
    const batches = [
      { sourceName: '20260729_163807.xlsx', sourceType: 'fleet.equipment', domain: 'operations', status: 'applied' },
      { sourceName: '20260805_184249.xlsx', sourceType: 'classification', domain: 'operations-fleet-classification', status: 'applied' },
      { sourceName: 'MODELOS DISCONTINUOS 2013 al 2030.xlsx', sourceType: null, domain: 'operations-canon', status: 'applied' },
      { sourceName: 'Equipos en Contratos y en Dpto MRA.xlsx', sourceType: null, domain: 'operations-waldbott', status: 'applied' },
    ] as const;
    const sourceIds = ['fleet.equipment', 'fleet.customer-classification', 'discontinuation.canon', 'discontinuation.waldbott'];

    expect(sourceIds.map((sourceId) => {
      const source = SOURCE_CATALOG.find((item) => item.id === sourceId)!;
      return batches.filter((batch) => batch.status === 'applied' && sourceMatchesDefinition(source, batch.sourceName, batch.sourceType, batch.domain)).map((batch) => batch.sourceName);
    })).toEqual([
      ['20260729_163807.xlsx'],
      ['20260805_184249.xlsx'],
      ['MODELOS DISCONTINUOS 2013 al 2030.xlsx'],
      ['Equipos en Contratos y en Dpto MRA.xlsx'],
    ]);
  });

  it('documents the shared price-list source and its commercial field bridge', () => {
    const source = SOURCE_CATALOG.find((item) => item.id === 'catalog.shared');

    expect(source?.origin).toContain('extraído de Waldbott');
    expect(source?.normalizedFields).toContainEqual({
      source: 'Código / N° de parte',
      target: 'Parte comercial',
    });
    expect(source?.support).toBe('complete');
    expect(source?.supportNote).toContain('semilla heredada de 13 familias');
    expect(sourceMatchesDefinition(source!, 'semilla.json', 'catalog-seed')).toBe(true);
  });
});
