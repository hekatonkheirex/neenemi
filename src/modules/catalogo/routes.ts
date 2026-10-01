import type { Express } from 'express';
import type { SuiteDatabase } from '../../db/database';
import { isNonEmptyString, isNonNegativeInteger, isNonNegativeNumber, isOptionalNonNegativeNumber, isRecord, queryString } from '../../core/validation';
import {
  CatalogRepository,
  type CatalogModelFamilyInput,
  type CatalogModelNoteInput,
  type CatalogPartInput,
  type CatalogServiceItemInput,
} from './repository';

function isOptionalCatalogText(value: unknown): boolean {
  return value === undefined || value === null || isNonEmptyString(value) && value.length <= 500;
}


function parseOptionalCatalogText(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  return (value as string).trim();
}


function isOptionalPositiveNumber(value: unknown): value is number | null | undefined {
  return value === undefined || value === null || isNonNegativeNumber(value) && value > 0;
}


function parseOptionalPositiveNumber(value: unknown): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  return value as number;
}

function parseCatalogParts(value: unknown): CatalogPartInput[] | null {
  if (!Array.isArray(value)) return null;

  const parsed: CatalogPartInput[] = [];
  for (const item of value) {
    if (!isRecord(item)) return null;
    const models = item.models;
    const discontinuedAt = item.discontinuedAt;
    const legacyTextFields = ['group', 'reference', 'usefulLife'] as const;
    if (
      !isNonEmptyString(item.brand) ||
      typeof item.description !== 'string' ||
      !isNonEmptyString(item.code) ||
      !Array.isArray(models) ||
      !models.every(isNonEmptyString) ||
      !isNonNegativeInteger(item.stock) ||
      !isNonNegativeNumber(item.priceUsd) ||
      !isNonNegativeNumber(item.priceLocal) ||
      !isNonNegativeNumber(item.markup) ||
      (item.costAvailable !== undefined && typeof item.costAvailable !== 'boolean') ||
      (discontinuedAt !== null && discontinuedAt !== undefined && !isNonEmptyString(discontinuedAt))
      || !legacyTextFields.every((field) => isOptionalCatalogText(item[field]))
    ) {
      return null;
    }

    parsed.push({
      brand: item.brand,
      code: item.code,
      description: item.description,
      models,
      stock: item.stock,
      priceUsd: item.priceUsd,
      priceLocal: item.priceLocal,
      markup: item.markup,
      discontinuedAt: discontinuedAt === undefined ? null : discontinuedAt,
      costAvailable: item.costAvailable === undefined ? undefined : item.costAvailable,
      group: parseOptionalCatalogText(item.group),
      reference: parseOptionalCatalogText(item.reference),
      usefulLife: parseOptionalCatalogText(item.usefulLife),
    });
  }
  return parsed;
}


function parseCatalogModelNotes(value: unknown): CatalogModelNoteInput[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 20_000) return null;

  const parsed: CatalogModelNoteInput[] = [];
  for (const item of value) {
    if (!isRecord(item)
      || !isNonEmptyString(item.brand)
      || !isNonEmptyString(item.familyName)
      || !isNonEmptyString(item.modelName)
      || !isNonEmptyString(item.note)
      || item.note.length > 5_000) {
      return null;
    }
    parsed.push({
      brand: item.brand,
      familyName: item.familyName,
      modelName: item.modelName,
      note: item.note,
    });
  }
  return parsed;
}


function parseCatalogModelFamilies(value: unknown): CatalogModelFamilyInput[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 100_000) return null;

  const parsed: CatalogModelFamilyInput[] = [];
  for (const item of value) {
    if (!isRecord(item)
      || !isNonEmptyString(item.brand)
      || !isNonEmptyString(item.familyName)
      || !isNonEmptyString(item.modelName)
      || item.brand.length > 500
      || item.familyName.length > 500
      || item.modelName.length > 500
      || !isOptionalPositiveNumber(item.exchangeRate)
      || !isOptionalPositiveNumber(item.factor)) {
      return null;
    }
    parsed.push({
      brand: item.brand,
      familyName: item.familyName,
      modelName: item.modelName,
      exchangeRate: parseOptionalPositiveNumber(item.exchangeRate),
      factor: parseOptionalPositiveNumber(item.factor),
    });
  }
  return parsed;
}


