import { afterEach, describe, expect, it, vi } from 'vitest';
import { importCatalogFile } from './import-file';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('importCatalogFile', () => {
  it('does not create another import when the same file is already the current source', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ current: true, batchId: 'batch-current' }), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const file = makeLegacyListFile();

    const result = await importCatalogFile(file);

    expect(result).toMatchObject({ duplicate: true, batchId: 'batch-current', parts: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('continues the normal import when the file is not the current source', async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({ current: false, batchId: null }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'batch-new' }), { status: 201 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ fileId: 'file-new' }), { status: 201 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ parts: 1 }), { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await importCatalogFile(makeLegacyListFile());

    expect(result).toMatchObject({ duplicate: false, batchId: 'batch-new', parts: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(String(fetchMock.mock.calls[3]?.[0])).toBe('/api/catalog/parts');
  });

  it('shows the archive error and marks the batch failed when preserving the source is rejected', async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({ current: false, batchId: null }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'batch-source-failed' }), { status: 201 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: 'El archivo supera 35 MB.' }), { status: 413 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(importCatalogFile(makeLegacyListFile())).rejects.toThrow('El archivo supera 35 MB.');

    expect(String(fetchMock.mock.calls[3]?.[0])).toBe('/api/imports/batch-source-failed/status');
    expect(JSON.parse(String(fetchMock.mock.calls[3]?.[1]?.body))).toEqual({ status: 'failed' });
  });

  it('identifies a body-parser size rejection even when the response is not JSON', async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({ current: false, batchId: null }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'batch-too-large' }), { status: 201 }))
      .mockResolvedValueOnce(new Response('<html>Payload Too Large</html>', { status: 413 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(importCatalogFile(makeLegacyListFile())).rejects.toThrow(/límite.*413/i);
  });
});

function makeLegacyListFile(): File {
  const contents = JSON.stringify({
    families: [{
      id: 'canon',
      name: 'Canon',
      models: [{
        name: 'iR ADV C3325i',
        items: [{ code: 'FK-123', desc: 'Kit de mantenimiento', stock: 2, costo: 10, ventaGs: 126000 }],
      }],
    }],
  });
  return {
    name: 'listado.json',
    type: 'application/json',
    arrayBuffer: async () => new TextEncoder().encode(contents).buffer,
  } as File;
}
