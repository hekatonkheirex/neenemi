import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { openDatabase } from '../../db/database';
import { ImportRepository } from '../../db/repositories';
import { CatalogRepository, type CatalogPartInput } from '../catalogo/repository';
import { calculateSalePrice, SalesRepository } from './repository';
import type { OpenContractSnapshot, SalesCatalogSnapshot } from './types';

const temporaryDirectories: string[] = [];

function makeDatabase() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'datasystems-suite-sales-'));
  temporaryDirectories.push(directory);
  return openDatabase(path.join(directory, 'suite.sqlite'));
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

const part: CatalogPartInput = {
  brand: 'Canon',
  code: 'FK-123',
  description: 'KIT DE MANTENIMIENTO',
  models: ['iR ADV C3325i'],
  stock: 7,
  priceUsd: 12.5,
  priceLocal: 79375,
  markup: 0,
  discontinuedAt: null,
};

describe('SalesRepository', () => {
  it('calculates a rounded local sale price from shared catalog data', () => {
    expect(calculateSalePrice({ priceUsd: 12.5 }, {
      exchangeRate: 10000,
      factor: 2,
      laborPrice: 90000,
    })).toEqual({ salePriceUsd: 25, salePriceLocal: 250000 });
  });

  it('uses the local planilla value without presenting it as a calculated USD price', () => {
    expect(calculateSalePrice({ priceUsd: 0, priceLocal: 135500, costAvailable: false }, {
      exchangeRate: 10000,
      factor: 2,
      laborPrice: 90000,
    })).toEqual({ salePriceUsd: 0, salePriceLocal: 135500 });
  });

  it('uses the family exchange rate and factor when listing a family from the legacy catalog', () => {
    const database = makeDatabase();
    const imports = new ImportRepository(database);
    const catalog = new CatalogRepository(database);
    const sales = new SalesRepository(database);
    const batchId = imports.createBatch({ domain: 'catalog', sourceName: 'semilla-heredada.json' });
    catalog.replaceFromBatch(batchId, [part], {
      modelFamilies: [{
        brand: 'Canon',
        familyName: 'iR',
        modelName: 'iR ADV C3325i',
        exchangeRate: 6080,
        factor: 1.8,
      }],
    });
    sales.savePricing({ exchangeRate: 5980, factor: 1.5, laborPrice: 90000 });

    expect(sales.listPrice({ familyName: 'iR' })).toEqual([
      expect.objectContaining({ code: 'FK-123', salePriceUsd: 22.5, salePriceLocal: 136800 }),
    ]);
    expect(sales.listPrice({})).toEqual([
      expect.objectContaining({ code: 'FK-123', salePriceUsd: 18.75, salePriceLocal: 112100 }),
    ]);
    database.close();
  });

  it('persists a family exchange-rate override and uses it for the active family', () => {
    const database = makeDatabase();
    const imports = new ImportRepository(database);
    const catalog = new CatalogRepository(database);
    const sales = new SalesRepository(database);
    const batchId = imports.createBatch({ domain: 'catalog', sourceName: 'semilla-heredada.json' });
    catalog.replaceFromBatch(batchId, [part], {
      modelFamilies: [{
        brand: 'Canon',
        familyName: 'iR',
        modelName: 'iR ADV C3325i',
        exchangeRate: 6080,
        factor: 1.8,
      }],
    });

    const saved = sales.savePricing({
      exchangeRate: 5980,
      factor: 1.5,
      laborPrice: 90000,
      familyExchangeRateOverrides: { iR: 7000, 'familia inválida': -1 },
    });

    expect(saved.familyExchangeRateOverrides).toEqual({ IR: 7000 });
    expect(sales.listPrice({ familyName: 'iR' })).toEqual([
      expect.objectContaining({ code: 'FK-123', salePriceUsd: 22.5, salePriceLocal: 157500 }),
    ]);
    database.close();
  });

  it('uses one catalog and persists pricing rules and proformas', () => {
    const database = makeDatabase();
    const imports = new ImportRepository(database);
    const catalog = new CatalogRepository(database);
    const sales = new SalesRepository(database);
    const batchId = imports.createBatch({ domain: 'catalog', sourceName: 'catalogo.xlsx' });
    catalog.replaceFromBatch(batchId, [part]);

    expect(sales.savePricing({ exchangeRate: 10000, factor: 2, laborPrice: 90000 })).toEqual({
      exchangeRate: 10000,
      factor: 2,
      laborPrice: 90000,
    });
    expect(sales.getPriceListSelection()).toEqual([]);
    expect(sales.savePriceListSelection(['iR ADV C5535i', 'iR ADV C3325i', 'iR ADV C5535i'])).toEqual([
      'iR ADV C3325i',
      'iR ADV C5535i',
    ]);
    expect(sales.getPriceListSelection()).toEqual(['iR ADV C3325i', 'iR ADV C5535i']);
    expect(sales.listPrice({ query: 'FK123' })).toEqual([
      expect.objectContaining({ code: 'FK-123', salePriceUsd: 25, salePriceLocal: 250000 }),
    ]);

    const saved = sales.saveProforma({
      header: {
        customerName: 'Cliente de prueba',
        customerContact: '0981 000000',
        serviceReport: 'Mantenimiento preventivo',
        serviceReportNumber: '2921689',
        reference: 'TEST-001',
        issuedAt: '2026-09-10T12:00:00.000Z',
        attendedBy: 'Ventas',
        modelName: 'iR ADV C3325i',
        serialNumber: 'ABC123',
        mode: 'sin-contrato',
      },
      lines: [
        { kind: 'part', partId: catalog.list({})[0].id, quantity: 2 },
        { kind: 'labor', description: 'Instalación', costLocal: 50000, unitPriceLocal: 90000, quantity: 1 },
      ],
    });

    expect(saved.totalLocal).toBe(590000);
    expect(saved.lines).toHaveLength(2);
    expect(saved.lines[0]).toMatchObject({ sourceStock: 7, sourceDiscontinuedStatus: 'unknown' });
    expect(saved.lines[1]).toMatchObject({ kind: 'labor', costLocal: 50000, unitPriceLocal: 90000 });
    expect(sales.getProforma(saved.id)).toMatchObject({
      id: saved.id,
      customerName: 'Cliente de prueba',
      reference: 'TEST-001',
      totalLocal: 590000,
    });
    expect(sales.listProformas()).toEqual([
      expect.objectContaining({ id: saved.id, customerName: 'Cliente de prueba', currency: 'PYG', totalLocal: 590000, totalUsd: 50 }),
    ]);

    database.close();
  });

  it('persists a contract list and saves fixed-price proforma lines without a shared part id', () => {
    const database = makeDatabase();
    const imports = new ImportRepository(database);
    const sales = new SalesRepository(database);
    const batchId = imports.createBatch({ domain: 'sales-open-contract', sourceName: 'contrato-abierto.xlsx', sourceType: 'open-contract' });
    const sourceFileId = imports.addFile({
      batchId,
      fileName: 'contrato-abierto.xlsx',
      storedPath: 'imports/contrato-abierto.xlsx',
      contentHash: 'hash-contrato',
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      sizeBytes: 128,
    });
    const snapshot: OpenContractSnapshot = {
      meta: {
        fileName: 'contrato-abierto.xlsx',
        updatedAt: '2026-09-14T12:00:00.000Z',
        rowCount: 1,
        invalidRows: 0,
        duplicateRows: 0,
        sourceFormat: 'xlsx',
        priceCurrency: 'local',
        hasKindColumn: true,
        sourceBatchId: batchId,
      },
      items: [{
        id: 'contrato-FIJO-1',
        kind: 'repuestos',
        code: 'FIJO-1',
        description: 'Repuesto contractual',
        group: 'Repuestos',
        priceUsd: null,
        priceLocal: 125000,
      }],
    };

    expect(sales.saveOpenContract(snapshot)).toMatchObject({ meta: { rowCount: 1, sourceBatchId: batchId, sourceFileId }, items: [{ code: 'FIJO-1' }] });
    expect(sales.getOpenContract()).toMatchObject({ meta: { fileName: 'contrato-abierto.xlsx', sourceFileId } });

    const saved = sales.saveProforma({
      header: {
        customerName: 'Cliente contractual',
        customerContact: '',
        serviceReport: '',
        serviceReportNumber: '',
        reference: 'CON-001',
        issuedAt: '2026-09-14T12:00:00.000Z',
        attendedBy: '',
        modelName: '',
        serialNumber: '',
        mode: 'contrato-abierto',
      },
      lines: [{
        kind: 'part',
        catalogKind: 'repuestos',
        code: 'FIJO-1',
        description: 'Repuesto contractual',
        unitPriceLocal: 125000,
        quantity: 2,
      }],
    });

    expect(saved.lines).toEqual([
      expect.objectContaining({
        partId: null,
        catalogKind: 'repuestos',
        code: 'FIJO-1',
        unitPriceLocal: 125000,
        lineTotalLocal: 250000,
      }),
    ]);
    expect(saved.totalLocal).toBe(250000);
    database.close();
  });

  it('persists the selected USD currency and keeps the local equivalent for totals', () => {
    const database = makeDatabase();
    const sales = new SalesRepository(database);

    const saved = sales.saveProforma({
      currency: 'USD',
      header: {
        customerName: 'Cliente USD',
        customerContact: '',
        serviceReport: '',
        serviceReportNumber: '',
        reference: 'CON-USD',
        issuedAt: '2026-09-14T12:00:00.000Z',
        attendedBy: '',
        modelName: '',
        serialNumber: '',
        mode: 'contrato-abierto',
      },
      lines: [{
        kind: 'part',
        source: 'contract',
        catalogKind: 'repuestos',
        code: 'USD-1',
        description: 'Repuesto contractual USD',
        unitPriceUsd: 12.5,
        unitPriceLocal: null,
        quantity: 2,
      }, {
        kind: 'labor',
        description: 'Instalación',
        unitPriceUsd: 10,
        unitPriceLocal: null,
        quantity: 1,
      }],
    });

    expect(saved.currency).toBe('USD');
    expect(saved.lines[0]).toMatchObject({ unitPriceUsd: 12.5, unitPriceLocal: 74800, lineTotalLocal: 149600 });
    expect(saved.lines[1]).toMatchObject({ unitPriceUsd: 10, unitPriceLocal: 59800, lineTotalLocal: 59800 });
    expect(saved.totalLocal).toBe(209400);
    expect(sales.listProformas()).toEqual([
      expect.objectContaining({ id: saved.id, currency: 'USD', totalLocal: 209400, totalUsd: 35 }),
    ]);
    database.close();
  });

  it('persists separate Proformas catalogs and saves their fixed prices without a shared part id', () => {
    const database = makeDatabase();
    const imports = new ImportRepository(database);
    const sales = new SalesRepository(database);
    const batchId = imports.createBatch({ domain: 'sales-catalog', sourceName: 'CONSUMIBLES_SISTEMA_ING.xlsx', sourceType: 'proformas-catalog-consumibles' });
    const sourceFileId = imports.addFile({
      batchId,
      fileName: 'CONSUMIBLES_SISTEMA_ING.xlsx',
      storedPath: 'imports/CONSUMIBLES_SISTEMA_ING.xlsx',
      contentHash: 'hash-consumibles',
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      sizeBytes: 256,
    });
    const snapshot: SalesCatalogSnapshot = {
      meta: {
        kind: 'consumibles',
        fileName: 'CONSUMIBLES_SISTEMA_ING.xlsx',
        updatedAt: '2026-09-14T12:00:00.000Z',
        rowCount: 1,
        invalidRows: 0,
        duplicateRows: 0,
        hasDiscontinuedColumn: true,
        sourceBatchId: batchId,
      },
      items: [{
        id: 'proformas-consumibles-CEXV55',
        kind: 'consumibles',
        code: 'CEXV-55',
        description: 'Tóner negro',
        group: 'Tóner',
        priceUsd: 13,
        priceLocal: 77740,
        stock: 4,
        discontinued: 'active',
      }],
    };

    expect(sales.saveSalesCatalog(snapshot)).toMatchObject({ meta: { kind: 'consumibles', rowCount: 1, sourceBatchId: batchId, sourceFileId }, items: [{ code: 'CEXV-55' }] });
    expect(sales.getSalesCatalogs()).toMatchObject({ consumibles: { meta: { sourceFileId }, items: [{ code: 'CEXV-55' }] }, repuestos: null });

    const saved = sales.saveProforma({
      header: {
        customerName: 'Cliente sin contrato',
        customerContact: '',
        serviceReport: '',
        serviceReportNumber: '',
        reference: 'CAT-001',
        issuedAt: '2026-09-14T12:00:00.000Z',
        attendedBy: '',
        modelName: '',
        serialNumber: '',
        mode: 'sin-contrato',
      },
      lines: [{
        kind: 'part',
        catalogKind: 'consumibles',
        source: 'proformas',
        code: 'CEXV-55',
        description: 'Tóner negro',
        unitPriceUsd: 13,
        unitPriceLocal: 77740,
        quantity: 2,
      }],
    });

    expect(saved.lines).toEqual([
      expect.objectContaining({
        partId: null,
        catalogKind: 'consumibles',
        code: 'CEXV-55',
        unitPriceLocal: 77740,
        lineTotalLocal: 155480,
        sourceStock: 4,
        sourceDiscontinuedStatus: 'active',
      }),
    ]);
    expect(saved.totalLocal).toBe(155480);
    database.close();
  });
});
