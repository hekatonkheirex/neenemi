// Eval alternativa con modelos gratuitos de OpenRouter: ejecuta el mismo prompt y la misma mezcla que la app,
// sin pasar por Gemini. Mide el diseño del flujo (prompt + fusión), no el modelo de producción.
// Uso: OPENROUTER_API_KEY=... [EVAL_MODELS=a:free,b:free] npm run eval:openrouter
import { analyzeSlaRequirements } from '../../src/modules/sla/analysis';
import { buildSlaAiPrompt, mergeAiSlaItems } from '../../src/modules/sla/ai';
import { analyzeSoftwareRequirements } from '../../src/modules/software-selector/analysis';
import { buildSoftwareAiPrompt, mergeAiFeatures } from '../../src/modules/software-selector/ai';
import { EVAL_DOCUMENTS } from './fixtures';
import { askOpenRouter, extractJson } from './openrouter';
import { printSuites, writeReport } from './report';
import { scoreFeatures, scoreSla, summarizeFeatures, summarizeSla, verdict, type DocumentScore } from './scoring';

const apiKey = process.env.OPENROUTER_API_KEY;
if (!apiKey) {
  console.error('Falta OPENROUTER_API_KEY.');
  process.exit(2);
}
const DEFAULT_MODELS = ['nvidia/nemotron-3-super-120b-a12b:free', 'google/gemma-4-31b-it:free'];
const models = (process.env.EVAL_MODELS ?? DEFAULT_MODELS.join(',')).split(',').map((model) => model.trim()).filter(Boolean);
if (models.some((model) => !model.endsWith(':free'))) {
  console.error('Solo se permiten modelos gratuitos (sufijo :free).');
  process.exit(2);
}

const errors: string[] = [];
const slaLocal: DocumentScore[] = [];
const softwareLocal: DocumentScore[] = [];
for (const document of EVAL_DOCUMENTS) {
  slaLocal.push(scoreSla(document, analyzeSlaRequirements(document.text, `${document.id}.txt`).items));
  softwareLocal.push(scoreFeatures(document, analyzeSoftwareRequirements(document.text, `${document.id}.txt`).selectedFeatureIds));
}
const suites = { 'SLA reglas locales': summarizeSla(slaLocal), 'Software reglas locales': summarizeFeatures(softwareLocal) } as Record<string, ReturnType<typeof summarizeSla>>;

for (const model of models) {
  const slaRows: DocumentScore[] = [];
  const softwareRows: DocumentScore[] = [];
  for (const document of EVAL_DOCUMENTS) {
    try {
      const slaPayload = extractJson(await askOpenRouter(apiKey, model, buildSlaAiPrompt(document.text)));
      slaRows.push(scoreSla(document, mergeAiSlaItems(document.text, `${document.id}.txt`, Array.isArray(slaPayload) ? slaPayload : []).items));
      const softwarePayload = extractJson(await askOpenRouter(apiKey, model, buildSoftwareAiPrompt(document.text))) as { features?: unknown };
      const ids = Array.isArray(softwarePayload) ? softwarePayload : Array.isArray(softwarePayload?.features) ? softwarePayload.features : [];
      const { analysis, rejected } = mergeAiFeatures(analyzeSoftwareRequirements(document.text, `${document.id}.txt`), ids);
      softwareRows.push(scoreFeatures(document, analysis.selectedFeatureIds));
      if (rejected.length) console.log(`  ${model} · ${document.id}: ids fuera del catálogo descartados: ${rejected.join(', ')}`);
    } catch (error) {
      errors.push(`${model} · ${document.id}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  suites[`SLA ${model}`] = summarizeSla(slaRows);
  suites[`Software ${model}`] = summarizeFeatures(softwareRows);
}

printSuites(suites, EVAL_DOCUMENTS.length, errors);
console.log(`Informe: ${writeReport('openrouter', suites, EVAL_DOCUMENTS.length, errors)}`);
process.exit(Object.entries(suites).filter(([name]) => !name.includes('reglas locales')).every(([, score]) => verdict(score, EVAL_DOCUMENTS.length) === 'PASS') ? 0 : 1);
