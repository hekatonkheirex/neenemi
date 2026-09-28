import { afterEach, describe, expect, it, vi } from 'vitest';
import { checkCurrentAppliedImport } from './import-status';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('checkCurrentAppliedImport', () => {
  it('checks the current file using its domain and optional source type', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ current: true, batchId: 'batch-1' }), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const current = await checkCurrentAppliedImport({
      domain: 'sales-catalog',
      sourceType: 'proformas-catalog-consumibles',
      sourceHash: 'a'.repeat(64),
    });

    expect(current).toEqual({ current: true, batchId: 'batch-1' });
    const requestUrl = new URL(String(fetchMock.mock.calls[0]?.[0]), 'http://localhost');
    expect(requestUrl.pathname).toBe('/api/imports/check-current');
    expect(requestUrl.searchParams.get('domain')).toBe('sales-catalog');
    expect(requestUrl.searchParams.get('sourceType')).toBe('proformas-catalog-consumibles');
    expect(requestUrl.searchParams.get('sourceHash')).toBe('a'.repeat(64));
  });

  it('returns false when another file is the current source', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ current: false, batchId: null }), { status: 200 }),
    ));

    await expect(checkCurrentAppliedImport({ domain: 'catalog', sourceHash: 'b'.repeat(64) }))
      .resolves.toEqual({ current: false, batchId: null });
  });
});
