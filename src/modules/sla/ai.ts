import { analyzeSlaRequirements } from './analysis';
import type { SlaAnalysis } from './types';

export function buildSlaAiPrompt(text: string): string {
  return `Analiza el siguiente texto de un pliego de condiciones (SLA) y devuelve un arreglo JSON estricto. Identifica todos los requisitos de nivel de servicio (tiempos de respuesta, solución, disponibilidad, multas, stock, guardias). Cada objeto debe tener:\n- section: string (número o nombre de la sección)\n- excerpt: string (el texto literal del requerimiento)\n- requirement: string (un resumen claro de la obligación)\nTexto:\n\n${text.slice(0, 30000)}`;
}

/** Añade al análisis local los requisitos de la IA; ignora entradas que no sean objetos. */
export function mergeAiSlaItems(text: string, fileName: string, payload: readonly unknown[]): SlaAnalysis {
  const analysis = analyzeSlaRequirements(text, fileName);
  analysis.source = 'IA OpenRouter';
  for (const entry of payload) {
    if (typeof entry !== 'object' || entry === null) continue;
    const item = entry as Record<string, unknown>;
    analysis.items.push({
      id: crypto.randomUUID(),
      category: String(item.section || 'General'),
      clientSource: String(item.excerpt || ''),
      clientRequirement: String(item.requirement || ''),
      ourPosition: 'Revisión manual requerida',
      ourSource: 'Detectado por IA',
      status: 'gap',
      advice: 'Evaluar factibilidad contra el estándar.',
    });
  }
  return analysis;
}
