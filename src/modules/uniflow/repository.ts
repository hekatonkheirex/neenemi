import { randomUUID } from 'node:crypto';
import type { SuiteDatabase } from '../../db/database';
import { cloneUniflowPriceCatalog, DEFAULT_UNIFLOW_PRICE_CATALOG } from './catalog';
import { UNIFLOW_PRICE_TABS } from './types';
import type { UniflowPriceCatalog, UniflowPriceTabId, UniflowSku } from './types';

type UniflowPriceRow = {
  price_tab: UniflowPriceTabId;
  catalog_version: number;
  skus_json: string;
  source: string;
  last_modified: string;
};

export class UniflowRepository {
  constructor(private readonly database: SuiteDatabase) {}

  getCatalog(): UniflowPriceCatalog {
    const rows = this.database.prepare(`
      SELECT price_tab, catalog_version, skus_json, source, last_modified
      FROM uniflow_price_lists
      WHERE catalog_version = (SELECT MAX(catalog_version) FROM uniflow_price_lists)
      ORDER BY price_tab
    `).all() as UniflowPriceRow[];
    if (rows.length !== UNIFLOW_PRICE_TABS.length) return cloneUniflowPriceCatalog(DEFAULT_UNIFLOW_PRICE_CATALOG);

    const lists = {} as UniflowPriceCatalog['lists'];
    for (const row of rows) {
      if (!UNIFLOW_PRICE_TABS.includes(row.price_tab)) return cloneUniflowPriceCatalog(DEFAULT_UNIFLOW_PRICE_CATALOG);
      try {
        const parsed = JSON.parse(row.skus_json) as unknown;
        if (!isSkuList(parsed)) return cloneUniflowPriceCatalog(DEFAULT_UNIFLOW_PRICE_CATALOG);
        lists[row.price_tab] = parsed;
      } catch {
        return cloneUniflowPriceCatalog(DEFAULT_UNIFLOW_PRICE_CATALOG);
      }
    }
    if (!UNIFLOW_PRICE_TABS.every((tab) => Array.isArray(lists[tab]))) {
      return cloneUniflowPriceCatalog(DEFAULT_UNIFLOW_PRICE_CATALOG);
    }

    const first = rows[0];
    return {
      version: first.catalog_version,
      source: first.source,
      lastModified: first.last_modified,
      lists,
    };
  }

  saveCatalog(input: UniflowPriceCatalog): UniflowPriceCatalog {
    const catalog = normalizeCatalog(input);
    const now = new Date().toISOString();
    const save = this.database.transaction(() => {
      const statement = this.database.prepare(`
        INSERT INTO uniflow_price_lists (
          id, price_tab, catalog_version, skus_json, source, last_modified, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT (catalog_version, price_tab) DO UPDATE SET
          skus_json = excluded.skus_json,
          source = excluded.source,
          last_modified = excluded.last_modified,
          created_at = excluded.created_at
      `);
      for (const tab of UNIFLOW_PRICE_TABS) {
        statement.run(
          randomUUID(),
          tab,
          catalog.version,
          JSON.stringify(catalog.lists[tab]),
          catalog.source,
          catalog.lastModified,
          now,
        );
      }
    });
    save();
    return this.getCatalog();
  }
}

function normalizeCatalog(input: UniflowPriceCatalog): UniflowPriceCatalog {
  if (!Number.isInteger(input.version) || input.version < 1) {
    throw new Error('La versión del catálogo uniFLOW no es válida.');
  }
  if (!input.source.trim() || !input.lastModified.trim()) {
    throw new Error('El catálogo uniFLOW necesita fuente y fecha de vigencia.');
  }
  for (const tab of UNIFLOW_PRICE_TABS) {
    const list = input.lists[tab];
    if (!isSkuList(list)) throw new Error(`La lista de precios ${tab} no es válida.`);
  }
  return {
    version: input.version,
    source: input.source.trim(),
    lastModified: input.lastModified.trim(),
    lists: Object.fromEntries(
      UNIFLOW_PRICE_TABS.map((tab) => [tab, input.lists[tab].map((item) => ({ ...item }))]),
    ) as UniflowPriceCatalog['lists'],
  };
}

function isSkuList(value: unknown): value is UniflowSku[] {
  if (!Array.isArray(value) || value.length === 0) return false;
  return value.every((item) => {
    if (!isRecord(item)) return false;
    const minQty = item.minQty;
    const maxQty = item.maxQty;
    const label = item.label;
    const sku = item.sku;
    const price = item.price;
    return typeof minQty === 'number'
      && Number.isInteger(minQty)
      && minQty > 0
      && (maxQty === null || (typeof maxQty === 'number' && Number.isInteger(maxQty) && maxQty >= minQty))
      && typeof label === 'string'
      && label.trim().length > 0
      && typeof sku === 'string'
      && sku.trim().length > 0
      && typeof price === 'number'
      && Number.isFinite(price)
      && price >= 0;
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
