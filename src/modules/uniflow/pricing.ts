import { getUniflowDeviceModel, priceTabFor } from './catalog';
import type {
  UniflowAddedDevice,
  UniflowConfigurationSummary,
  UniflowDeviceType,
  UniflowPriceCatalog,
  UniflowSku,
} from './types';

export type UniflowNextTierUpgrade = {
  unitsNeeded: number;
  newPrice: number;
};

export function calculateUniflowConfiguration(
  added: readonly UniflowAddedDevice[],
  months: number,
  catalog: UniflowPriceCatalog,
): UniflowConfigurationSummary {
  const mappedDevices = added
    .map((device) => {
      const model = getUniflowDeviceModel(device.modelName);
      if (!model) {
        if (device.modelName.trim()) console.warn(`Modelo uniFLOW desconocido: ${device.modelName}`);
        return null;
      }
      return {
        modelName: model.name,
        quantity: device.quantity,
        type: model.type,
        color: model.color,
        withCIP: Boolean(device.withCIP),
      };
    })
    .filter((device): device is NonNullable<typeof device> => device !== null && device.quantity > 0);

  const t1TotalQty = mappedDevices
    .filter((device) => device.type === 'T1')
    .reduce((total, device) => total + device.quantity, 0);
  const t2TotalQty = mappedDevices
    .filter((device) => device.type === 'T2')
    .reduce((total, device) => total + device.quantity, 0);
  const t1CIPQty = mappedDevices
    .filter((device) => device.type === 'T1' && device.withCIP)
    .reduce((total, device) => total + device.quantity, 0);
  const t2CIPQty = mappedDevices
    .filter((device) => device.type === 'T2' && device.withCIP)
    .reduce((total, device) => total + device.quantity, 0);

  const t1SKU = findTier(catalog.lists.t1, t1TotalQty);
  const t2SKU = findTier(catalog.lists.t2, t2TotalQty);
  const t1CIPSKU = findTier(catalog.lists.t1_cip, t1CIPQty);
  const t2CIPSKU = findTier(catalog.lists.t2_cip, t2CIPQty);
  const t1TotalCost = tierCost(t1SKU, t1TotalQty);
  const t2TotalCost = tierCost(t2SKU, t2TotalQty);
  const t1CIPTotalCost = tierCost(t1CIPSKU, t1CIPQty);
  const t2CIPTotalCost = tierCost(t2CIPSKU, t2CIPQty);
  const monthlyTotal = roundCurrency(t1TotalCost + t2TotalCost + t1CIPTotalCost + t2CIPTotalCost);
  const validMonths = Number.isInteger(months) && months > 0 ? months : 0;

  return {
    months: validMonths,
    addedDevices: mappedDevices,
    t1TotalQty,
    t2TotalQty,
    t1SKU,
    t2SKU,
    t1TotalCost,
    t2TotalCost,
    t1CIPQty,
    t2CIPQty,
    t1CIPSKU,
    t2CIPSKU,
    t1CIPTotalCost,
    t2CIPTotalCost,
    monthlyTotal,
    annualTotal: roundCurrency(monthlyTotal * 12),
    contractTotal: roundCurrency(monthlyTotal * validMonths),
  };
}

export function getUniflowNextTierUpgrade(
  type: UniflowDeviceType,
  currentQty: number,
  catalog: UniflowPriceCatalog,
): UniflowNextTierUpgrade | null {
  if (currentQty <= 0) return null;
  const list = catalog.lists[priceTabFor(type, false)];
  const currentIndex = list.findIndex((item) => currentQty >= item.minQty && isWithinMax(item, currentQty));
  if (currentIndex < 0 || currentIndex >= list.length - 1) return null;
  const nextTier = list[currentIndex + 1];
  return { unitsNeeded: nextTier.minQty - currentQty, newPrice: nextTier.price };
}

function findTier(list: readonly UniflowSku[], quantity: number): UniflowSku | null {
  if (quantity <= 0) return null;
  return list.find((item) => quantity >= item.minQty && isWithinMax(item, quantity)) ?? null;
}

function tierCost(tier: UniflowSku | null, quantity: number): number {
  return tier ? roundCurrency(tier.price * quantity) : 0;
}

function isWithinMax(tier: UniflowSku, quantity: number): boolean {
  return tier.maxQty === null || quantity <= tier.maxQty;
}

function roundCurrency(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
