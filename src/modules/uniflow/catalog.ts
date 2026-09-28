import type {
  UniflowDeviceModel,
  UniflowPriceCatalog,
  UniflowPriceTabId,
  UniflowSku,
  UniflowDeviceType,
} from './types';

export const UNIFLOW_DEVICE_MODELS: readonly UniflowDeviceModel[] = [
  { name: 'iRADV DX 8905', type: 'T1', color: 'Monocromo' },
  { name: 'imageFORCE 6100', type: 'T1', color: 'Monocromo' },
  { name: 'iRADV DX 6980', type: 'T1', color: 'Monocromo' },
  { name: 'iRADV DX 4945', type: 'T1', color: 'Monocromo' },
  { name: 'iRADV DX 4935', type: 'T1', color: 'Monocromo' },
  { name: 'iRADV DX 4925', type: 'T1', color: 'Monocromo' },
  { name: 'imageFORCE 710', type: 'T1', color: 'Monocromo' },
  { name: 'imageFORCE 710Z', type: 'T1', color: 'Monocromo' },
  { name: 'imageFORCE C611', type: 'T1', color: 'Color' },
  { name: 'imageFORCE C611Z', type: 'T1', color: 'Color' },
  { name: 'iRADV DX C3935', type: 'T1', color: 'Color' },
  { name: 'iRADV DX C3926', type: 'T1', color: 'Color' },
  { name: 'imageFORCE C3150', type: 'T1', color: 'Color' },
  { name: 'imageFORCE C5100', type: 'T1', color: 'Color' },
  { name: 'imageFORCE C1333i', type: 'T1', color: 'Color' },
  { name: 'imageFORCE C1538iF', type: 'T1', color: 'Color' },
  { name: 'iR 1643iF', type: 'T2', color: 'Monocromo' },
  { name: 'iR 1643P', type: 'T2', color: 'Monocromo' },
  { name: 'iR C3326', type: 'T2', color: 'Color' },
  { name: 'imageFORCE C1333P', type: 'T2', color: 'Color' },
];

const sku = (minQty: number, maxQty: number | null, label: string, code: string, price: number): UniflowSku => ({
  minQty,
  maxQty,
  label,
  sku: code,
  price,
});

const T1_SKUS: UniflowSku[] = [
  sku(1, 9, '1-9', '3575B792AA', 44.37),
  sku(10, 24, '10-24', '3575B806AA', 25.82),
  sku(25, 49, '25-49', '3575B807AA', 19.36),
  sku(50, 74, '50-74', '3575B808AA', 17.42),
  sku(75, 99, '75-99', '3575B809AA', 15.49),
  sku(100, 149, '100-149', '3575B810AA', 14.21),
  sku(150, 199, '150-199', '3575B811AA', 13.55),
  sku(200, 249, '200-249', '3575B812AA', 12.91),
  sku(250, 499, '250-499', '3575B813AA', 12.27),
  sku(500, 999, '500-999', '3575B814AA', 11.62),
  sku(1000, 1999, '1000-1999', '3575B815AA', 9.99),
  sku(2000, 2999, '2000-2999', '3575B816AA', 9.40),
  sku(3000, null, '3000+', '3575B817AA', 8.82),
];

const T2_SKUS: UniflowSku[] = [
  sku(1, 9, '1-9', '3575B831AA', 22.59),
  sku(10, 24, '10-24', '3575B832AA', 16.94),
  sku(25, 49, '25-49', '3575B833AA', 13.22),
  sku(50, 74, '50-74', '3575B834AA', 11.89),
  sku(75, 99, '75-99', '3575B835AA', 10.70),
  sku(100, 149, '100-149', '3575B836AA', 9.65),
  sku(150, 199, '150-199', '3575B837AA', 8.68),
  sku(200, 249, '200-249', '3575B838AA', 8.25),
  sku(250, 499, '250-499', '3575B839AA', 7.85),
  sku(500, 999, '500-999', '3575B840AA', 7.43),
  sku(1000, 1999, '1000-1999', '3575B841AA', 6.53),
  sku(2000, 2999, '2000-2999', '3575B842AA', 6.22),
  sku(3000, null, '3000+', '3575B843AA', 5.91),
];

const T1_CIP_SKUS: UniflowSku[] = [
  sku(1, 9, '1-9', '3575B818AA', 48.81),
  sku(10, 24, '10-24', '3575B819AA', 28.40),
  sku(25, 49, '25-49', '3575B820AA', 21.30),
  sku(50, 74, '50-74', '3575B821AA', 19.19),
  sku(75, 99, '75-99', '3575B822AA', 17.04),
  sku(100, 149, '100-149', '3575B823AA', 15.63),
  sku(150, 199, '150-199', '3575B824AA', 14.93),
  sku(200, 249, '200-249', '3575B825AA', 14.21),
  sku(250, 499, '250-499', '3575B826AA', 13.52),
  sku(500, 999, '500-999', '3575B827AA', 12.79),
  sku(1000, 1999, '1000-1999', '3575B828AA', 10.98),
  sku(2000, 2999, '2000-2999', '3575B829AA', 10.35),
  sku(3000, null, '3000+', '3575B830AA', 9.70),
];

const T2_CIP_SKUS: UniflowSku[] = [
  sku(1, 9, '1-9', '3575B793AA', 24.42),
  sku(10, 24, '10-24', '3575B794AA', 14.21),
  sku(25, 49, '25-49', '3575B795AA', 10.67),
  sku(50, 74, '50-74', '3575B796AA', 9.59),
  sku(75, 99, '75-99', '3575B797AA', 8.52),
  sku(100, 149, '100-149', '3575B798AA', 7.83),
  sku(150, 199, '150-199', '3575B799AA', 7.47),
  sku(200, 249, '200-249', '3575B800AA', 7.10),
  sku(250, 499, '250-499', '3575B801AA', 6.74),
  sku(500, 999, '500-999', '3575B802AA', 6.41),
  sku(1000, 1999, '1000-1999', '3575B803AA', 5.50),
  sku(2000, 2999, '2000-2999', '3575B804AA', 5.17),
  sku(3000, null, '3000+', '3575B805AA', 4.86),
];

export const DEFAULT_UNIFLOW_PRICE_CATALOG: UniflowPriceCatalog = {
  version: 1,
  source: 'Catálogo base uniFLOW Online',
  lastModified: '28/05/26',
  lists: {
    t1: T1_SKUS,
    t2: T2_SKUS,
    t1_cip: T1_CIP_SKUS,
    t2_cip: T2_CIP_SKUS,
  },
};

export function cloneUniflowPriceCatalog(catalog: UniflowPriceCatalog): UniflowPriceCatalog {
  return {
    ...catalog,
    lists: Object.fromEntries(
      Object.entries(catalog.lists).map(([key, list]) => [key, list.map((item) => ({ ...item }))]),
    ) as UniflowPriceCatalog['lists'],
  };
}

export function getUniflowDeviceModel(modelName: string): UniflowDeviceModel | undefined {
  const normalized = normalizeText(modelName);
  return UNIFLOW_DEVICE_MODELS.find((model) => normalizeText(model.name) === normalized);
}

export function priceTabFor(type: UniflowDeviceType, withCIP: boolean): UniflowPriceTabId {
  if (type === 'T1') return withCIP ? 't1_cip' : 't1';
  return withCIP ? 't2_cip' : 't2';
}

export function normalizeUniflowText(value: string): string {
  return normalizeText(value).replace(/\s+/g, ' ');
}

function normalizeText(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}
