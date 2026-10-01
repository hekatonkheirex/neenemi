import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { RECALL_THRESHOLD, verdict, type SuiteScore } from './scoring';

const pct = (value: number | null) => (value === null ? 'n/d' : `${(value * 100).toFixed(1)} %`);

export function printSuites(suites: Record<string, SuiteScore>, totalDocuments: number, errors: string[]): void {
  console.log(`Umbral de recall: ${pct(RECALL_THRESHOLD)} · pliegos: ${totalDocuments}`);
  for (const [name, score] of Object.entries(suites)) {
    console.log(`${verdict(score, totalDocuments).padEnd(10)} ${name.padEnd(46)} ${score.documents.length}/${totalDocuments} pliegos  recall ${pct(score.recall).padStart(8)}  precisión ${pct(score.precision).padStart(8)}`);
  }
  for (const [name, score] of Object.entries(suites)) {
    for (const item of score.documents.filter((entry) => entry.missing.length > 0)) console.log(`  ${name} · ${item.id}: faltan ${item.missing.join(', ')}`);
  }
  for (const error of errors) console.error(`ERROR ${error}`);
}

export function writeReport(prefix: string, suites: Record<string, SuiteScore>, totalDocuments: number, errors: string[]): string {
  const directory = path.join(os.tmpdir(), 'dcss-evals');
  fs.mkdirSync(directory, { recursive: true });
  const file = path.join(directory, `${prefix}-${new Date().toISOString().replaceAll(':', '-')}.json`);
  const verdicts = Object.fromEntries(Object.entries(suites).map(([name, score]) => [name, verdict(score, totalDocuments)]));
  fs.writeFileSync(file, JSON.stringify({ threshold: RECALL_THRESHOLD, verdicts, suites, errors }, null, 2));
  return file;
}
