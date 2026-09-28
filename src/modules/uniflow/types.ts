export const UNIFLOW_PRICE_TABS = ['t1', 't2', 't1_cip', 't2_cip'] as const;
export type UniflowPriceTabId = (typeof UNIFLOW_PRICE_TABS)[number];

export type UniflowDeviceType = 'T1' | 'T2';
export type UniflowDeviceColor = 'Monocromo' | 'Color';

export type UniflowDeviceModel = {
  name: string;
  type: UniflowDeviceType;
  color: UniflowDeviceColor;
};

export type UniflowAddedDevice = {
  id: string;
  modelName: string;
  quantity: number;
  withCIP?: boolean;
};

export type UniflowSku = {
  minQty: number;
  maxQty: number | null;
  label: string;
  sku: string;
  price: number;
};

export type UniflowPriceLists = Record<UniflowPriceTabId, UniflowSku[]>;

export type UniflowPriceCatalog = {
  version: number;
  source: string;
  lastModified: string;
  lists: UniflowPriceLists;
};

export type UniflowConfigurationSummary = {
  months: number;
  addedDevices: Array<{
    modelName: string;
    quantity: number;
    type: UniflowDeviceType;
    color: UniflowDeviceColor;
    withCIP: boolean;
  }>;
  t1TotalQty: number;
  t2TotalQty: number;
  t1SKU: UniflowSku | null;
  t2SKU: UniflowSku | null;
  t1TotalCost: number;
  t2TotalCost: number;
  t1CIPQty: number;
  t2CIPQty: number;
  t1CIPSKU: UniflowSku | null;
  t2CIPSKU: UniflowSku | null;
  t1CIPTotalCost: number;
  t2CIPTotalCost: number;
  monthlyTotal: number;
  annualTotal: number;
  contractTotal: number;
};

export type UniflowConfigurationInput = {
  months: number;
  devices: UniflowAddedDevice[];
};
