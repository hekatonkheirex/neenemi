import {
  getDocument,
  GlobalWorkerOptions,
  type PDFDocumentProxy,
  type PDFPageProxy,
} from 'pdfjs-dist';
import workerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type { RasterImageData } from './pixel-coverage';
import {
  analyzePdfDocument,
  type PdfAnalysisResult,
  type PdfInput,
  type PdfPageLike,
  type PdfProgressCallback,
} from './pdf-analysis';

export const PDF_RENDER_DPI = 300;
export const PDF_POINTS_PER_INCH = 72;

GlobalWorkerOptions.workerSrc = workerSrc;

export async function loadPdfDocument(data: ArrayBuffer): Promise<PDFDocumentProxy> {
  return getDocument({ data }).promise;
}

export async function rasterizePdfPage(page: PDFPageProxy, dpi = PDF_RENDER_DPI): Promise<RasterImageData> {
  if (!Number.isFinite(dpi) || dpi <= 0) {
    throw new RangeError('La resolución del PDF debe ser un número positivo.');
  }
  if (typeof document === 'undefined') {
    throw new Error('El análisis del PDF requiere un documento de navegador.');
  }

  const viewport = page.getViewport({ scale: dpi / PDF_POINTS_PER_INCH });
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const context = canvas.getContext('2d', { willReadFrequently: true });

  try {
    if (!context) throw new Error('No se pudo crear el lienzo para analizar el PDF.');
    context.save();
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.restore();

    await page.render({ canvas, canvasContext: context, viewport, background: '#ffffff' }).promise;
    return context.getImageData(0, 0, canvas.width, canvas.height);
  } finally {
    page.cleanup();
    canvas.width = 0;
    canvas.height = 0;
  }
}

export function analyzePdfFile(
  input: PdfInput,
  onProgress?: PdfProgressCallback,
  dpi = PDF_RENDER_DPI,
): Promise<PdfAnalysisResult> {
  return analyzePdfDocument(
    input,
    {
      loadDocument: loadPdfDocument,
      rasterizePage: (page: PdfPageLike) => rasterizePdfPage(page as PDFPageProxy, dpi),
    },
    onProgress,
  );
}
