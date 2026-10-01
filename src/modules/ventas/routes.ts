import type { Express } from 'express';
import type { SuiteDatabase } from '../../db/database';
import { ImportRepository } from '../../db/repositories';
import { isNonEmptyString, isNonNegativeInteger, isNonNegativeNumber, isOptionalNonNegativeNumber, isPositiveInteger, isPositiveNumber, isRecord, queryString } from '../../core/validation';
import { SalesRepository, type SaveProformaInput } from './repository';
import type {
  ContractPriceCurrency,
  OpenContractSnapshot,
  PricingSettings,
  ProformaLineInput,
  SalesCatalogSnapshot,
} from './types';

function optionalString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function parsePricing(value: unknown): PricingSettings | null {
  if (!isRecord(value)) return null;
  if (
    !isPositiveNumber(value.exchangeRate) ||
    !isPositiveNumber(value.factor) ||
    !isNonNegativeNumber(value.laborPrice)
  ) {
    return null;
  }
  return {
    exchangeRate: value.exchangeRate,
    factor: value.factor,
    laborPrice: value.laborPrice,
  };
}


function parsePriceListSelection(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length > 500) return null;
  const modelNames: string[] = [];
  for (const item of value) {
    if (!isNonEmptyString(item) || item.trim().length > 160) return null;
    const normalized = item.trim().replace(/\s+/g, ' ');
    if (!modelNames.some((current) => current.localeCompare(normalized, undefined, { sensitivity: 'base' }) === 0)) {
      modelNames.push(normalized);
    }
  }
  return modelNames;
}


function parseSalesCatalogSnapshot(value: unknown, expectedKind: 'consumibles' | 'repuestos' | null): SalesCatalogSnapshot | null {
  if (!expectedKind || !isRecord(value) || !isRecord(value.meta) || !Array.isArray(value.items)) return null;
  const meta = value.meta;
  if (
    meta.kind !== expectedKind ||
    !isNonEmptyString(meta.fileName) ||
    !isNonEmptyString(meta.updatedAt) ||
    !isNonNegativeInteger(meta.rowCount) ||
    !isNonNegativeInteger(meta.invalidRows) ||
    !isNonNegativeInteger(meta.duplicateRows) ||
    typeof meta.hasDiscontinuedColumn !== 'boolean'
  ) {
    return null;
  }

  const items: SalesCatalogSnapshot['items'] = [];
  for (const valueItem of value.items) {
    if (!isRecord(valueItem)) return null;
    const priceUsd = valueItem.priceUsd === null || valueItem.priceUsd === undefined
      ? null
      : isNonNegativeNumber(valueItem.priceUsd) ? valueItem.priceUsd : undefined;
    const priceLocal = valueItem.priceLocal === null || valueItem.priceLocal === undefined
      ? null
      : isNonNegativeNumber(valueItem.priceLocal) ? valueItem.priceLocal : undefined;
    const stock = valueItem.stock === null || valueItem.stock === undefined
      ? null
      : isNonNegativeNumber(valueItem.stock) ? valueItem.stock : undefined;
    if (
      !isNonEmptyString(valueItem.id) ||
      !isNonEmptyString(valueItem.code) ||
      typeof valueItem.description !== 'string' ||
      typeof valueItem.group !== 'string' ||
      valueItem.kind !== expectedKind ||
      valueItem.discontinued !== 'active' && valueItem.discontinued !== 'discontinued' && valueItem.discontinued !== 'unknown' ||
      priceUsd === undefined ||
      priceLocal === undefined ||
      stock === undefined
    ) {
      return null;
    }
    items.push({
      id: valueItem.id,
      kind: expectedKind,
      code: valueItem.code,
      description: valueItem.description,
      group: valueItem.group,
      priceUsd,
      priceLocal,
      stock,
      discontinued: valueItem.discontinued,
    });
  }

  if (items.length === 0) return null;
  return {
    meta: {
      kind: expectedKind,
      fileName: meta.fileName,
      updatedAt: meta.updatedAt,
      rowCount: meta.rowCount,
      invalidRows: meta.invalidRows,
      duplicateRows: meta.duplicateRows,
      hasDiscontinuedColumn: meta.hasDiscontinuedColumn,
      ...(isNonEmptyString(meta.sourceBatchId) ? { sourceBatchId: meta.sourceBatchId } : {}),
    },
    items,
  };
}


