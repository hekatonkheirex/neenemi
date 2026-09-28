export const SOFTWARE_PRODUCT_IDS = ['uniflow_online', 'uniflow_hybrid', 'iwr', 'iwc'] as const;
export type SoftwareProductId = (typeof SOFTWARE_PRODUCT_IDS)[number];

export const SOFTWARE_CATEGORIES = [
  'Gestión de Impresión',
  'Escaneo y Flujos de Trabajo',
  'Costos e Informes',
  'Gestión de Dispositivos y Flotas',
  'Supervisión y Servicio',
  'Seguridad e Identidad',
] as const;
export type SoftwareCategory = (typeof SOFTWARE_CATEGORIES)[number];

export type SoftwareFeature = {
  id: string;
  label: string;
  description: string;
  category: SoftwareCategory;
  support: Record<SoftwareProductId, boolean>;
  keywords: readonly string[];
  reason: string;
};

export type SoftwareProduct = {
  id: SoftwareProductId;
  name: string;
  category: string;
  description: string;
  details: string;
};

export type SoftwareAnalysis = {
  fileName: string;
  textExcerpt: string;
  selectedFeatureIds: string[];
  reasoning: Record<string, string>;
  source: 'heurística local' | 'IA Gemini';
  usedFallback: boolean;
  analyzedAt: string;
};

export type SoftwareRecommendation = {
  product: SoftwareProduct;
  score: number;
  coverageRate: number;
  tier: 'Mejor coincidencia' | 'Coincidencia parcial';
  supportedFeatureIds: string[];
  unsupportedFeatureIds: string[];
};

export type SoftwareAnalysisResponse = {
  analysis: SoftwareAnalysis;
  recommendations: SoftwareRecommendation[];
  gaps: SoftwareFeature[];
};
