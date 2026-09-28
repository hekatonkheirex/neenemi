import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { openDatabase } from '../../db/database';
import { ImportRepository } from '../../db/repositories';
import {
  CatalogRepository,
  type CatalogModelFamilyInput,
  type CatalogPartInput,
  type CatalogModelNoteInput,
  type CatalogServiceItemInput,
} from './repository';

const temporaryDirectories: string[] = [];

function makeDatabase() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'datasystems-suite-catalog-'));
  temporaryDirectories.push(directory);
  return openDatabase(path.join(directory, 'suite.sqlite'));
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

const catalogParts: CatalogPartInput[] = [
  {
    brand: 'Canon',
    code: ' FK-123 ',
    description: 'KIT DE MANTENIMIENTO iR ADV C3325i',
    models: ['iR ADV C3325i'],
    stock: 7,
    priceUsd: 12.5,
    priceLocal: 79375,
    markup: 0,
    discontinuedAt: null,
    group: 'GPR-53',
    reference: 'REF-123',
    usefulLife: '50.000 páginas',
  },
  {
    brand: 'Canon',
    code: 'FC-456',
    description: 'RODILLO DE ARRASTRE',
    models: ['iR ADV C3325i'],
    stock: 0,
    priceUsd: 4,
    priceLocal: 25400,
    markup: 0,
    discontinuedAt: '2026-01-10',
  },
];

const catalogServiceItems: CatalogServiceItemInput[] = [
  {
    brand: 'Canon',
    familyName: 'iR ADV',
    modelName: 'iR ADV C3325i',
    kind: 'labor',
    description: 'Mano de obra por cambio de kit',
    fixedPriceLocal: null,
  },
  {
    brand: 'Canon',
    familyName: 'iR ADV',
    modelName: 'iR ADV C3325i',
    kind: 'fixed',
    description: 'Mantenimiento preventivo',
    fixedPriceLocal: 320000,
  },
];

const catalogModelNotes: CatalogModelNoteInput[] = [{
  brand: 'Canon',
  familyName: 'iR ADV',
  modelName: 'iR ADV C3325i',
  note: 'Usa tóner de alta capacidad.',
}];

const catalogModelFamilies: CatalogModelFamilyInput[] = [
  {
    brand: 'Canon',
    familyName: 'iR ADV',
    modelName: 'iR ADV C3325i',
  },
  {
    brand: 'Canon',
    familyName: 'iR ADV',
    modelName: 'iR ADV C5535i',
  },
];

