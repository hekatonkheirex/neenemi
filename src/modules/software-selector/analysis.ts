import { SOFTWARE_FEATURES, SOFTWARE_PRODUCTS, SOFTWARE_FEATURE_BY_ID } from './catalog';
import type {
  SoftwareAnalysis,
  SoftwareAnalysisResponse,
  SoftwareFeature,
  SoftwareRecommendation,
} from './types';

const DEFAULT_FEATURE_IDS = ['central_device_management', 'device_status_alerts', 'consumables_monitoring'];

export function stripAccents(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function normalize(value: string): string {
  return stripAccents(value.toLowerCase());
}

export function analyzeSoftwareRequirements(textExcerpt: string, fileName = 'texto_pegado.txt'): SoftwareAnalysis {
  const text = textExcerpt.trim().slice(0, 250_000);
  const content = normalize(`${text} ${fileName}`);
  const selectedFeatureIds: string[] = [];
  const reasoning: Record<string, string> = {};

  for (const feature of SOFTWARE_FEATURES) {
    const matchedKeyword = feature.keywords.find((keyword) => content.includes(normalize(keyword)));
    if (matchedKeyword) {
      selectedFeatureIds.push(feature.id);
      reasoning[feature.id] = `${feature.reason} Coincidencia local con la expresión: "${matchedKeyword}".`;
    }
  }

  const usedFallback = selectedFeatureIds.length === 0;
  if (usedFallback) {
    for (const id of DEFAULT_FEATURE_IDS) {
      const feature = SOFTWARE_FEATURE_BY_ID.get(id);
      if (!feature) continue;
      selectedFeatureIds.push(id);
      reasoning[id] = `${feature.reason} Sugerencia base porque no se encontraron coincidencias específicas.`;
    }
  }

  return {
    fileName: fileName.trim() || 'texto_pegado.txt',
    textExcerpt: text,
    selectedFeatureIds,
    reasoning,
    source: 'heurística local',
    usedFallback,
    analyzedAt: new Date().toISOString(),
  };
}

export function recommendSoftware(selectedFeatureIds: readonly string[]): SoftwareRecommendation[] {
  const selected = new Set(selectedFeatureIds);
  const selectedFeatures = SOFTWARE_FEATURES.filter((feature) => selected.has(feature.id));
  if (selectedFeatures.length === 0) return [];

  const recommendations = SOFTWARE_PRODUCTS.map((product) => {
    const supportedFeatureIds = selectedFeatures
      .filter((feature) => feature.support[product.id])
      .map((feature) => feature.id);
    const unsupportedFeatureIds = selectedFeatures
      .filter((feature) => !feature.support[product.id])
      .map((feature) => feature.id);
    const score = supportedFeatureIds.length;
    const coverageRate = score / selectedFeatures.length;

    return {
      product,
      score,
      coverageRate,
      tier: 'Coincidencia parcial' as const,
      supportedFeatureIds,
      unsupportedFeatureIds,
    };
  })
    .filter((recommendation) => recommendation.score > 0)
    .sort((left, right) => right.score - left.score || right.coverageRate - left.coverageRate);

  const maxScore = recommendations[0]?.score ?? 0;
  return recommendations.map((recommendation) => ({
    ...recommendation,
    tier: recommendation.score === maxScore && recommendation.coverageRate >= 0.6
      ? 'Mejor coincidencia'
      : 'Coincidencia parcial',
  }));
}

export function findSoftwareGaps(selectedFeatureIds: readonly string[]): SoftwareFeature[] {
  const selected = new Set(selectedFeatureIds);
  return SOFTWARE_FEATURES.filter((feature) => selected.has(feature.id))
    .filter((feature) => !Object.values(feature.support).some(Boolean));
}

export function buildSoftwareAnalysisResponse(analysis: SoftwareAnalysis): SoftwareAnalysisResponse {
  return {
    analysis,
    recommendations: recommendSoftware(analysis.selectedFeatureIds),
    gaps: findSoftwareGaps(analysis.selectedFeatureIds),
  };
}
