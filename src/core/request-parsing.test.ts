import { describe, expect, it } from 'vitest';
import { parseListLimit, parseOperationalFilters, parsePageRequest, parsePositiveInteger } from './request-parsing';

describe('request parsing', () => {
  it('parses list limits with a default and bounds', () => {
    expect(parseListLimit(undefined)).toBe(500);
    expect(parseListLimit('10000')).toBe(10000);
    expect([parseListLimit('0'), parseListLimit('10001'), parseListLimit('1.5'), parseListLimit(5)]).toEqual([null, null, null, null]);
  });

  it('parses page requests with defaults and caps', () => {
    expect(parsePageRequest(undefined, undefined)).toEqual({ page: 1, pageSize: 50 });
    expect(parsePageRequest('3', '100')).toEqual({ page: 3, pageSize: 100 });
    expect([parsePageRequest('0', '10'), parsePageRequest('1', '101'), parsePageRequest('x', '10')]).toEqual([null, null, null]);
    expect(parsePositiveInteger('-1')).toBeNull();
  });

  it('keeps only string operational filters', () => {
    expect(parseOperationalFilters({ sector: 'Banca', dateFrom: '2026-01-01', department: 3 })).toMatchObject({ sector: 'Banca', dateFrom: '2026-01-01', department: undefined });
    expect(parseOperationalFilters(null)).toEqual({});
  });
});