describe('CatalogRepository', () => {
  it('stores a catalog import once and exposes shared search fields', () => {
    const database = makeDatabase();
    const imports = new ImportRepository(database);
    const batchId = imports.createBatch({ domain: 'catalog', sourceName: 'catalogo.xlsx' });
    const catalog = new CatalogRepository(database);

    expect(catalog.replaceFromBatch(batchId, catalogParts)).toEqual({ parts: 2, models: 1 });

    expect(catalog.list({ query: 'fk123', stockOnly: true })).toEqual([
      expect.objectContaining({
        brand: 'Canon',
        code: 'FK-123',
        stock: 7,
        priceUsd: 12.5,
        priceLocal: 79375,
        discontinuedAt: null,
        models: ['iR ADV C3325i'],
        group: 'GPR-53',
        reference: 'REF-123',
        usefulLife: '50.000 páginas',
      }),
    ]);

    expect(catalog.list({ modelName: 'iR ADV C3325i' })).toHaveLength(2);
    expect(catalog.list({ stockOnly: true })).toHaveLength(1);
    expect(catalog.list({ excludeDiscontinued: true })).toHaveLength(1);
    database.close();
  });

  it('filters parts by a case-insensitive partial model name', () => {
    const database = makeDatabase();
    const imports = new ImportRepository(database);
    const batchId = imports.createBatch({ domain: 'catalog', sourceName: 'catalogo.xlsx' });
    const catalog = new CatalogRepository(database);

    catalog.replaceFromBatch(batchId, [
      ...catalogParts,
      {
        brand: 'Canon',
        code: 'IPF-830-001',
        description: 'Cabezal de impresión IPF 830',
        models: ['iPF 830'],
        stock: 2,
        priceUsd: 18,
        priceLocal: 114300,
        markup: 0,
        discontinuedAt: null,
      },
    ]);

    expect(catalog.list({ modelName: 'IPF' })).toEqual([
      expect.objectContaining({ code: 'IPF-830-001', models: ['iPF 830'] }),
    ]);
    expect(catalog.list({ modelName: 'ipf 830' })).toHaveLength(1);
    expect(catalog.list({ modelName: 'IR ADV' })).toHaveLength(2);
    database.close();
  });

  it('can hide source rows without a Canon model association', () => {
    const database = makeDatabase();
    const imports = new ImportRepository(database);
    const batchId = imports.createBatch({ domain: 'catalog', sourceName: 'catalogo.xlsx' });
    const catalog = new CatalogRepository(database);

    catalog.replaceFromBatch(batchId, [
      ...catalogParts,
      {
        brand: 'Canon',
        code: 'UNLINKED-001',
        description: 'Fila histórica sin modelo',
        models: [],
        stock: 0,
        priceUsd: 0,
        priceLocal: 0,
        markup: 0,
        discontinuedAt: null,
      },
    ]);

    expect(catalog.list({ modelLinkedOnly: true }).map((part) => part.code)).toEqual(['FC-456', 'FK-123']);
    expect(catalog.list({}).map((part) => part.code)).toEqual(['FC-456', 'FK-123', 'UNLINKED-001']);
    database.close();
  });

  it('returns the original file for the latest applied catalog import', () => {
    const database = makeDatabase();
    const imports = new ImportRepository(database);
    const catalog = new CatalogRepository(database);
    const batchId = imports.createBatch({ domain: 'catalog', sourceName: 'catalogo.xlsx' });
    const fileId = imports.addFile({
      batchId,
      fileName: 'catalogo.xlsx',
      storedPath: 'imports/catalogo.xlsx',
      contentHash: 'catalog-hash',
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      sizeBytes: 256,
    });

    catalog.replaceFromBatch(batchId, catalogParts.slice(0, 1));

    expect(catalog.getLatestSourceFile()).toMatchObject({
      batchId,
      fileId,
      fileName: 'catalogo.xlsx',
    });
    database.close();
  });

  it('replaces the same batch without duplicating prices or model links', () => {
    const database = makeDatabase();
    const imports = new ImportRepository(database);
    const batchId = imports.createBatch({ domain: 'catalog', sourceName: 'catalogo.xlsx' });
    const catalog = new CatalogRepository(database);

    catalog.replaceFromBatch(batchId, [catalogParts[0]]);
    catalog.replaceFromBatch(batchId, [{ ...catalogParts[0], priceUsd: 13, priceLocal: 82550 }]);

    expect(catalog.list({})).toEqual([
      expect.objectContaining({ priceUsd: 13, priceLocal: 82550, models: ['iR ADV C3325i'] }),
    ]);
    expect(database.prepare('SELECT COUNT(*) AS count FROM part_prices').get()).toEqual({ count: 2 });
    expect(database.prepare('SELECT COUNT(*) AS count FROM part_model').get()).toEqual({ count: 1 });
    database.close();
  });

  it('persists when the source price is only a local planilla reference', () => {
    const database = makeDatabase();
    const imports = new ImportRepository(database);
    const batchId = imports.createBatch({ domain: 'catalog', sourceName: 'listado.json' });
    const catalog = new CatalogRepository(database);

    catalog.replaceFromBatch(batchId, [{
      ...catalogParts[0],
      code: 'FK-999',
      priceUsd: 0,
      priceLocal: 135500,
      costAvailable: false,
    }]);

    expect(catalog.list({})).toEqual([
      expect.objectContaining({ code: 'FK-999', costAvailable: false, priceUsd: 0, priceLocal: 135500 }),
    ]);
    database.close();
  });

  it('can replace only the shared Canon catalog when restoring a seed', () => {
    const database = makeDatabase();
    const imports = new ImportRepository(database);
    const catalog = new CatalogRepository(database);
    const firstBatchId = imports.createBatch({ domain: 'catalog', sourceName: 'catalogo-personalizado.xlsx' });
    const seedBatchId = imports.createBatch({ domain: 'catalog', sourceName: 'semilla-heredada.json', sourceType: 'catalog-seed' });

    catalog.replaceFromBatch(firstBatchId, catalogParts);
    catalog.replaceFromBatch(seedBatchId, [{
      ...catalogParts[0],
      code: 'SEED-001',
      description: 'Parte de semilla heredada',
    }], { replaceAll: true });

    expect(catalog.list({})).toEqual([
      expect.objectContaining({ code: 'SEED-001', description: 'Parte de semilla heredada' }),
    ]);
    expect(database.prepare('SELECT COUNT(*) AS count FROM parts').get()).toEqual({ count: 1 });
    database.close();
  });

  it('stores legacy service rows and model notes with their import source', () => {
    const database = makeDatabase();
    const imports = new ImportRepository(database);
    const batchId = imports.createBatch({ domain: 'catalog', sourceName: 'semilla-heredada.json', sourceType: 'catalog-seed' });
    const catalog = new CatalogRepository(database);

    catalog.replaceFromBatch(batchId, catalogParts, {
      modelNotes: catalogModelNotes,
      serviceItems: catalogServiceItems,
      modelFamilies: catalogModelFamilies,
    });

    expect(catalog.listServiceItems()).toEqual([
      expect.objectContaining({ kind: 'labor', description: 'Mano de obra por cambio de kit', fixedPriceLocal: null, sourceName: 'semilla-heredada.json' }),
      expect.objectContaining({ kind: 'fixed', description: 'Mantenimiento preventivo', fixedPriceLocal: 320000 }),
    ]);
    expect(catalog.listServiceItems({ query: 'preventivo' })).toHaveLength(1);
    expect(catalog.listServiceItems({ modelName: 'ir adv c3325i' })).toHaveLength(2);
    expect(catalog.listServiceItems({ modelName: 'IR ADV' })).toHaveLength(2);
    expect(catalog.listModelNotes()).toEqual([
      expect.objectContaining({ modelName: 'iR ADV C3325i', note: 'Usa tóner de alta capacidad.', sourceBatchId: batchId }),
    ]);
    expect(catalog.listFamilySummaries()).toEqual([
      {
        familyName: 'iR ADV',
        modelNames: ['iR ADV C3325i', 'iR ADV C5535i'],
        serviceItemCount: 2,
        noteCount: 1,
        exchangeRate: null,
        factor: null,
      },
    ]);

    database.close();
  });

  it('stores family pricing metadata and filters the shared catalog by family', () => {
    const database = makeDatabase();
    const imports = new ImportRepository(database);
    const batchId = imports.createBatch({ domain: 'catalog', sourceName: 'semilla-heredada.json' });
    const catalog = new CatalogRepository(database);

    catalog.replaceFromBatch(batchId, [catalogParts[0]], {
      modelFamilies: [{
        brand: 'Canon',
        familyName: 'iR',
        modelName: 'iR ADV C3325i',
        exchangeRate: 6080,
        factor: 1.8,
      }],
    });

    expect(catalog.getFamilyPricing('ir')).toEqual({ exchangeRate: 6080, factor: 1.8 });
    expect(catalog.list({ familyName: 'iR' })).toEqual([
      expect.objectContaining({ code: 'FK-123', models: ['iR ADV C3325i'] }),
    ]);
    expect(catalog.listFamilySummaries()).toEqual([{
      familyName: 'iR',
      modelNames: ['iR ADV C3325i'],
      serviceItemCount: 0,
      noteCount: 0,
      exchangeRate: 6080,
      factor: 1.8,
    }]);

    database.close();
  });
});
