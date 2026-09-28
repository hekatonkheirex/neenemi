import type { PageCoverage } from './types';

export interface RasterImageData {
  width: number;
  height: number;
  data: ArrayLike<number>;
}

function validateImageData(imageData: RasterImageData): number {
  const { width, height, data } = imageData;
  if (!Number.isInteger(width) || width <= 0) {
    throw new RangeError('El ancho de la imagen debe ser un entero positivo.');
  }
  if (!Number.isInteger(height) || height <= 0) {
    throw new RangeError('El alto de la imagen debe ser un entero positivo.');
  }

  const pixelCount = width * height;
  if (data.length < pixelCount * 4) {
    throw new RangeError('La imagen debe contener cuatro canales por píxel.');
  }
  return pixelCount;
}

function rgbToCoverage(red: number, green: number, blue: number) {
  const normalizedRed = red / 255;
  const normalizedGreen = green / 255;
  const normalizedBlue = blue / 255;
  const black = 1 - Math.max(normalizedRed, normalizedGreen, normalizedBlue);

  if (black >= 1) return { black: 1, cyan: 0, magenta: 0, yellow: 0 };

  const nonBlackRange = 1 - black;
  return {
    black,
    cyan: (1 - normalizedRed - black) / nonBlackRange,
    magenta: (1 - normalizedGreen - black) / nonBlackRange,
    yellow: (1 - normalizedBlue - black) / nonBlackRange,
  };
}

export function analyzePageCoverage(imageData: RasterImageData, page: number): PageCoverage {
  if (!Number.isInteger(page) || page <= 0) {
    throw new RangeError('El número de página debe ser un entero positivo.');
  }

  const pixelCount = validateImageData(imageData);
  const sums = { black: 0, cyan: 0, magenta: 0, yellow: 0 };

  for (let pixel = 0; pixel < pixelCount; pixel += 1) {
    const offset = pixel * 4;
    const alpha = (imageData.data[offset + 3] ?? 255) / 255;
    const red = (imageData.data[offset] ?? 255) * alpha + 255 * (1 - alpha);
    const green = (imageData.data[offset + 1] ?? 255) * alpha + 255 * (1 - alpha);
    const blue = (imageData.data[offset + 2] ?? 255) * alpha + 255 * (1 - alpha);
    const coverage = rgbToCoverage(red, green, blue);

    sums.black += coverage.black;
    sums.cyan += coverage.cyan;
    sums.magenta += coverage.magenta;
    sums.yellow += coverage.yellow;
  }

  const result = {
    page,
    black: (sums.black / pixelCount) * 100,
    cyan: (sums.cyan / pixelCount) * 100,
    magenta: (sums.magenta / pixelCount) * 100,
    yellow: (sums.yellow / pixelCount) * 100,
  };

  return { ...result, total: result.black + result.cyan + result.magenta + result.yellow };
}
