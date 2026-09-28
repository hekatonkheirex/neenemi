export const CONSUMABLES_SOURCE_TYPES = [
  'consumibles',
  'repuestos',
  'uso-repuestos',
  'salida-consumibles',
  'salida-repuestos',
] as const;
import type { SourceDetail } from '../../core/source-details';

export type ConsumablesSourceType = (typeof CONSUMABLES_SOURCE_TYPES)[number];
export type ConsumablesOutputSourceType = Extract<ConsumablesSourceType, `salida-${string}`>;

export type ConsumablesFamily = 'T03' | 'T06' | 'GPR53';
export type ConsumablesRecordKind = 'consumable' | 'part';
export type ConsumablesClassification = 'original' | 'compatible';

export type ConsumablesSourceOperational = {
  cabId?: string;
  division?: string;
  dispatchNumber?: string;
  technician?: string;
  branch?: string;
  dataReference?: string;
  sourceSector?: string;
  sourceCommercialArea?: string;
  sourceContractReference?: string;
  active?: string;
  contractType?: string;
  contractStartsAt?: string;
  contractEndsAt?: string;
  serviceReportNumber?: string;
  taskCompleted?: string;
  partsUsed?: string;
};

export type ConsumablesOutputSourceOperational = {
  yieldPerUnit?: string;
  observations?: string;
  contact?: string;
  sourceSector?: string;
  sourceCommercialArea?: string;
  sourceContract?: string;
};

export type ParsedConsumablesRow = {
  recordedAt: string;
  month: string;
  modelLabel: string;
  serialNumber: string;
  partCode: string;
  description: string;
  quantity: number;
  costUsd: number;
  recordKind: ConsumablesRecordKind;
  classification: ConsumablesClassification;
  category: string;
  family: ConsumablesFamily;
  sourceCustomerName?: string;
  sourceOrderReference?: string;
  sourceUnitPricePyg?: number | null;
  sourceTotalPyg?: number | null;
  sourceOperational?: ConsumablesSourceOperational;
  sourceDetails?: SourceDetail[];
  sourceSheetName?: string;
  sourceRowNumber?: number;
};

export type ParsedConsumablesOutputRow = {
  recordKind: ConsumablesRecordKind;
  documentNumber: number;
  recordedAt: string;
  month: string;
  modelLabel: string;
  serialNumber: string;
  partCode: string;
  description: string;
  quantity: number;
  yieldPages: number;
  technician: string;
  serviceReportNumber: number;
  sourceCustomerName: string;
  sourceUnitPricePyg?: number | null;
  sourceTotalPyg?: number | null;
  sourceOperational?: ConsumablesOutputSourceOperational;
  sourceDetails?: SourceDetail[];
  classification: ConsumablesClassification;
  category: string;
  family: ConsumablesFamily;
  sourceSheetName?: string;
  sourceRowNumber?: number;
};

export type ConsumablesRecord = ParsedConsumablesRow & {
  id: string;
  sourceType: ConsumablesSourceType | null;
  customerName: string;
  customerType: string;
  commercialArea: string;
  contractReference: string;
  orderReference: string;
  contractCommercialArea: string;
  division: string;
  contractType: string;
  equipmentId: string;
  sourceFileName: string;
  sourceCustomerName: string;
  sourceOrderReference: string;
  sourceUnitPricePyg: number | null;
  sourceTotalPyg: number | null;
  sourceOperational?: ConsumablesSourceOperational;
  sourceDetails: SourceDetail[];
  sourceSheetName: string;
  sourceRowNumber: number;
};

export type ConsumablesOutputRecord = ParsedConsumablesOutputRow & {
  id: string;
  sourceType: ConsumablesSourceType | null;
  customerName: string;
  customerType: string;
  commercialArea: string;
  contractReference: string;
  orderReference: string;
  contractCommercialArea: string;
  division: string;
  contractType: string;
  equipmentId: string;
  sourceFileName: string;
  sourceUnitPricePyg: number | null;
  sourceTotalPyg: number | null;
  sourceOperational?: ConsumablesOutputSourceOperational;
  sourceDetails: SourceDetail[];
  sourceSheetName: string;
  sourceRowNumber: number;
};

export type ConsumablesImportResult = {
  sourceType: ConsumablesSourceType;
  accepted: number;
  consumables: number;
  parts: number;
  duplicates: number;
  skippedNoEquipment: number;
  skippedContract: number;
  skippedOutOfScope: number;
};

export type ConsumablesSummary = {
  sourceFiles: number;
  records: number;
  consumables: number;
  parts: number;
  originalRecords: number;
  compatibleRecords: number;
  equipment: number;
  totalCostUsd: number;
  firstMonth: string | null;
  lastMonth: string | null;
};

export type ConsumablesOutputsSummary = {
  sourceFiles: number;
  records: number;
  consumables: number;
  parts: number;
  equipment: number;
  totalQuantity: number;
  firstMonth: string | null;
  lastMonth: string | null;
};

export type ConsumablesAggregate = {
  key: string;
  label: string;
  records: number;
  quantity: number;
  costUsd: number;
  originalRecords: number;
  compatibleRecords: number;
  equipment: number;
};

export type ConsumablesEquipmentAggregate = ConsumablesAggregate & {
  equipmentId: string;
  customerName: string;
  modelLabel: string;
  serialNumber: string;
};

export type ConsumablesContractAggregate = {
  key: string;
  reference: string;
  orderReference: string;
  contractCommercialArea: string;
  division: string;
  customerName: string;
  contractType: string;
  records: number;
  quantity: number;
  costUsd: number;
  consumableCostUsd: number;
  partCostUsd: number;
  consumableRecords: number;
  partRecords: number;
  originalRecords: number;
  compatibleRecords: number;
  equipment: number;
};

export type ConsumablesDispatchEquipmentAggregate = {
  key: string;
  equipmentId: string;
  customerName: string;
  modelLabel: string;
  serialNumber: string;
  contractReference: string;
  orderReference: string;
  contractCommercialArea: string;
  division: string;
  contractType: string;
  records: number;
  consumableRecords: number;
  partRecords: number;
  consumableQuantity: number;
  partQuantity: number;
  originalRecords: number;
  compatibleRecords: number;
  lastRecordedAt: string;
};

export type ConsumablesAnalytics = {
  monthly: ConsumablesAggregate[];
  families: ConsumablesAggregate[];
  categories: ConsumablesAggregate[];
  topEquipment: ConsumablesEquipmentAggregate[];
  contracts: ConsumablesContractAggregate[];
  dispatchEquipment: ConsumablesDispatchEquipmentAggregate[];
};
