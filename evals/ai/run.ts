// Eval periódica del análisis con IA: llama al modelo a través de la API local de la suite (una llamada por pliego y módulo).
// Uso: OPENROUTER_API_KEY=... [EVAL_MODELS=a:free,b:free] npm run eval:ai
// Sale con código 1 si algún modelo no alcanza el recall mínimo en todos los pliegos.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DEFAULT_OPENROUTER_MODEL } from '../../src/core/openrouter';
import { EVAL_DOCUMENTS } from './fixtures';
import { printSuites, writeReport } from './report';
import { scoreFeatures, scoreSla, summarizeFeatures, summarizeSla, verdict, type DocumentScore, type SuiteScore } from './scoring';

if (!process.env.OPENROUTER_API_KEY) {
  console.error('Falta OPENROUTER_API_KEY. Esta eval llama a un modelo de OpenRouter y no se ejecuta sin la clave.');
  process.exit(2);
}
const models = (process.env.EVAL_MODELS ?? DEFAULT_OPENROUTER_MODEL).split(',').map((model) => model.trim()).filter(Boolean);
if (models.some((model) => !model.endsWith(':free'))) {
  console.error('Solo se permiten modelos gratuitos (sufijo :free).');
  process.exit(2);
}

// server.ts arranca solo al importarse: se desactiva antes para que la eval no abra la API real ni toque `data/`.
process.env.DS_SERVER_AUTOSTART = 'false';
const { createServer } = await import('../../server');

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'dcss-eval-ai-'));
const { app, database } = createServer({ dataDirectory: directory });
const server = app.listen(0, '127.0.0.1');
await new Promise<void>((resolve) => server.once('listening', () => resolve()));
const address = server.address();
const base = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`;

async function post<T>(route: string, body: unknown): Promise<T> {
  const response = await fetch(`${base}${route}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  if (!response.ok) throw new Error(`${route} respondió ${response.status}: ${await response.text()}`);
  return response.json() as Promise<T>;
}

type SlaResponse = { items: Array<{ clientSource: string; clientRequirement: string }> };
type SoftwareResponse = { analysis: { selectedFeatureIds: string[] } };

const errors: string[] = [];
const suites: Record<string, SuiteScore> = {};
const slaLocal: DocumentScore[] = [];
const softwareLocal: DocumentScore[] = [];
for (const document of EVAL_DOCUMENTS) {
  const body = { text: document.text, fileName: `${document.id}.txt` };
  slaLocal.push(scoreSla(document, (await post<SlaResponse>('/api/sla/analyze', body)).items));
  softwareLocal.push(scoreFeatures(document, (await post<SoftwareResponse>('/api/software-selector/analyze', body)).analysis.selectedFeatureIds));
}
suites['SLA reglas locales'] = summarizeSla(slaLocal);
suites['Software reglas locales'] = summarizeFeatures(softwareLocal);

for (const model of models) {
  process.env.OPENROUTER_MODEL = model;
  const slaRows: DocumentScore[] = [];
  const softwareRows: DocumentScore[] = [];
  for (const document of EVAL_DOCUMENTS) {
    const body = { text: document.text, fileName: `${document.id}.txt` };
    try {
      slaRows.push(scoreSla(document, (await post<SlaResponse>('/api/ai/analyze-sla', body)).items));
      softwareRows.push(scoreFeatures(document, (await post<SoftwareResponse>('/api/ai/analyze-software', body)).analysis.selectedFeatureIds));
    } catch (error) {
      errors.push(`${model} · ${document.id}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  suites[`SLA ${model}`] = summarizeSla(slaRows);
  suites[`Software ${model}`] = summarizeFeatures(softwareRows);
}
await new Promise<void>((resolve) => server.close(() => resolve()));
database.close();
fs.rmSync(directory, { recursive: true, force: true });

printSuites(suites, EVAL_DOCUMENTS.length, errors);
console.log(`Informe: ${writeReport('ai', suites, EVAL_DOCUMENTS.length, errors)}`);

// Las reglas locales son la línea base; el criterio de aprobación son las corridas con modelo.
process.exit(Object.entries(suites).filter(([name]) => !name.includes('reglas locales')).every(([, score]) => verdict(score, EVAL_DOCUMENTS.length) === 'PASS') ? 0 : 1);
