import type { EvalDocument } from './fixtures';

export const RECALL_THRESHOLD = 0.8;

export function normalizeForMatch(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

export type DocumentScore = { id: string; expected: number; found: number; missing: string[]; extra: number };
export type SuiteScore = { recall: number; precision: number | null; passed: boolean; documents: DocumentScore[] };

function summarize(documents: DocumentScore[], returnedTotal: number | null): SuiteScore {
  const expected = documents.reduce((sum, item) => sum + item.expected, 0);
  const found = documents.reduce((sum, item) => sum + item.found, 0);
  const recall = expected === 0 ? 1 : found / expected;
  const precision = returnedTotal === null || returnedTotal === 0 ? null : found / returnedTotal;
  return { recall, precision, passed: recall >= RECALL_THRESHOLD, documents };
}

/** SLA: un ancla se considera encontrada si aparece en el texto o el resumen de algún requisito devuelto. */
export function scoreSla(document: EvalDocument, returned: Array<{ clientSource: string; clientRequirement: string }>): DocumentScore {
  const haystack = returned.map((item) => normalizeForMatch(`${item.clientSource} ${item.clientRequirement}`));
  const missing = document.slaAnchors.filter((anchor) => !haystack.some((text) => text.includes(normalizeForMatch(anchor))));
  return { id: document.id, expected: document.slaAnchors.length, found: document.slaAnchors.length - missing.length, missing, extra: 0 };
}

export function scoreFeatures(document: EvalDocument, returnedIds: readonly string[]): DocumentScore {
  const returned = new Set(returnedIds);
  const missing = document.features.filter((id) => !returned.has(id));
  const extra = [...returned].filter((id) => !document.features.includes(id)).length;
  return { id: document.id, expected: document.features.length, found: document.features.length - missing.length, missing, extra };
}

/** Recall global (aciertos / esperados): es el criterio de aprobación. La precisión solo se informa. */
export function summarizeSla(documents: DocumentScore[]): SuiteScore {
  return summarize(documents, null);
}

export function summarizeFeatures(documents: DocumentScore[]): SuiteScore {
  const returned = documents.reduce((sum, item) => sum + item.found + item.extra, 0);
  return summarize(documents, returned);
}

export type Verdict = 'PASS' | 'FAIL' | 'INCOMPLETE';

/** Una suite con documentos sin evaluar (cuota, saturación) no aprueba: su recall solo describe los evaluados. */
export function verdict(score: SuiteScore, totalDocuments: number): Verdict {
  if (score.documents.length < totalDocuments) return 'INCOMPLETE';
  return score.passed ? 'PASS' : 'FAIL';
}
