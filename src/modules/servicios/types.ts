export const SERVICE_SOURCE_TYPES = ['servicios'] as const;
import type { SourceDetail } from '../../core/source-details';

export type ServiceSourceType = (typeof SERVICE_SOURCE_TYPES)[number];

export type ServiceSourceOperational = {
  division?: string;
  receptionType?: string;
  responseTime?: string;
  branch?: string;
  workTime?: string;
  responseCompliance?: string;
  serviceTime?: string;
  serviceCompliance?: string;
  closed?: string;
  requestedService?: string;
  finishedAt?: string;
  status?: string;
  interior?: string;
  mobileClosed?: string;
  rework?: string;
  previousServiceNumber?: string;
  previousTechnician?: string;
  branchCity?: string;
  customerCity?: string;
  papers?: string;
  counters?: string;
};

export type ParsedServiceRow = {
  serviceNumber: number;
  orderReference: string;
  recordedAt: string;
  month: string;
  serviceType: string;
  taskType: string;
  sourceContractType: string;
  technician: string;
  taskCompleted: string;
  partsUsed: string;
  modelLabel: string;
  serialNumber: string;
  sourceCustomerName: string;
  sourceOperational?: ServiceSourceOperational;
  sourceDetails?: SourceDetail[];
  family: 'T03' | 'T06' | 'GPR53';
  sourceSheetName?: string;
  sourceRowNumber?: number;
};

export type ServiceRecord = ParsedServiceRow & {
  id: string;
  customerName: string;
  customerType: string;
  commercialArea: string;
  contractReference: string;
  contractType: string;
  equipmentId: string;
  sourceFileName: string;
  sourceOperational?: ServiceSourceOperational;
  sourceDetails: SourceDetail[];
  sourceSheetName: string;
  sourceRowNumber: number;
};

export type ServiceImportResult = {
  sourceType: ServiceSourceType;
  accepted: number;
  duplicates: number;
  skippedNoEquipment: number;
  skippedContract: number;
  skippedOutOfScope: number;
};

export type ServiceSummary = {
  sourceFiles: number;
  records: number;
  equipment: number;
  firstMonth: string | null;
  lastMonth: string | null;
  taskTypes: Array<{ key: string; records: number }>;
};
