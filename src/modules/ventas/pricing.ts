import type { CatalogPart } from '../catalogo/repository';
import type { PricingSettings } from './types';

export type SalePrice = {
  salePriceUsd: number;
  salePriceLocal: number;
};

export function calculateSalePrice(
  part: Pick<CatalogPart, 'priceUsd'> & Partial<Pick<CatalogPart, 'priceLocal' | 'costAvailable'>>,
  pricing: PricingSettings,
): SalePrice {
  if (part.costAvailable === false) {
    return {
      salePriceUsd: 0,
      salePriceLocal: part.priceLocal ?? 0,
    };
  }
  const salePriceUsd = round(part.priceUsd * pricing.factor, 4);
  const salePriceLocal = roundGs100(salePriceUsd * pricing.exchangeRate);
  return { salePriceUsd, salePriceLocal };
}

export function roundGs100(value: number): number {
  return Math.round(value / 100) * 100;
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
