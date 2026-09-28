import type { CatalogPart } from '../catalogo/repository';

export type PricingSettings = {
  exchangeRate: number;
  factor: number;
  laborPrice: number;
  /** Tipos de cambio elegidos para reemplazar el global por familia. */
  familyExchangeRateOverrides?: Record<string, number>;
};

export type SalesPricePart = CatalogPart & {
  salePriceUsd: number;
  salePriceLocal: number;
  fixedPriceCurrency?: ContractPriceCurrency;
  origin?: SalesPartOrigin;
  catalogKind?: SalesCatalogKind;
  catalogStock?: number | null;
  discontinuedStatus?: SalesCatalogDiscontinued;
};

export type ProformaMode = 'sin-contrato' | 'contrato-abierto';
export type ProformaStatus = 'draft' | 'issued';
export type ContractPriceCurrency = 'local' | 'usd';
export type SalesPartOrigin = 'shared' | 'proformas' | 'contract';

export type SalesCatalogKind = 'consumibles' | 'repuestos';
export type SalesCatalogDiscontinued = 'active' | 'discontinued' | 'unknown';

export type SalesCatalogItem = {
  id: string;
  kind: SalesCatalogKind;
  code: string;
  description: string;
  group: string;
  priceUsd: number | null;
  priceLocal: number | null;
  stock: number | null;
  discontinued: SalesCatalogDiscontinued;
};

export type SalesCatalogMeta = {
  kind: SalesCatalogKind;
  fileName: string;
  updatedAt: string;
  rowCount: number;
  invalidRows: number;
  duplicateRows: number;
  hasDiscontinuedColumn: boolean;
  sourceBatchId?: string;
  sourceFileId?: string;
};

export type SalesCatalogSnapshot = {
  meta: SalesCatalogMeta;
  items: SalesCatalogItem[];
};

export type SalesCatalogs = Record<SalesCatalogKind, SalesCatalogSnapshot | null>;

export type OpenContractItem = {
  id: string;
  kind: 'consumibles' | 'repuestos';
  code: string;
  description: string;
  group: string;
  priceUsd: number | null;
  priceLocal: number | null;
};

export type OpenContractMeta = {
  fileName: string;
  updatedAt: string;
  rowCount: number;
  invalidRows: number;
  duplicateRows: number;
  sourceFormat: 'xlsx' | 'pdf';
  priceCurrency: ContractPriceCurrency;
  hasKindColumn: boolean;
  sourceBatchId?: string;
  sourceFileId?: string;
};

export type OpenContractSnapshot = {
  meta: OpenContractMeta;
  items: OpenContractItem[];
};

export type ProformaHeader = {
  customerName: string;
  customerContact: string;
  serviceReport: string;
  serviceReportNumber: string;
  reference: string;
  issuedAt: string;
  attendedBy: string;
  modelName: string;
  serialNumber: string;
  mode: ProformaMode;
};

export type ProformaLineInput = {
  partId?: string;
  kind: 'part' | 'labor';
  catalogKind?: SalesCatalogKind;
  source?: SalesPartOrigin;
  /** Metadata del catálogo que el formato legado mostraba junto a la línea. */
  sourceStock?: number | null;
  sourceDiscontinuedStatus?: SalesCatalogDiscontinued;
  description?: string;
  code?: string;
  costLocal?: number | null;
  unitPriceUsd?: number | null;
  unitPriceLocal?: number | null;
  quantity: number;
};

export type ProformaLine = {
  id: string;
  partId: string | null;
  kind: 'part' | 'labor';
  catalogKind?: SalesCatalogKind;
  code: string;
  description: string;
  quantity: number;
  sourceStock?: number | null;
  sourceDiscontinuedStatus?: SalesCatalogDiscontinued;
  costLocal: number | null;
  unitPriceUsd: number | null;
  unitPriceLocal: number | null;
  lineTotalLocal: number;
};

export type Proforma = ProformaHeader & {
  id: string;
  status: ProformaStatus;
  currency: 'PYG' | 'USD';
  pricing: PricingSettings;
  createdAt: string;
  updatedAt: string;
  lines: ProformaLine[];
  totalLocal: number;
};

export type ProformaSummary = Pick<
  Proforma,
  'id' | 'customerName' | 'reference' | 'issuedAt' | 'status' | 'currency' | 'totalLocal' | 'updatedAt'
> & {
  totalUsd: number;
};