function parseOpenContractSnapshot(value: unknown): OpenContractSnapshot | null {
  if (!isRecord(value) || !isRecord(value.meta) || !Array.isArray(value.items)) return null;
  const meta = value.meta;
  const priceCurrency: ContractPriceCurrency | null = meta.priceCurrency === 'local' || meta.priceCurrency === 'usd'
    ? meta.priceCurrency
    : null;
  const sourceFormat = meta.sourceFormat === 'xlsx' || meta.sourceFormat === 'pdf' ? meta.sourceFormat : null;
  if (
    !isNonEmptyString(meta.fileName) ||
    !isNonEmptyString(meta.updatedAt) ||
    !isNonNegativeInteger(meta.invalidRows) ||
    !isNonNegativeInteger(meta.duplicateRows) ||
    typeof meta.hasKindColumn !== 'boolean' ||
    !priceCurrency ||
    !sourceFormat
  ) {
    return null;
  }

  const items: OpenContractSnapshot['items'] = [];
  for (const valueItem of value.items) {
    if (!isRecord(valueItem)) return null;
    const priceUsd = valueItem.priceUsd === null || valueItem.priceUsd === undefined
      ? null
      : isNonNegativeNumber(valueItem.priceUsd) ? valueItem.priceUsd : undefined;
    const priceLocal = valueItem.priceLocal === null || valueItem.priceLocal === undefined
      ? null
      : isNonNegativeNumber(valueItem.priceLocal) ? valueItem.priceLocal : undefined;
    if (
      !isNonEmptyString(valueItem.id) ||
      !isNonEmptyString(valueItem.code) ||
      typeof valueItem.description !== 'string' ||
      typeof valueItem.group !== 'string' ||
      (valueItem.kind !== 'consumibles' && valueItem.kind !== 'repuestos') ||
      priceUsd === undefined ||
      priceLocal === undefined ||
      priceUsd === null && priceLocal === null ||
      priceCurrency === 'usd' && priceUsd === null ||
      priceCurrency === 'local' && priceLocal === null
    ) {
      return null;
    }
    items.push({
      id: valueItem.id,
      kind: valueItem.kind,
      code: valueItem.code,
      description: valueItem.description,
      group: valueItem.group,
      priceUsd,
      priceLocal,
    });
  }

  if (items.length === 0) return null;
  return {
    meta: {
      fileName: meta.fileName,
      updatedAt: meta.updatedAt,
      rowCount: items.length,
      invalidRows: meta.invalidRows,
      duplicateRows: meta.duplicateRows,
      sourceFormat,
      priceCurrency,
      hasKindColumn: meta.hasKindColumn,
      ...(isNonEmptyString(meta.sourceBatchId) ? { sourceBatchId: meta.sourceBatchId } : {}),
    },
    items,
  };
}


