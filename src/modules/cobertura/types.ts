export const COVERAGE_COLORS = ['black', 'cyan', 'magenta', 'yellow'] as const;
export type CoverageColor = (typeof COVERAGE_COLORS)[number];
export type CanonColorType = 'mono' | 'color';

export type CoverageAverage = {
  black: number;
  cyan: number;
  magenta: number;
  yellow: number;
};

export type PageCoverage = CoverageAverage & {
  page: number;
  total: number;
};

export type DocumentCoverage = {
  pages: PageCoverage[];
  average: CoverageAverage;
};

export type CanonModel = {
  id: string;
  name: string;
  colorType: CanonColorType;
  nominalYield: {
    black: number;
    cyan?: number;
    magenta?: number;
    yellow?: number;
  };
};

export type CanonModelDraft = Omit<CanonModel, 'id'>;

export type ColorYieldEstimate = {
  color: CoverageColor;
  nominalYield: number;
  measuredCoverage: number;
  estimatedPages: number | null;
};

export type YieldEstimate = {
  modelId: string;
  modelName: string;
  colors: ColorYieldEstimate[];
  bottleneckPages: number | null;
};

export type CoveragePageFailure = {
  page: number;
  message: string;
};

export type CoverageAnalysis = {
  sourceName: string;
  coverage: DocumentCoverage;
  analyzedAt: string;
  inputMode: 'manual' | 'pdf';
  failedPages?: CoveragePageFailure[];
};
