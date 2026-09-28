import { COVERAGE_COLORS, type CanonModel, type CoverageAverage, type CoverageColor, type DocumentCoverage, type PageCoverage, type YieldEstimate } from './types';

const ISO_REFERENCE_COVERAGE = 5;
const EMPTY_COVERAGE: CoverageAverage = { black: 0, cyan: 0, magenta: 0, yellow: 0 };

function validateCoverage(color: CoverageColor, value: number): void {
  if (!Number.isFinite(value) || value < 0 || value > 100) {
    throw new RangeError(`La cobertura ${color} debe estar entre 0 y 100.`);
  }
}

export function normalizePageCoverage(input: Omit<PageCoverage, 'total'>): PageCoverage {
  if (!Number.isInteger(input.page) || input.page <= 0) {
    throw new RangeError('El número de página debe ser un entero positivo.');
  }
  for (const color of COVERAGE_COLORS) validateCoverage(color, input[color]);
  return {
    ...input,
    total: input.black + input.cyan + input.magenta + input.yellow,
  };
}

export function summarizeDocumentCoverage(pages: readonly PageCoverage[]): DocumentCoverage {
  if (pages.length === 0) return { pages: [], average: { ...EMPTY_COVERAGE } };
  const sums = pages.reduce<CoverageAverage>((total, page) => ({
    black: total.black + page.black,
    cyan: total.cyan + page.cyan,
    magenta: total.magenta + page.magenta,
    yellow: total.yellow + page.yellow,
  }), { ...EMPTY_COVERAGE });
  return {
    pages: [...pages],
    average: {
      black: sums.black / pages.length,
      cyan: sums.cyan / pages.length,
      magenta: sums.magenta / pages.length,
      yellow: sums.yellow / pages.length,
    },
  };
}

function getApplicableColors(model: CanonModel): CoverageColor[] {
  return model.colorType === 'mono' ? ['black'] : [...COVERAGE_COLORS];
}

function getNominalYield(model: CanonModel, color: CoverageColor): number {
  const value = model.nominalYield[color];
  if (value === undefined || !Number.isFinite(value) || value <= 0) {
    throw new RangeError(`El modelo ${model.name} debe definir un rendimiento positivo para ${color}.`);
  }
  return value;
}

export function calculateYield(model: CanonModel, averageCoverage: CoverageAverage): YieldEstimate {
  const colors = getApplicableColors(model).map((color) => {
    const measuredCoverage = averageCoverage[color];
    validateCoverage(color, measuredCoverage);
    const nominalYield = getNominalYield(model, color);
    return {
      color,
      nominalYield,
      measuredCoverage,
      estimatedPages: measuredCoverage === 0 ? null : nominalYield * (ISO_REFERENCE_COVERAGE / measuredCoverage),
    };
  });
  const consumedYields = colors
    .map((color) => color.estimatedPages)
    .filter((pages): pages is number => pages !== null);
  return {
    modelId: model.id,
    modelName: model.name,
    colors,
    bottleneckPages: consumedYields.length > 0 ? Math.min(...consumedYields) : null,
  };
}
