import type { OperationalFilters } from './operational-filters';
import { isRecord, queryString } from './validation';
import { MAX_LIST_LIMIT } from './list-limit';

export function parseOperationalFilters(value: unknown): OperationalFilters {
  if (!isRecord(value)) return {};
  return {
    sector: queryString(value.sector),
    department: queryString(value.department),
    contractType: queryString(value.contractType),
    dateFrom: queryString(value.dateFrom),
    dateTo: queryString(value.dateTo),
  };
}


export function parseListLimit(value: unknown): number | null {
  if (value === undefined) return 500;
  if (typeof value !== 'string' || !/^\d+$/.test(value)) return null;
  const limit = Number(value);
  return Number.isInteger(limit) && limit >= 1 && limit <= MAX_LIST_LIMIT ? limit : null;
}


export function parsePageRequest(pageValue: unknown, pageSizeValue: unknown): { page: number; pageSize: number } | null {
  const page = pageValue === undefined ? 1 : parsePositiveInteger(pageValue);
  const pageSize = pageSizeValue === undefined ? 50 : parsePositiveInteger(pageSizeValue);
  if (page === null || page > 1_000_000 || pageSize === null || pageSize > 100) return null;
  return { page, pageSize };
}


export function parsePositiveInteger(value: unknown): number | null {
  if (typeof value !== 'string' || !/^\d+$/.test(value)) return null;
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 1 ? number : null;
}

export function parseRawRowsLimit(value: unknown): number | null {
  if (value === undefined) return 100;
  if (typeof value !== 'string' || !/^\d+$/.test(value)) return null;
  const limit = Number(value);
  return Number.isInteger(limit) && limit >= 1 && limit <= 500 ? limit : null;
}

export function parseRawRowsOffset(value: unknown): number | null {
  if (value === undefined) return 0;
  if (typeof value !== 'string' || !/^\d+$/.test(value)) return null;
  const offset = Number(value);
  return Number.isInteger(offset) && offset >= 0 && offset <= 1_000_000 ? offset : null;
}
