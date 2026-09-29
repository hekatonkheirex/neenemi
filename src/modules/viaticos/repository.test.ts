import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { openDatabase } from '../../db/database';
import { ImportRepository } from '../../db/repositories';
import { DEFAULT_TRAVEL_COST_CATALOG } from './catalog';
import { TravelRepository } from './repository';
import type { ParsedTravelTrip } from './types';

const temporaryDirectories: string[] = [];
const databases: Array<ReturnType<typeof openDatabase>> = [];

function makeTemporaryDatabase() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'datasystems-suite-travel-'));
  temporaryDirectories.push(directory);
  const database = openDatabase(path.join(directory, 'dcss.sqlite'));
  databases.push(database);
  return database;
}

afterEach(() => {
  for (const database of databases.splice(0)) database.close();
  for (const directory of temporaryDirectories.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
});

function makeTrip(overrides: Partial<ParsedTravelTrip> = {}): ParsedTravelTrip {
  const base = {
    recordedAt: '2026-08-04',
    serviceNumber: 'IS-100',
    customerName: 'Cliente Viajes',
    destination: 'CDE',
    transport: 'MOVIL PROPIO' as const,
    technician: 'Tec Uno',
    driver: 'S/CHOFER',
    advance: 0,
    allowance: 130000,
    lodging: 0,
    tolls: 146000,
    otherCost: 0,
    vehiclePayment: 60000,
    technicianPayment: 90000,
    distanceKm: 320,
    fuelCost: 80000,
    notes: '',
    source: 'xlsx' as const,
    sourceRecordKey: '2026-08-04|is-100|cliente viajes|cde|movil propio',
    sourceRow: 2,
    sourceSheetName: 'VIAJES2026',
    sourceOperational: {
      serviceCostBase: '223125',
      mobile: 'PROPIO',
      averageConsumptionPer100Km: '10',
      fuelCostPerLiter: '8260',
      serviceCostCalculated: '359002',
      totalServiceCost: '400000',
      totalFuelCost: '106000',
      serviceCostAllocation: '359002',
    },
    totalCost: 506000,
  } satisfies ParsedTravelTrip;
  return { ...base, ...overrides };
}

describe('TravelRepository', () => {
  it('stores imported trips, deduplicates rows and preserves the cost catalog', () => {
    const database = makeTemporaryDatabase();
    const imports = new ImportRepository(database);
    const batchId = imports.createBatch({ domain: 'viaticos', sourceName: 'CONTROL DE VIATICO 2026.xlsx' });
    const repository = new TravelRepository(database);

    expect(repository.importRows(batchId, 'CONTROL DE VIATICO 2026.xlsx', [
      makeTrip(),
      makeTrip(),
      makeTrip({ serviceNumber: 'IS-101', sourceRecordKey: '2026-08-05|is-101|cliente viajes|cde|bus', transport: 'BUS', recordedAt: '2026-08-05', totalCost: 110000 }),
    ])).toEqual({
      sourceType: 'viaticos',
      accepted: 2,
      duplicates: 1,
      historicalSnapshots: 0,
      sourceSheets: 1,
    });
    expect(repository.getCostCatalog().dailyAllowance).toBe(130000);
    expect(repository.getSummary()).toMatchObject({
      operationalYear: 2026,
      records: 2,
      totalCost: 616000,
      pending: 0,
      review: 0,
      approved: 2,
      firstDate: '2026-08-04',
      lastDate: '2026-08-05',
      monthlyTotals: [0, 0, 0, 0, 0, 0, 0, 616000, 0, 0, 0, 0],
      transportTotals: [
        { key: 'MOVIL PROPIO', records: 1, totalCost: 506000 },
        { key: 'BUS', records: 1, totalCost: 110000 },
      ],
      topDestinations: [{ destination: 'CDE', records: 2, totalCost: 616000 }],
    });
    expect(repository.list({ query: 'cliente viajes', transport: 'BUS', limit: 10 })).toEqual([
      expect.objectContaining({ serviceNumber: 'IS-101', destination: 'CDE', totalCost: 110000, sourceSheetName: 'VIAJES2026', sourceRowNumber: 2 }),
    ]);
    expect(repository.list({ query: '8260', limit: 10 })).toEqual(expect.arrayContaining([
      expect.objectContaining({ sourceOperational: expect.objectContaining({ fuelCostPerLiter: '8260' }) }),
    ]));
    const created = repository.saveTrip({
      recordedAt: '2026-09-10',
      serviceNumber: 'IS-MANUAL',
      customerName: 'Cliente Manual',
      destination: 'Encarnación',
      transport: 'BUS',
      technician: 'Tec Dos',
      driver: 'C/CHOFER',
      advance: 0,
      allowance: 100000,
      lodging: 0,
      tolls: 0,
      otherCost: 120000,
      vehiclePayment: 0,
      technicianPayment: 0,
      distanceKm: 0,
      fuelCost: 0,
      notes: 'Comprobante pendiente',
    });
    expect(created.source).toBe('manual');
    expect(created.status).toBe('pending');
    expect(created.totalCost).toBe(220000);
    expect(repository.updateStatus(created.id, 'review').status).toBe('review');
    expect(repository.deleteTrip(created.id)).toBe(true);
    expect(repository.get(created.id)).toBeUndefined();
  });

  it('refreshes an outdated cost catalog once and keeps the current parser revision', () => {
    const database = makeTemporaryDatabase();
    const imports = new ImportRepository(database);
    const batchId = imports.createBatch({ domain: 'viaticos', sourceName: 'CONTROL DE VIATICO 2026.xlsx' });
    const repository = new TravelRepository(database);
    repository.importRows(batchId, 'CONTROL DE VIATICO 2026.xlsx', [makeTrip()]);

    const updatedCatalog = {
      ...DEFAULT_TRAVEL_COST_CATALOG,
      dailyAllowance: 150000,
    };
    database.prepare('UPDATE travel_cost_catalog SET parser_revision = 1').run();

    expect(repository.needsCostCatalogRefresh(batchId)).toBe(true);
    expect(repository.refreshCostCatalog(batchId, updatedCatalog)).toBe(true);
    expect(repository.needsCostCatalogRefresh(batchId)).toBe(false);
    expect(repository.getCostCatalog()).toEqual(updatedCatalog);
    expect(repository.refreshCostCatalog(batchId, updatedCatalog)).toBe(false);
  });

  it('returns every trip when no limit is requested while keeping explicit limits', () => {
    const database = makeTemporaryDatabase();
    const imports = new ImportRepository(database);
    const batchId = imports.createBatch({ domain: 'viaticos', sourceName: 'viajes-completos.xlsx' });
    const repository = new TravelRepository(database);
    const trips = Array.from({ length: 501 }, (_, index) => makeTrip({
      serviceNumber: `IS-${index + 1}`,
      customerName: `Cliente ${index + 1}`,
      sourceRecordKey: `2026-08-04|is-${index + 1}|cliente-${index + 1}|cde|movil propio`,
      sourceRow: index + 2,
    }));

    expect(repository.importRows(batchId, 'viajes-completos.xlsx', trips).accepted).toBe(501);
    expect(repository.list()).toHaveLength(501);
    expect(repository.list({ limit: 10 })).toHaveLength(10);
  });

  it('preserves negative advances from imported accounting adjustments', () => {
    const database = makeTemporaryDatabase();
    const imports = new ImportRepository(database);
    const batchId = imports.createBatch({ domain: 'viaticos', sourceName: 'CONTROL DE VIATICO 2026.xlsx' });
    const repository = new TravelRepository(database);

    const result = repository.importRows(batchId, 'CONTROL DE VIATICO 2026.xlsx', [
      makeTrip({
        serviceNumber: 'IS-NEGATIVE-ADVANCE',
        sourceRecordKey: '2026-08-04|is-negative-advance|cliente viajes|cde|movil propio',
        advance: -139900,
      }),
    ]);

    expect(result.accepted).toBe(1);
    expect(repository.list({ limit: 1 })[0]).toEqual(expect.objectContaining({ advance: -139900 }));
  });

  it('replaces an imported source while preserving manual trips and local rendition state', () => {
    const database = makeTemporaryDatabase();
    const imports = new ImportRepository(database);
    const originalBatchId = imports.createBatch({ domain: 'viaticos', sourceName: 'viajes-original.xlsx' });
    const repository = new TravelRepository(database);

    repository.importRows(originalBatchId, 'viajes-original.xlsx', [makeTrip()]);
    const importedId = (database.prepare('SELECT id FROM travel_trips WHERE source_batch_id = ?').get(originalBatchId) as { id: string }).id;
    repository.updateStatus(importedId, 'review');
    repository.saveTrip({
      recordedAt: '2026-09-10',
      serviceNumber: 'IS-MANUAL',
      customerName: 'Cliente Manual',
      destination: 'Encarnación',
      transport: 'BUS',
      technician: 'Tec Dos',
      driver: 'C/CHOFER',
      advance: 0,
      allowance: 100000,
      lodging: 0,
      tolls: 0,
      otherCost: 120000,
      vehiclePayment: 0,
      technicianPayment: 0,
      distanceKm: 0,
      fuelCost: 0,
      notes: 'Manual',
    });

    const replacementBatchId = imports.createBatch({ domain: 'viaticos', sourceName: 'viajes-corregido.xlsx' });
    const result = repository.importRows(
      replacementBatchId,
      'viajes-corregido.xlsx',
      [makeTrip({ destination: 'Luque' })],
      [],
      DEFAULT_TRAVEL_COST_CATALOG,
      1,
      originalBatchId,
    );

    expect(result.accepted).toBe(1);
    expect(imports.getBatch(originalBatchId)).toBeUndefined();
    expect(imports.getBatch(replacementBatchId)).toEqual(expect.objectContaining({ status: 'applied' }));
    expect(repository.list({ query: 'cliente viajes', limit: 10 })).toEqual([
      expect.objectContaining({ destination: 'Luque', status: 'review', sourceBatchId: replacementBatchId }),
    ]);
    expect(repository.list({ query: 'cliente manual', limit: 10 })).toEqual([
      expect.objectContaining({ source: 'manual', notes: 'Manual' }),
    ]);
  });
});
