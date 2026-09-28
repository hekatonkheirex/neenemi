import { describe, expect, it } from 'vitest';
import {
  analyzePdfDocument,
  type PdfAnalysisDependencies,
  type PdfDocumentLike,
  type PdfProgressEvent,
} from './pdf-analysis';
import type { RasterImageData } from './pixel-coverage';

function solid(red: number, green: number, blue: number): RasterImageData {
  return { width: 1, height: 1, data: Uint8ClampedArray.from([red, green, blue, 255]) };
}

describe('analyzePdfDocument', () => {
  it('reports page progress and excludes failed pages from the average', async () => {
    const progress: PdfProgressEvent[] = [];
    let destroyed = false;
    const document: PdfDocumentLike = {
      numPages: 3,
      getPage: async (pageNumber) => ({ pageNumber }),
      destroy: async () => { destroyed = true; },
    };
    const dependencies: PdfAnalysisDependencies = {
      loadDocument: async (data) => {
        expect(data.byteLength).toBe(4);
        return document;
      },
      rasterizePage: async (page) => {
        if (typeof page !== 'object' || page === null || !('pageNumber' in page)) {
          throw new Error('Falta la página simulada.');
        }
        if (page.pageNumber === 2) throw new Error('Página dañada.');
        return page.pageNumber === 1 ? solid(0, 0, 0) : solid(255, 255, 255);
      },
    };

    const result = await analyzePdfDocument(
      { arrayBuffer: async () => new ArrayBuffer(4) },
      dependencies,
      (event) => progress.push(event),
    );

    expect(result.totalPages).toBe(3);
    expect(result.coverage.pages.map(({ page }) => page)).toEqual([1, 3]);
    expect(result.coverage.average).toEqual({ black: 50, cyan: 0, magenta: 0, yellow: 0 });
    expect(result.failedPages).toEqual([{ page: 2, message: 'Página dañada.' }]);
    expect(destroyed).toBe(true);
    expect(progress.map(({ status }) => status)).toEqual([
      'page-started', 'page-completed', 'page-started', 'page-failed',
      'page-started', 'page-completed', 'completed',
    ]);
  });

  it('destroys the PDF when progress reporting aborts the analysis', async () => {
    let destroyed = false;
    const dependencies: PdfAnalysisDependencies = {
      loadDocument: async () => ({
        numPages: 1,
        getPage: async () => ({}),
        destroy: () => { destroyed = true; },
      }),
      rasterizePage: async () => solid(255, 255, 255),
    };

    await expect(analyzePdfDocument(
      { arrayBuffer: async () => new ArrayBuffer(0) },
      dependencies,
      () => { throw new Error('cancelado'); },
    )).rejects.toThrow('cancelado');
    expect(destroyed).toBe(true);
  });
});