function parseSaveProformaInput(value: unknown): SaveProformaInput | null {
  if (!isRecord(value) || !isRecord(value.header) || !Array.isArray(value.lines)) return null;
  const header = value.header;
  const mode = header.mode === 'contrato-abierto' ? 'contrato-abierto' : header.mode === 'sin-contrato' ? 'sin-contrato' : null;
  if (!mode) return null;

    const lines: ProformaLineInput[] = [];
    for (const line of value.lines) {
      if (!isRecord(line) || !isPositiveInteger(line.quantity)) return null;
      if (line.kind === 'labor') {
        if (line.description !== undefined && typeof line.description !== 'string') return null;
        if (!isOptionalNonNegativeNumber(line.costLocal)
          || !isOptionalNonNegativeNumber(line.unitPriceUsd)
          || !isOptionalNonNegativeNumber(line.unitPriceLocal)) return null;
        lines.push({
          kind: 'labor',
          description: line.description,
          costLocal: line.costLocal === undefined ? null : line.costLocal,
          unitPriceUsd: line.unitPriceUsd === undefined ? null : line.unitPriceUsd,
          unitPriceLocal: line.unitPriceLocal === undefined ? null : line.unitPriceLocal,
          quantity: line.quantity,
        });
      continue;
    }
    if (line.kind !== 'part') return null;
    if (isNonEmptyString(line.partId)) {
      if (line.source !== undefined && line.source !== 'shared') return null;
      lines.push({ kind: 'part', partId: line.partId, quantity: line.quantity });
      continue;
    }
    const isContractLine = mode === 'contrato-abierto' && (line.source === undefined || line.source === 'contract');
    const isProformasCatalogLine = mode === 'sin-contrato' && line.source === 'proformas';
    if ((!isContractLine && !isProformasCatalogLine) || !isNonEmptyString(line.code) || typeof line.description !== 'string') return null;
    if (!isOptionalNonNegativeNumber(line.unitPriceUsd) || !isOptionalNonNegativeNumber(line.unitPriceLocal)) return null;
    if (line.unitPriceUsd == null && line.unitPriceLocal == null) return null;
    lines.push({
      kind: 'part',
      source: isProformasCatalogLine ? 'proformas' : 'contract',
      code: line.code,
      description: line.description,
      unitPriceUsd: line.unitPriceUsd === undefined ? null : line.unitPriceUsd,
      unitPriceLocal: line.unitPriceLocal === undefined ? null : line.unitPriceLocal,
      quantity: line.quantity,
    });
  }

  const status = value.status === undefined ? undefined : value.status === 'issued' || value.status === 'draft' ? value.status : null;
  if (status === null) return null;
  const currency = value.currency === undefined
    ? undefined
    : value.currency === 'USD' || value.currency === 'PYG' ? value.currency : null;
  if (currency === null) return null;

  return {
    id: value.id === undefined ? undefined : isNonEmptyString(value.id) ? value.id : undefined,
    header: {
      customerName: optionalString(header.customerName),
      customerContact: optionalString(header.customerContact),
      serviceReport: optionalString(header.serviceReport),
      serviceReportNumber: optionalString(header.serviceReportNumber),
      reference: optionalString(header.reference),
      issuedAt: optionalString(header.issuedAt),
      attendedBy: optionalString(header.attendedBy),
      modelName: optionalString(header.modelName),
      serialNumber: optionalString(header.serialNumber),
      mode,
    },
    lines,
    status,
    currency,
  };
}

