import { SOFTWARE_FEATURES, SOFTWARE_FEATURE_BY_ID } from './catalog';
import type { SoftwareAnalysis } from './types';

/** El prompt lista los ids reales del catálogo; los ids inventados por el modelo no llegan al análisis. */
export function buildSoftwareAiPrompt(text: string): string {
  const catalog = SOFTWARE_FEATURES.map((feature) => `- ${feature.id}: ${feature.label}. ${feature.description}`).join('\n');
  return `Analiza este pliego técnico de software y hardware de impresión. Identifica qué funcionalidades se solicitan de forma explícita. Devuelve un objeto JSON con una propiedad "features" que sea un array de strings con los ids. Usa exclusivamente estos ids del catálogo y omite lo que el texto no pida:\n${catalog}\nTexto:\n\n${text.slice(0, 30000)}`;
}

/** Une los ids de la IA con el análisis local, descartando los que no existen en el catálogo. */
export function mergeAiFeatures(base: SoftwareAnalysis, aiIds: readonly unknown[]): { analysis: SoftwareAnalysis; rejected: string[] } {
  const accepted: string[] = [];
  const rejected: string[] = [];
  for (const id of aiIds) {
    if (typeof id === 'string' && SOFTWARE_FEATURE_BY_ID.has(id)) accepted.push(id);
    else rejected.push(String(id));
  }
  const analysis: SoftwareAnalysis = {
    ...base,
    selectedFeatureIds: Array.from(new Set([...base.selectedFeatureIds, ...accepted])),
    reasoning: { ...base.reasoning },
    source: 'IA Gemini',
  };
  for (const id of accepted) {
    if (!analysis.reasoning[id]) analysis.reasoning[id] = `${SOFTWARE_FEATURE_BY_ID.get(id)!.reason} Detectado por IA Gemini.`;
  }
  return { analysis, rejected };
}
