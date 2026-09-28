import { randomUUID } from 'node:crypto';
import type { SuiteDatabase } from '../../db/database';
import { SettingsRepository } from '../../db/repositories';
import { normalizePartCode } from '../catalogo/normalization';
import { CatalogRepository, normalizeModelName, type CatalogPart, type CatalogQuery } from '../catalogo/repository';
import { calculateSalePrice, roundGs100 } from './pricing';
import type {
  PricingSettings,
  SalesCatalogItem,
  SalesCatalogKind,
  SalesCatalogSnapshot,
  SalesCatalogs,
  OpenContractItem,
  OpenContractSnapshot,
  Proforma,
  ProformaHeader,
  ProformaLine,
  ProformaLineInput,
  ProformaStatus,
  ProformaSummary,
  SalesPricePart,
} from './types';

export const DEFAULT_PRICING: PricingSettings = {
  exchangeRate: 5980,
  factor: 1.8,
  laborPrice: 80000,
};

export type SaveProformaInput = {
  id?: string;
  header: ProformaHeader;
  lines: readonly ProformaLineInput[];
  status?: ProformaStatus;
  currency?: Proforma['currency'];
};

type ProformaRow = {
  id: string;
  customer_id: string | null;
  customer_name: string;
  customer_contact: string;
  service_report: string;
  service_report_number: string;
  reference: string;
  issued_at: string;
  attended_by: string;
  model_name: string;
  serial_number: string;
  mode: Proforma['mode'];
  status: ProformaStatus;
  currency: Proforma['currency'];
  exchange_rate: number;
  pricing_factor: number;
  labor_price: number;
  created_at: string;
  updated_at: string;
};

type ProformaLineRow = {
  id: string;
  part_id: string | null;
  line_kind: ProformaLine['kind'];
  catalog_kind: SalesCatalogKind | null;
  code: string;
  description: string;
  quantity: number;
  source_stock: number | null;
  source_discontinued_status: 'active' | 'discontinued' | 'unknown' | null;
  labor_cost_local: number | null;
  unit_price_usd: number | null;
  unit_price_local: number | null;
};

export { calculateSalePrice, roundGs100 } from './pricing';

export class SalesRepository {
  private readonly catalog: CatalogRepository;
  private readonly settings: SettingsRepository;

  constructor(private readonly database: SuiteDatabase) {
    this.catalog = new CatalogRepository(database);
    this.settings = new SettingsRepository(database);
  }

  getPricing(): PricingSettings {
    const stored = this.settings.get<Partial<PricingSettings>>('sales', 'pricing', {});
    return normalizePricing(stored);
  }

  savePricing(input: PricingSettings): PricingSettings {
    const pricing = normalizePricing(input, true);
    this.settings.set('sales', 'pricing', pricing);
    return pricing;
  }

  getPriceListSelection(): string[] {
    return normalizeModelSelection(this.settings.get<unknown>('sales', 'price-list-selection', []));
  }

  savePriceListSelection(input: readonly string[]): string[] {
    const selection = normalizeModelSelection(input);
    this.settings.set('sales', 'price-list-selection', selection);
    return selection;
  }

  listPrice(query: CatalogQuery = {}): SalesPricePart[] {
    const globalPricing = this.getPricing();
    const familyPricing = query.familyName ? this.catalog.getFamilyPricing(query.familyName) : null;
    const familyOverride = query.familyName
      ? globalPricing.familyExchangeRateOverrides?.[normalizeModelName(query.familyName)]
      : undefined;
    const pricing = familyPricing
      ? {
          ...globalPricing,
          exchangeRate: familyOverride ?? familyPricing.exchangeRate ?? globalPricing.exchangeRate,
          factor: familyPricing.factor ?? globalPricing.factor,
        }
      : familyOverride === undefined ? globalPricing : { ...globalPricing, exchangeRate: familyOverride };
    return this.catalog.list(query).map((part) => ({
      ...part,
      ...calculateSalePrice(part, pricing),
      origin: 'shared' as const,
    }));
  }

  getSalesCatalogs(): SalesCatalogs {
    return {
      consumibles: this.getSalesCatalog('consumibles'),
      repuestos: this.getSalesCatalog('repuestos'),
    };
  }