export function registerSalesRoutes(app: Express, database: SuiteDatabase): void {
  const imports = new ImportRepository(database);
  const sales = new SalesRepository(database);

  app.get('/api/sales/pricing', (_request, response) => {
    response.json(sales.getPricing());
  });

  app.put('/api/sales/pricing', (request, response) => {
    const pricing = parsePricing(request.body);
    if (!pricing) {
      response.status(400).json({ error: 'exchangeRate, factor y laborPrice deben ser números válidos.' });
      return;
    }

    try {
      response.json(sales.savePricing(pricing));
    } catch (error) {
      response.status(400).json({ error: error instanceof Error ? error.message : 'No se pudo guardar la configuración.' });
    }
  });

  app.get('/api/sales/price-list', (request, response) => {
    response.json(sales.listPrice({
      query: queryString(request.query.query),
      familyName: queryString(request.query.familyName),
      modelName: queryString(request.query.modelName),
      stockOnly: request.query.stockOnly === 'true',
    }));
  });

  app.get('/api/sales/price-list-selection', (_request, response) => {
    response.json({ modelNames: sales.getPriceListSelection() });
  });

  app.put('/api/sales/price-list-selection', (request, response) => {
    const modelNames = parsePriceListSelection(isRecord(request.body) ? request.body.modelNames : undefined);
    if (!modelNames) {
      response.status(400).json({ error: 'La selección debe contener nombres de modelos válidos.' });
      return;
    }

    response.json({ modelNames: sales.savePriceListSelection(modelNames) });
  });

  app.get('/api/sales/catalogs', (_request, response) => {
    response.json(sales.getSalesCatalogs());
  });

  app.post('/api/sales/catalogs/:kind', (request, response) => {
    const kind = request.params.kind === 'consumibles' || request.params.kind === 'repuestos' ? request.params.kind : null;
    const body = isRecord(request.body) ? request.body : {};
    const snapshot = parseSalesCatalogSnapshot(body.snapshot, kind);
    const batchId = body.batchId === undefined ? undefined : body.batchId;
    if (!kind || !snapshot || batchId !== undefined && !isNonEmptyString(batchId)) {
      response.status(400).json({ error: 'El snapshot del catálogo de Proformas no es válido.' });
      return;
    }

    const batch = batchId ? imports.getBatch(batchId) : undefined;
    if (batchId && (!batch || batch.domain !== 'sales-catalog' || batch.status !== 'staged')) {
      response.status(409).json({ error: 'La importación del catálogo de Proformas no está disponible para aplicar.' });
      return;
    }

    try {
      const saved = sales.saveSalesCatalog({
        ...snapshot,
        meta: {
          ...snapshot.meta,
          ...(batchId ? { sourceBatchId: batchId } : {}),
        },
      });
      if (batchId) imports.markApplied(batchId);
      response.status(201).json(saved);
    } catch (error) {
      if (batchId) imports.markFailed(batchId);
      response.status(400).json({ error: error instanceof Error ? error.message : 'No se pudo guardar el catálogo de Proformas.' });
    }
  });

  app.get('/api/sales/open-contract', (_request, response) => {
    response.json(sales.getOpenContract());
  });

  app.post('/api/sales/open-contract', (request, response) => {
    const body = isRecord(request.body) ? request.body : {};
    const snapshot = parseOpenContractSnapshot(body.snapshot);
    const batchId = body.batchId === undefined ? undefined : body.batchId;
    if (!snapshot || batchId !== undefined && !isNonEmptyString(batchId)) {
      response.status(400).json({ error: 'El snapshot del contrato abierto no es válido.' });
      return;
    }

    const batch = batchId ? imports.getBatch(batchId) : undefined;
    if (batchId && (!batch || batch.domain !== 'sales-open-contract' || batch.status !== 'staged')) {
      response.status(409).json({ error: 'La importación del contrato abierto no está disponible para aplicar.' });
      return;
    }

    try {
      const saved = sales.saveOpenContract({
        ...snapshot,
        meta: {
          ...snapshot.meta,
          ...(batchId ? { sourceBatchId: batchId } : {}),
        },
      });
      if (batchId) imports.markApplied(batchId);
      response.status(201).json(saved);
    } catch (error) {
      if (batchId) imports.markFailed(batchId);
      response.status(400).json({ error: error instanceof Error ? error.message : 'No se pudo guardar el contrato abierto.' });
    }
  });

  app.get('/api/sales/proformas', (_request, response) => {
    response.json(sales.listProformas());
  });

  app.get('/api/sales/proformas/:id', (request, response) => {
    const proforma = sales.getProforma(request.params.id);
    if (!proforma) {
      response.status(404).json({ error: 'Proforma no encontrada.' });
      return;
    }
    response.json(proforma);
  });

  app.post('/api/sales/proformas', (request, response) => {
    const input = parseSaveProformaInput(request.body);
    if (!input) {
      response.status(400).json({ error: 'La cabecera y las líneas de la proforma no son válidas.' });
      return;
    }

    try {
      response.status(201).json(sales.saveProforma(input));
    } catch (error) {
      response.status(400).json({ error: error instanceof Error ? error.message : 'No se pudo guardar la proforma.' });
    }
  });
}
