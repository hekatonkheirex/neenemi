import { normalizePageCoverage, summarizeDocumentCoverage } from './calculations';
import { analyzePageCoverage, type RasterImageData } from './pixel-coverage';
import type { CoveragePageFailure, DocumentCoverage, PageCoverage } from './types';

export interface PdfInput {
  arrayBuffer(): Promise<ArrayBuffer>;
}

export type PdfPageLike = unknown;

export interface PdfDocumentLike {
  readonly numPages: number;
  getPage(pageNumber: number): Promise<PdfPageLike>;
  destroy?(): Promise<void> | void;
}

export interface PdfAnalysisDependencies {
  loadDocument(data: ArrayBuffer): Promise<PdfDocumentLike>;
  rasterizePage(page: PdfPageLike, pageNumber: number): Promise<RasterImageData>;
}

export type PdfPageFailure = CoveragePageFailure;

interface PdfProgressBase {
  totalPages: number;
  completedPages: number;
  successfulPages: number;
  failedPages: number;
}

export type PdfProgressEvent =
  | (PdfProgressBase & { status: 'page-started'; page: number })
  | (PdfProgressBase & { status: 'page-completed'; page: number; coverage: PageCoverage })
  | (PdfProgressBase & { status: 'page-failed'; page: number; error: PdfPageFailure })
  | (PdfProgressBase & { status: 'completed'; page: null });

export type PdfProgressCallback = (event: PdfProgressEvent) => void;

export interface PdfAnalysisResult {
  totalPages: number;
  coverage: DocumentCoverage;
  failedPages: PdfPageFailure[];
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  return 'No se pudo renderizar ni analizar la página.';
}

function validatePageCount(pageCount: number): void {
  if (!Number.isInteger(pageCount) || pageCount < 0) {
    throw new RangeError('La cantidad de páginas del PDF no es válida.');
  }
}

export async function analyzePdfDocument(
  input: PdfInput,
  dependencies: PdfAnalysisDependencies,
  onProgress?: PdfProgressCallback,
): Promise<PdfAnalysisResult> {
  const data = await input.arrayBuffer();
  const document = await dependencies.loadDocument(data);
  const totalPages = document.numPages;
  const pages: PageCoverage[] = [];
  const failedPages: PdfPageFailure[] = [];
  let completedPages = 0;
  let successfulPages = 0;

  try {
    validatePageCount(totalPages);

    for (let pageNumber = 1; pageNumber <= totalPages; pageNumber += 1) {
      onProgress?.({
        status: 'page-started', page: pageNumber, totalPages,
        completedPages, successfulPages, failedPages: failedPages.length,
      });

      try {
        const page = await document.getPage(pageNumber);
        const imageData = await dependencies.rasterizePage(page, pageNumber);
        const coverage = normalizePageCoverage(analyzePageCoverage(imageData, pageNumber));
        pages.push(coverage);
        completedPages += 1;
        successfulPages += 1;
        onProgress?.({
          status: 'page-completed', page: pageNumber, totalPages,
          completedPages, successfulPages, failedPages: failedPages.length, coverage,
        });
      } catch (error: unknown) {
        const failure = { page: pageNumber, message: getErrorMessage(error) };
        failedPages.push(failure);
        completedPages += 1;
        onProgress?.({
          status: 'page-failed', page: pageNumber, totalPages,
          completedPages, successfulPages, failedPages: failedPages.length, error: failure,
        });
      }
    }

    const result = { totalPages, coverage: summarizeDocumentCoverage(pages), failedPages };
    onProgress?.({
      status: 'completed', page: null, totalPages, completedPages,
      successfulPages, failedPages: failedPages.length,
    });
    return result;
  } finally {
    await document.destroy?.();
  }
}