  getSalesCatalog(kind: SalesCatalogKind): SalesCatalogSnapshot | null {
    const snapshot = this.settings.get<SalesCatalogSnapshot | null>('sales', `catalog-${kind}`, null);
    return snapshot ? this.withSourceFile(snapshot) : null;
  }

  saveSalesCatalog(snapshot: SalesCatalogSnapshot): SalesCatalogSnapshot {
    const normalized = normalizeSalesCatalogSnapshot(snapshot);
    this.settings.set('sales', `catalog-${normalized.meta.kind}`, normalized);
    return this.getSalesCatalog(normalized.meta.kind) as SalesCatalogSnapshot;
  }

  getOpenContract(): OpenContractSnapshot | null {
    const snapshot = this.settings.get<OpenContractSnapshot | null>('sales', 'open-contract', null);
    return snapshot ? this.withSourceFile(snapshot) : null;
  }

  saveOpenContract(snapshot: OpenContractSnapshot): OpenContractSnapshot {
    const normalized = normalizeOpenContractSnapshot(snapshot);
    this.settings.set('sales', 'open-contract', normalized);
    return this.getOpenContract() as OpenContractSnapshot;
  }

  saveProforma(input: SaveProformaInput): Proforma {
    const pricing = this.getPricing();
    const currency = normalizeProformaCurrency(input.currency);
    const normalizedLines = this.normalizeLines(input.lines, pricing, input.header.mode, currency);
    if (normalizedLines.length === 0) {
      throw new Error('La proforma necesita por lo menos un ítem.');
    }

    const id = input.id?.trim() || randomUUID();
    const now = new Date().toISOString();
    const header = normalizeHeader(input.header);
    const status = input.status ?? 'draft';

    const save = this.database.transaction(() => {
      const existing = this.database
        .prepare('SELECT id FROM proformas WHERE id = ?')
        .get(id) as { id: string } | undefined;

      if (existing) {
        this.database
          .prepare(`
            UPDATE proformas
            SET customer_name = ?, customer_contact = ?, service_report = ?, service_report_number = ?,
              reference = ?, issued_at = ?, attended_by = ?, model_name = ?,
              serial_number = ?, mode = ?, status = ?, currency = ?,
              exchange_rate = ?, pricing_factor = ?, labor_price = ?, updated_at = ?
            WHERE id = ?
          `)
          .run(
            header.customerName,
            header.customerContact,
            header.serviceReport,
            header.serviceReportNumber,
            header.reference,
            header.issuedAt,
            header.attendedBy,
            header.modelName,
            header.serialNumber,
            header.mode,
            status,
            currency,
            pricing.exchangeRate,
            pricing.factor,
            pricing.laborPrice,
            now,
            id,
          );
      } else {
        this.database
          .prepare(`
            INSERT INTO proformas (
              id, customer_name, customer_contact, service_report, service_report_number, reference,
              issued_at, attended_by, model_name, serial_number, mode, status,
              currency, exchange_rate, pricing_factor, labor_price, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `)
          .run(
            id,
            header.customerName,
            header.customerContact,
            header.serviceReport,
            header.serviceReportNumber,
            header.reference,
            header.issuedAt,
            header.attendedBy,
            header.modelName,
            header.serialNumber,
            header.mode,
            status,
            currency,
            pricing.exchangeRate,
            pricing.factor,
            pricing.laborPrice,
            now,
            now,
          );
      }

      this.database.prepare('DELETE FROM proforma_lines WHERE proforma_id = ?').run(id);
      const insertLine = this.database.prepare(`
        INSERT INTO proforma_lines (
          id, proforma_id, part_id, line_kind, catalog_kind, code, description,
          quantity, source_stock, source_discontinued_status, labor_cost_local,
          unit_price_usd, unit_price_local, sort_order, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      normalizedLines.forEach((line, index) => {
        insertLine.run(
          line.id,
          id,
          line.partId,
          line.kind,
          line.catalogKind ?? null,
          line.code,
          line.description,
          line.quantity,
          line.sourceStock,
          line.sourceDiscontinuedStatus ?? null,
          line.costLocal,
          line.unitPriceUsd,
          line.unitPriceLocal,
          index,
          now,
        );
      });
    });

    save();
    return this.getProforma(id) as Proforma;
  }

  listProformas(): ProformaSummary[] {
    const rows = this.database
      .prepare(`
        SELECT
          p.id,
          p.customer_name,
          p.reference,
          p.issued_at,
          p.status,
          p.currency,
          p.updated_at,
          COALESCE(SUM(COALESCE(line.unit_price_local, 0) * line.quantity), 0) AS total_local,
          COALESCE(SUM(COALESCE(line.unit_price_usd, 0) * line.quantity), 0) AS total_usd
        FROM proformas p
        LEFT JOIN proforma_lines line ON line.proforma_id = p.id
        GROUP BY p.id, p.customer_name, p.reference, p.issued_at, p.status, p.currency, p.updated_at
        ORDER BY p.updated_at DESC, p.id DESC
      `)
      .all() as Array<{
      id: string;
      customer_name: string;
      reference: string;
      issued_at: string;
      status: ProformaStatus;
      currency: Proforma['currency'];
      updated_at: string;
      total_local: number;
      total_usd: number;
    }>;

    return rows.map((row) => ({
      id: row.id,
      customerName: row.customer_name,
      reference: row.reference,
      issuedAt: row.issued_at,
      status: row.status,
      currency: row.currency,
      totalLocal: row.total_local,
      totalUsd: row.total_usd,
      updatedAt: row.updated_at,
    }));
  }

  getProforma(id: string): Proforma | undefined {
    const row = this.database
      .prepare('SELECT * FROM proformas WHERE id = ?')
      .get(id) as ProformaRow | undefined;
    if (!row) return undefined;

    const lineRows = this.database
      .prepare(`
        SELECT id, part_id, line_kind, code, description, quantity,
          catalog_kind, source_stock, source_discontinued_status,
          labor_cost_local, unit_price_usd, unit_price_local
        FROM proforma_lines
        WHERE proforma_id = ?
        ORDER BY sort_order, id
      `)
      .all(id) as ProformaLineRow[];
    const lines = lineRows.map((line) => this.toLine(line));

    return {
      id: row.id,
      customerName: row.customer_name,
      customerContact: row.customer_contact,
      serviceReport: row.service_report,
      serviceReportNumber: row.service_report_number,
      reference: row.reference,
      issuedAt: row.issued_at,
      attendedBy: row.attended_by,
      modelName: row.model_name,
      serialNumber: row.serial_number,
      mode: row.mode,
      status: row.status,
      currency: row.currency,
      pricing: {
        exchangeRate: row.exchange_rate,
        factor: row.pricing_factor,
        laborPrice: row.labor_price,
      },
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      lines,
      totalLocal: lines.reduce((total, line) => total + line.lineTotalLocal, 0),
    };
  }

  private normalizeLines(
    lines: readonly ProformaLineInput[],
    pricing: PricingSettings,
    mode: Proforma['mode'],
    currency: Proforma['currency'],
  ): ProformaLine[] {
    return lines.map((line) => {
      if (!Number.isInteger(line.quantity) || line.quantity < 1) {
        throw new Error('La cantidad de cada línea debe ser un entero positivo.');
      }

      if (line.kind === 'labor') {
        const description = line.description?.trim() || 'Mano de obra';
        const costLocal = normalizeLinePrice(line.costLocal);
        const suppliedUsd = normalizeLinePrice(line.unitPriceUsd);
        const suppliedLocal = normalizeLinePrice(line.unitPriceLocal);
        const unitPriceUsd = currency === 'USD'
          ? suppliedUsd ?? (suppliedLocal === null ? round(pricing.laborPrice / pricing.exchangeRate, 4) : round(suppliedLocal / pricing.exchangeRate, 4))
          : null;
        const unitPriceLocal = suppliedLocal ?? (suppliedUsd === null ? pricing.laborPrice : roundGs100(suppliedUsd * pricing.exchangeRate));
        return {
          id: randomUUID(),
          partId: null,
          kind: 'labor',
          catalogKind: undefined,
          code: '',
          description,
          quantity: line.quantity,
          costLocal,
          unitPriceUsd,
          unitPriceLocal,
          lineTotalLocal: unitPriceLocal * line.quantity,
        };
      }

      if (!line.partId?.trim()) {
        const isContractLine = mode === 'contrato-abierto' && (line.source === undefined || line.source === 'contract');
        const isProformasCatalogLine = mode === 'sin-contrato' && line.source === 'proformas';
        if (!isContractLine && !isProformasCatalogLine) {
          throw new Error('Cada línea de repuesto debe indicar una parte del catálogo.');
        }

        const code = line.code?.trim() || '';
        const description = line.description?.trim() || 'Sin descripción';
        const unitPriceUsd = normalizeLinePrice(line.unitPriceUsd);
        const suppliedLocalPrice = normalizeLinePrice(line.unitPriceLocal);
        if (!code || unitPriceUsd === null && suppliedLocalPrice === null) {
          throw new Error('Cada línea contractual debe indicar código y precio fijo.');
        }
        const unitPriceLocal = suppliedLocalPrice ?? roundGs100((unitPriceUsd ?? 0) * pricing.exchangeRate);
        const sourceCatalogItem = isProformasCatalogLine && line.catalogKind
          ? this.getSalesCatalog(line.catalogKind)?.items.find((item) => normalizePartCode(item.code) === normalizePartCode(code))
          : undefined;
        const sourceStock = line.sourceStock === undefined
          ? sourceCatalogItem?.stock ?? null
          : normalizeSourceStock(line.sourceStock);
        const sourceDiscontinuedStatus = line.sourceDiscontinuedStatus === undefined
          ? sourceCatalogItem?.discontinued
          : normalizeSourceDiscontinuedStatus(line.sourceDiscontinuedStatus);
        return {
          id: randomUUID(),
          partId: null,
          kind: 'part',
          catalogKind: line.catalogKind,
          code,
          description,
          quantity: line.quantity,
          sourceStock,
          sourceDiscontinuedStatus: sourceDiscontinuedStatus ?? undefined,
          costLocal: null,
          unitPriceUsd,
          unitPriceLocal,
          lineTotalLocal: unitPriceLocal * line.quantity,
        };
      }
      const part = this.catalog.getById(line.partId);
      if (!part) {
        throw new Error(`No existe la parte ${line.partId} en el catálogo local.`);
      }
      const prices = calculateSalePrice(part, pricing);
      const sourceStock = line.sourceStock === undefined ? part.stock : normalizeSourceStock(line.sourceStock);
      const sourceDiscontinuedStatus = line.sourceDiscontinuedStatus === undefined
        ? part.discontinuedAt ? 'discontinued' as const : 'unknown' as const
        : normalizeSourceDiscontinuedStatus(line.sourceDiscontinuedStatus);
      return {
        id: randomUUID(),
        partId: part.id,
        kind: 'part',
        catalogKind: line.catalogKind,
        code: part.code,
        description: part.description || 'Sin descripción',
        quantity: line.quantity,
        sourceStock,
        sourceDiscontinuedStatus: sourceDiscontinuedStatus ?? undefined,
        costLocal: null,
        unitPriceUsd: prices.salePriceUsd,
        unitPriceLocal: prices.salePriceLocal,
        lineTotalLocal: prices.salePriceLocal * line.quantity,
      };
    });
  }

  private toLine(row: ProformaLineRow): ProformaLine {
    return {
      id: row.id,
      partId: row.part_id,
      kind: row.line_kind,
      ...(row.catalog_kind ? { catalogKind: row.catalog_kind } : {}),
      code: row.code,
      description: row.description,
      quantity: row.quantity,
      ...(row.source_stock !== null ? { sourceStock: row.source_stock } : {}),
      ...(row.source_discontinued_status ? { sourceDiscontinuedStatus: row.source_discontinued_status } : {}),
      costLocal: row.labor_cost_local,
      unitPriceUsd: row.unit_price_usd,
      unitPriceLocal: row.unit_price_local,
      lineTotalLocal: (row.unit_price_local ?? 0) * row.quantity,
    };
  }

  private withSourceFile<T extends SalesCatalogSnapshot | OpenContractSnapshot>(snapshot: T): T {
    const batchId = snapshot.meta.sourceBatchId;
    if (!batchId) return snapshot;

    const row = this.database
      .prepare('SELECT id FROM import_files WHERE batch_id = ? ORDER BY created_at, id LIMIT 1')
      .get(batchId) as { id: string } | undefined;
    if (!row) return snapshot;

    return {
      ...snapshot,
      meta: {
        ...snapshot.meta,
        sourceFileId: row.id,
      },
    } as T;
  }

}

function normalizeSalesCatalogSnapshot(snapshot: SalesCatalogSnapshot): SalesCatalogSnapshot {
  if (!snapshot || !snapshot.meta || !Array.isArray(snapshot.items) || snapshot.items.length === 0) {
    throw new Error('El catálogo de Proformas no contiene registros válidos.');
  }
  if (snapshot.meta.kind !== 'consumibles' && snapshot.meta.kind !== 'repuestos') {
    throw new Error('El tipo del catálogo de Proformas no es válido.');
  }

  const seenCodes = new Set<string>();
  const items: SalesCatalogItem[] = [];
  for (const item of snapshot.items) {
    const code = item.code.trim();
    const normalizedCode = normalizePartCode(code);
    const priceUsd = normalizeOptionalCatalogNumber(item.priceUsd, 'precio USD');
    const priceLocal = normalizeOptionalCatalogNumber(item.priceLocal, 'precio local');
    const stock = normalizeOptionalCatalogNumber(item.stock, 'stock');
    if (
      !normalizedCode ||
      (item.kind !== 'consumibles' && item.kind !== 'repuestos') ||
      item.kind !== snapshot.meta.kind ||
      typeof item.description !== 'string' ||
      typeof item.group !== 'string' ||
      (item.discontinued !== 'active' && item.discontinued !== 'discontinued' && item.discontinued !== 'unknown')
    ) {
      throw new Error(`El registro ${code || '(sin código)'} del catálogo no es válido.`);
    }
    if (seenCodes.has(normalizedCode)) {
      throw new Error(`El catálogo contiene el código duplicado ${code}.`);
    }
    seenCodes.add(normalizedCode);
    items.push({
      id: item.id.trim() || `proformas-${snapshot.meta.kind}-${normalizedCode}`,
      kind: item.kind,
      code,
      description: item.description.trim(),
      group: item.group.trim(),
      priceUsd,
      priceLocal,
      stock,
      discontinued: item.discontinued,
    });
  }

  return {
    meta: {
      kind: snapshot.meta.kind,
      fileName: snapshot.meta.fileName.trim(),
      updatedAt: snapshot.meta.updatedAt.trim() || new Date().toISOString(),
      rowCount: items.length,
      invalidRows: normalizeCounter(snapshot.meta.invalidRows),
      duplicateRows: normalizeCounter(snapshot.meta.duplicateRows),
      hasDiscontinuedColumn: snapshot.meta.hasDiscontinuedColumn === true,
      ...(snapshot.meta.sourceBatchId?.trim() ? { sourceBatchId: snapshot.meta.sourceBatchId.trim() } : {}),
    },
    items,
  };
}

function normalizeOptionalCatalogNumber(value: number | null, label: string): number | null {
  if (value === null) return null;
  if (!Number.isFinite(value) || value < 0) throw new Error(`El ${label} del catálogo debe ser un número no negativo.`);
  return value;
}

function normalizeOpenContractSnapshot(snapshot: OpenContractSnapshot): OpenContractSnapshot {
  if (!snapshot || !snapshot.meta || !Array.isArray(snapshot.items) || snapshot.items.length === 0) {
    throw new Error('El contrato abierto no contiene líneas válidas.');
  }

  const seenCodes = new Set<string>();
  const items: OpenContractItem[] = [];
  for (const item of snapshot.items) {
    const code = item.code.trim();
    const normalizedCode = normalizePartCode(code);
    const priceUsd = normalizeLinePrice(item.priceUsd);
    const priceLocal = normalizeLinePrice(item.priceLocal);
    if (
      !normalizedCode ||
      (item.kind !== 'consumibles' && item.kind !== 'repuestos') ||
      priceUsd === null && priceLocal === null ||
      snapshot.meta.priceCurrency === 'usd' && priceUsd === null ||
      snapshot.meta.priceCurrency === 'local' && priceLocal === null
    ) {
      throw new Error(`La línea contractual ${code || '(sin código)'} no tiene datos válidos.`);
    }
    if (seenCodes.has(normalizedCode)) {
      throw new Error(`El contrato abierto contiene el código duplicado ${code}.`);
    }
    seenCodes.add(normalizedCode);
    items.push({
      id: item.id.trim() || `contrato-${normalizedCode}`,
      kind: item.kind,
      code,
      description: item.description.trim(),
      group: item.group.trim(),
      priceUsd,
      priceLocal,
    });
  }

  if (snapshot.meta.priceCurrency !== 'local' && snapshot.meta.priceCurrency !== 'usd') {
    throw new Error('La moneda del contrato abierto no es válida.');
  }
  if (snapshot.meta.sourceFormat !== 'xlsx' && snapshot.meta.sourceFormat !== 'pdf') {
    throw new Error('El formato del contrato abierto no es válido.');
  }

  return {
    meta: {
      fileName: snapshot.meta.fileName.trim(),
      updatedAt: snapshot.meta.updatedAt.trim() || new Date().toISOString(),
      rowCount: items.length,
      invalidRows: normalizeCounter(snapshot.meta.invalidRows),
      duplicateRows: normalizeCounter(snapshot.meta.duplicateRows),
      sourceFormat: snapshot.meta.sourceFormat,
      priceCurrency: snapshot.meta.priceCurrency,
      hasKindColumn: snapshot.meta.hasKindColumn === true,
      ...(snapshot.meta.sourceBatchId?.trim() ? { sourceBatchId: snapshot.meta.sourceBatchId.trim() } : {}),
    },
    items,
  };
}

function normalizeLinePrice(value: number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  if (!Number.isFinite(value) || value < 0) {
    throw new Error('Los precios fijos deben ser números no negativos.');
  }
  return value;
}

function normalizeProformaCurrency(value: Proforma['currency'] | undefined): Proforma['currency'] {
  return value === 'USD' ? 'USD' : 'PYG';
}

function normalizeSourceStock(value: number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  if (!Number.isFinite(value) || value < 0) {
    throw new Error('El stock de la línea debe ser un número no negativo.');
  }
  return value;
}

function normalizeSourceDiscontinuedStatus(value: string | undefined): 'active' | 'discontinued' | 'unknown' | null {
  if (value === undefined) return null;
  if (value === 'active' || value === 'discontinued' || value === 'unknown') return value;
  throw new Error('El estado de discontinuación de la línea no es válido.');
}

function normalizeCounter(value: number): number {
  return Number.isInteger(value) && value >= 0 ? value : 0;
}

function normalizePricing(value: Partial<PricingSettings> | null | undefined, strict = false): PricingSettings {
  const exchangeRate = value?.exchangeRate;
  const factor = value?.factor;
  const laborPrice = value?.laborPrice;
  if (
    strict &&
    (!isPositiveNumber(exchangeRate) || !isPositiveNumber(factor) || !isNonNegativeNumber(laborPrice))
  ) {
    throw new Error('Tipo de cambio y factor deben ser mayores que cero; mano de obra no puede ser negativa.');
  }
  const familyExchangeRateOverrides = normalizeFamilyExchangeRateOverrides(value?.familyExchangeRateOverrides);
  return {
    exchangeRate: isPositiveNumber(exchangeRate) ? exchangeRate : DEFAULT_PRICING.exchangeRate,
    factor: isPositiveNumber(factor) ? factor : DEFAULT_PRICING.factor,
    laborPrice: isNonNegativeNumber(laborPrice) ? laborPrice : DEFAULT_PRICING.laborPrice,
    ...(Object.keys(familyExchangeRateOverrides).length > 0 ? { familyExchangeRateOverrides } : {}),
  };
}

function normalizeFamilyExchangeRateOverrides(value: unknown): Record<string, number> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};

  const overrides: Record<string, number> = {};
  for (const [familyName, exchangeRate] of Object.entries(value)) {
    const key = normalizeModelName(familyName);
    if (key && isPositiveNumber(exchangeRate)) overrides[key] = exchangeRate;
  }
  return overrides;
}

function normalizeModelSelection(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const unique = new Map<string, string>();
  for (const item of value) {
    if (typeof item !== 'string') continue;
    const label = item.trim().replace(/\s+/g, ' ');
    if (label) unique.set(normalizeModelName(label), label);
  }
  return [...unique.values()].sort((left, right) => left.localeCompare(right));
}

function normalizeHeader(header: ProformaHeader): ProformaHeader {
  return {
    customerName: header.customerName.trim(),
    customerContact: header.customerContact.trim(),
    serviceReport: header.serviceReport.trim(),
    serviceReportNumber: header.serviceReportNumber.trim(),
    reference: header.reference.trim(),
    issuedAt: header.issuedAt.trim() || new Date().toISOString(),
    attendedBy: header.attendedBy.trim(),
    modelName: header.modelName.trim(),
    serialNumber: header.serialNumber.trim(),
    mode: header.mode,
  };
}

function isPositiveNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function isNonNegativeNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}