function parseCatalogServiceItems(value: unknown): CatalogServiceItemInput[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 100_000) return null;

  const parsed: CatalogServiceItemInput[] = [];
  for (const item of value) {
    if (!isRecord(item)
      || !isNonEmptyString(item.brand)
      || !isNonEmptyString(item.familyName)
      || !isNonEmptyString(item.modelName)
      || !isNonEmptyString(item.description)
      || item.description.length > 5_000
      || (item.kind !== 'labor' && item.kind !== 'fixed')) {
      return null;
    }

    const fixedPriceLocal = item.fixedPriceLocal === undefined ? null : item.fixedPriceLocal;
    if (!isOptionalNonNegativeNumber(fixedPriceLocal)
      || item.kind === 'fixed' && fixedPriceLocal === null) {
      return null;
    }

    parsed.push({
      brand: item.brand,
      familyName: item.familyName,
      modelName: item.modelName,
      kind: item.kind,
      description: item.description,
      fixedPriceLocal,
    });
  }
  return parsed;
}

export function registerCatalogRoutes(app: Express, database: SuiteDatabase): void {
  const catalog = new CatalogRepository(database);

  app.post('/api/catalog/parts', (request, response) => {
    const { batchId, parts, modelFamilies, modelNotes, serviceItems, replaceAll } = (isRecord(request.body) ? request.body : {}) as {
      batchId?: unknown;
      parts?: unknown;
      modelFamilies?: unknown;
      modelNotes?: unknown;
      serviceItems?: unknown;
      replaceAll?: unknown;
    };
    const parsedParts = parseCatalogParts(parts);
    const parsedModelFamilies = parseCatalogModelFamilies(modelFamilies);
    const parsedModelNotes = parseCatalogModelNotes(modelNotes);
    const parsedServiceItems = parseCatalogServiceItems(serviceItems);
    if (!isNonEmptyString(batchId) || !parsedParts || !parsedModelFamilies || !parsedModelNotes || !parsedServiceItems || replaceAll !== undefined && typeof replaceAll !== 'boolean') {
      response.status(400).json({ error: 'batchId, parts y datos comerciales del catálogo deben ser válidos.' });
      return;
    }

    try {
      response.json(catalog.replaceFromBatch(batchId, parsedParts, {
        replaceAll: replaceAll === true,
        modelFamilies: parsedModelFamilies,
        modelNotes: parsedModelNotes,
        serviceItems: parsedServiceItems,
      }));
    } catch (error) {
      response.status(400).json({ error: error instanceof Error ? error.message : 'Importación inválida.' });
    }
  });

  app.get('/api/catalog/parts', (request, response) => {
    response.json(catalog.list({
      query: queryString(request.query.query),
      modelName: queryString(request.query.modelName),
      modelLinkedOnly: request.query.modelLinkedOnly === 'true',
      stockOnly: request.query.stockOnly === 'true',
      excludeDiscontinued: request.query.excludeDiscontinued === 'true',
    }));
  });

  app.get('/api/catalog/source', (_request, response) => {
    response.json(catalog.getLatestSourceFile());
  });

  app.get('/api/catalog/model-notes', (_request, response) => {
    response.json(catalog.listModelNotes());
  });

  app.get('/api/catalog/families', (_request, response) => {
    response.json(catalog.listFamilySummaries());
  });

  app.get('/api/catalog/service-items', (request, response) => {
    response.json(catalog.listServiceItems({
      query: queryString(request.query.query),
      modelName: queryString(request.query.modelName),
    }));
  });
}
