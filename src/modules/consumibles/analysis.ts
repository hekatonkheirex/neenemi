import type {
  ConsumablesClassification,
  ConsumablesFamily,
  ConsumablesRecordKind,
  ConsumablesSourceType,
} from './types';

export const PYG_TO_USD = 0.0001675188;
export const PYG_USD_RATE_DATE = '2026-08-04';

export function usdToPyg(valueUsd: number): number {
  if (!Number.isFinite(valueUsd)) return 0;
  return Math.round(valueUsd / PYG_TO_USD);
}

const RE_T03 = /(?<!\d)(?<!C)(?<!c)(525|527|529|615|617|619|715|717|719)(?:i|I|\b)/i;
const RE_T06 = /1643/i;
const RE_GPR53 = /(?:IRC?\s*|C\s*)(3025|3125|3226|3325|3330|3525|3530)/i;
const RE_FOREIGN_GPR = /GPR[\s-]*(?!53\b)\d+/i;
const RE_ANY_MODEL = /(?:IR|ADV|iR|IRADV|DX)[\s-]*C?(\d{3,4})/gi;
const TARGET_MODELS = new Set([
  '525', '527', '529', '615', '617', '619', '715', '717', '719',
  '1643',
  '3025', '3125', '3226', '3325', '3330', '3525', '3530',
]);

const RE_PAPER = /(RESMA|PAPEL)/i;
const MIGRATE_KW = /(TONER|TÓNER|CARTRIDGE|CARTUCHO|CILINDRO|DRUM\s*UNIT|KIT\s*DE\s*CILINDRO|RODILLO|ROLLER|ADF\s*(KIT|MAINTENANCE)|SEPARATION\s*(PAD|ROLLER)|SEPARACION|KIT\s*RODILLO|KIT\s*DE\s*RODILLO|RUEDAS\s*DE\s*SEP|PAD\s*DEL\s*CASSETTE)/i;
const MIGRATE_EXCLUDE = /(PCB|CONTROLLER|CABLE|SENSOR|BOARD|MOTOR|PRESION|PRESSURE)/i;

const RE_T03_DESC = /(?:T03|(?:ADV|DX)[\s-]*(?:525|527|529|615|617|619|715|717|719))/i;
const RE_T06_DESC = /(?:T06|1643)/i;
const RE_GPR53_DESC = /(?:GPR[\s-]*53|(?:ADV|IRC?)[\s-]*(?:3025|3125|3226|3325|3330|3525|3530))/i;

const RE_ORIG_DASHED = /^[A-Z0-9]{2,4}-[A-Z0-9]{4}-[A-Z0-9]{3}$/i;
const RE_ORIG_10CHAR = /^[0-9]{4}[A-Z]\d{3}[A-Z]{2}$/i;
const ORIGINAL_CODES = new Set([
  '2725C002AA', '2725C002', '2724C002', '2724C002AA',
  '8527B003AA', '8527B003', '8528B004AA', '8528B004',
  '8525B002AA', '8525B002', '8526B003AA', '8526B003',
]);
const COMPATIBLE_CODES = new Set([
  'CRG-T03', 'CRGT03', 'T03', 'CRG-T06', 'CRGT06', 'T06', 'GPR-53', 'GPR53',
  'CSE006350', 'CSE005800', 'CSE006190', 'AL5228N', 'AL5228', 'AL5672',
  'AL5673', 'AL5674', 'AL5675',
]);

export function detectFamily(equipmentName: string): ConsumablesFamily | null {
  if (RE_T03.test(equipmentName)) return 'T03';
  if (RE_T06.test(equipmentName)) return 'T06';
  if (RE_GPR53.test(equipmentName)) return 'GPR53';
  return null;
}

export function detectFamilyFromConsumable(code: string, description: string): ConsumablesFamily | null {
  const text = `${code} ${description}`;
  if (RE_T03_DESC.test(text)) return 'T03';
  if (RE_T06_DESC.test(text)) return 'T06';
  if (RE_GPR53_DESC.test(text)) return 'GPR53';
  return null;
}

export function descMentionsForeignModel(description: string): boolean {
  if (RE_FOREIGN_GPR.test(description)) return true;
  const models = [...description.matchAll(RE_ANY_MODEL)].map((match) => match[1]);
  if (models.length === 0) return false;
  return !models.some((model) => TARGET_MODELS.has(model));
}

export function classifyCode(code: string): ConsumablesClassification {
  const normalized = code.trim().toUpperCase();
  if (ORIGINAL_CODES.has(normalized) || RE_ORIG_DASHED.test(normalized) || RE_ORIG_10CHAR.test(normalized)) return 'original';
  if (COMPATIBLE_CODES.has(normalized)) return 'compatible';
  return 'compatible';
}

export function classifyCategory(description: string): string {
  const value = description.toUpperCase();
  if (/CILINDRO|DRUM\s*UNIT|KIT\s*DE\s*CILINDRO/.test(value)) return 'cilindro';
  if (/ADF\s*(KIT|MAINTENANCE)/.test(value)) return 'adf_kit';
  if (/SEPARATION\s*(PAD|ROLLER)|SEPARACION|RUEDAS\s*DE\s*SEP|PAD\s*DEL\s*CASSETTE/.test(value)) return 'separation_pad';
  if (/RODILLO|ROLLER|KIT\s*RODILLO|KIT\s*DE\s*RODILLO/.test(value)) return 'rodillo';
  return 'toner';
}

export function classifyRecordKind(sourceType: ConsumablesSourceType, description: string): ConsumablesRecordKind {
  if (sourceType === 'consumibles' || sourceType === 'salida-consumibles') return 'consumable';
  return MIGRATE_KW.test(description) && !MIGRATE_EXCLUDE.test(description) ? 'consumable' : 'part';
}

export function isPaper(code: string, description: string): boolean {
  return RE_PAPER.test(code) || RE_PAPER.test(description);
}

export function safeNumber(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (value === null || value === undefined || value === '') return 0;
  const parsed = Number.parseFloat(String(value).replace(/[^\d.,-]/g, '').replace(/,/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

export function roundMoney(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function formatDate(value: unknown): string {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? '' : value.toISOString().slice(0, 10);
  const text = value ? String(value).trim() : '';
  const localDate = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:$|[ T])/.exec(text);
  if (!localDate) return text.slice(0, 10);
  const day = Number(localDate[1]);
  const month = Number(localDate[2]);
  const year = Number(localDate[3]);
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const lastDay = month === 2 ? leapYear ? 29 : 28 : month === 4 || month === 6 || month === 9 || month === 11 ? 30 : 31;
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > lastDay) return '';
  return `${localDate[3]}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function formatMonth(value: unknown): string {
  const monthOnly = typeof value === 'string' ? /^(\d{1,2})\/(\d{4})$/.exec(value.trim()) : null;
  if (monthOnly) {
    const month = Number(monthOnly[1]);
    return month >= 1 && month <= 12 ? `${monthOnly[2]}-${String(month).padStart(2, '0')}` : '';
  }
  return formatDate(value).slice(0, 7);
}

export function normalizeRecordKey(code: string, serial: string, recordedAt: string): string {
  return [code, serial, recordedAt]
    .map((value) => value.normalize('NFKC').trim().replace(/\s+/g, ' ').toUpperCase())
    .join('|');
}

export function normalizeOutputRecordKey(
  documentNumber: number,
  code: string,
  serial: string,
  recordedAt: string,
  quantity: number,
): string {
  return [documentNumber, code, serial, recordedAt, quantity]
    .map((value) => String(value).normalize('NFKC').trim().replace(/\s+/g, ' ').toUpperCase())
    .join('|');
}

