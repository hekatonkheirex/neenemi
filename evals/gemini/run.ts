// Eval periódica de pago: llama a Gemini a través de la API local de la suite (una llamada por pliego y módulo).
// Uso: GEMINI_API_KEY=... npm run eval:gemini   (sale con código 1 si el recall global queda bajo el 80 %).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EVAL_DOCUMENTS } from './fixtures';
import { RECALL_THRESHOLD, scoreFeatures, scoreSla, summarizeFeatures, summarizeSla, type DocumentScore, type SuiteScore } from './scoring';

if (!process.env.GEMINI_API_KEY) {
  console.error('Falta GEMINI_API_KEY. Esta eval hace llamadas de pago a Gemini y no se ejecuta sin la clave.');
  process.exit(2);
}

// server.ts arranca solo al importarse: se desactiva antes para que la eval no abra la API real ni toque `data/`.
process.env.DS_SERVER_AUTOSTART = 'false';
const { createServer } = await import('../../server');

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'dcss-eval-gemini-'));
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

const rows = { slaLocal: [] as DocumentScore[], slaAi: [] as DocumentScore[], softwareLocal: [] as DocumentScore[], softwareAi: [] as DocumentScore[] };
const errors: string[] = [];
for (const document of EVAL_DOCUMENTS) {
  const body = { text: document.text, fileName: `${document.id}.txt` };
  try {
    rows.slaLocal.push(scoreSla(document, (await post<SlaResponse>('/api/sla/analyze', body)).items));
    rows.softwareLocal.push(scoreFeatures(document, (await post<SoftwareResponse>('/api/software-selector/analyze', body)).analysis.selectedFeatureIds));
    rows.slaAi.push(scoreSla(document, (await post<SlaResponse>('/api/ai/analyze-sla', body)).items));
    rows.softwareAi.push(scoreFeatures(document, (await post<SoftwareResponse>('/api/ai/analyze-software', body)).analysis.selectedFeatureIds));
  } catch (error) {
    errors.push(`${document.id}: ${error instanceof Error ? error.message : String(error)}`);
  }
}
await new Promise<void>((resolve) => server.close(() => resolve()));
database.close();
fs.rmSync(directory, { recursive: true, force: true });

const suites: Record<string, SuiteScore> = {
  'SLA reglas locales': summarizeSla(rows.slaLocal),
  'SLA con Gemini': summarizeSla(rows.slaAi),
  'Software reglas locales': summarizeFeatures(rows.softwareLocal),
  'Software con Gemini': summarizeFeatures(rows.softwareAi),
};
const pct = (value: number | null) => (value === null ? 'n/d' : `${(value * 100).toFixed(1)} %`);
console.log(`Umbral de recall: ${pct(RECALL_THRESHOLD)} · documentos evaluados: ${EVAL_DOCUMENTS.length - errors.length}/${EVAL_DOCUMENTS.length}`);
for (const [name, score] of Object.entries(suites)) {
  console.log(`${score.passed ? 'OK  ' : 'FAIL'} ${name.padEnd(26)} recall ${pct(score.recall).padStart(8)}  precisión ${pct(score.precision).padStart(8)}`);
}
for (const [name, score] of Object.entries(suites)) {
  for (const item of score.documents.filter((entry) => entry.missing.length > 0)) console.log(`  ${name} · ${item.id}: faltan ${item.missing.join(', ')}`);
}
for (const error of errors) console.error(`ERROR ${error}`);

const reportDirectory = path.join(os.tmpdir(), 'dcss-evals');
fs.mkdirSync(reportDirectory, { recursive: true });
const reportPath = path.join(reportDirectory, `gemini-${new Date().toISOString().replaceAll(':', '-')}.json`);
fs.writeFileSync(reportPath, JSON.stringify({ threshold: RECALL_THRESHOLD, suites, errors }, null, 2));
console.log(`Informe: ${reportPath}`);

// El criterio de aprobación es el de las corridas con Gemini; las reglas locales son la línea base.
process.exit(errors.length === 0 && suites['SLA con Gemini'].passed && suites['Software con Gemini'].passed ? 0 : 1);
