import type { Express } from 'express';
import type { SuiteDatabase } from '../../db/database';
import { isNonEmptyString, isNonNegativeNumber, isPositiveInteger, isPositiveNumber, isRecord } from '../../core/validation';
import { calculateYield, normalizePageCoverage, summarizeDocumentCoverage } from './calculations';
import { CoverageRepository } from './repository';
import type { CanonModelDraft, CoverageAnalysis, CoveragePageFailure } from './types';

function parseCoverageModelDraft(value: unknown): CanonModelDraft | null {
  if (!isRecord(value) || !isNonEmptyString(value.name) || (value.colorType !== 'mono' && value.colorType !== 'color')) return null;
  if (!isRecord(value.nominalYield) || !isPositiveNumber(value.nominalYield.black)) return null;
  const nominalYield = value.nominalYield;
  if (value.colorType === 'color' && (!isPositiveNumber(nominalYield.cyan) || !isPositiveNumber(nominalYield.magenta) || !isPositiveNumber(nominalYield.yellow))) return null;
  return {
    name: value.name,
    colorType: value.colorType,
    nominalYield: value.colorType === 'mono'
      ? { black: nominalYield.black as number }
      : { black: nominalYield.black as number, cyan: nominalYield.cyan as number, magenta: nominalYield.magenta as number, yellow: nominalYield.yellow as number },
  };
}


function parseCoverageAnalysisInput(value: unknown): { sourceName: string; pages: ReturnType<typeof normalizePageCoverage>[]; failedPages: CoveragePageFailure[]; modelId?: string } | null {
  if (!isRecord(value) || value.inputMode !== 'pdf' || !isNonEmptyString(value.sourceName) || !Array.isArray(value.pages) || value.pages.length === 0 || value.pages.length > 2000) return null;
  if (value.modelId !== undefined && !isNonEmptyString(value.modelId)) return null;
  if (value.failedPages !== undefined && (!Array.isArray(value.failedPages) || value.failedPages.length > 2000)) return null;
  const pages = [] as ReturnType<typeof normalizePageCoverage>[];
  for (const item of value.pages) {
    if (!isRecord(item) || !isPositiveInteger(item.page) || !isNonNegativeNumber(item.black) || !isNonNegativeNumber(item.cyan) || !isNonNegativeNumber(item.magenta) || !isNonNegativeNumber(item.yellow)) return null;
    try {
      pages.push(normalizePageCoverage({ page: item.page, black: item.black, cyan: item.cyan, magenta: item.magenta, yellow: item.yellow }));
    } catch {
      return null;
    }
  }
  const failedPages: CoveragePageFailure[] = [];
  for (const item of value.failedPages ?? []) {
    if (!isRecord(item) || !isPositiveInteger(item.page) || !isNonEmptyString(item.message)) return null;
    failedPages.push({ page: item.page, message: item.message.slice(0, 1000) });
  }
  return { sourceName: value.sourceName, pages, failedPages, modelId: value.modelId as string | undefined };
}

export function registerCoverageRoutes(app: Express, database: SuiteDatabase): void {
  const coverage = new CoverageRepository(database);

  app.get('/api/coverage/models', (_request, response) => {
    response.json(coverage.listModels());
  });

  app.post('/api/coverage/models', (request, response) => {
    const draft = parseCoverageModelDraft(request.body);
    if (!draft) {
      response.status(400).json({ error: 'El modelo Canon y sus rendimientos no son válidos.' });
      return;
    }
    try {
      response.status(201).json(coverage.saveModel(draft));
    } catch (error) {
      response.status(400).json({ error: error instanceof Error ? error.message : 'No se pudo guardar el modelo Canon.' });
    }
  });

  app.put('/api/coverage/models/:id', (request, response) => {
    const draft = parseCoverageModelDraft(request.body);
    if (!draft) {
      response.status(400).json({ error: 'El modelo Canon y sus rendimientos no son válidos.' });
      return;
    }
    try {
      response.json(coverage.saveModel(draft, request.params.id));
    } catch (error) {
      response.status(400).json({ error: error instanceof Error ? error.message : 'No se pudo actualizar el modelo Canon.' });
    }
  });

  app.delete('/api/coverage/models/:id', (request, response) => {
    try {
      coverage.removeModel(request.params.id);
      response.status(204).end();
    } catch (error) {
      response.status(404).json({ error: error instanceof Error ? error.message : 'El modelo Canon no existe.' });
    }
  });

  app.get('/api/coverage/last', (_request, response) => {
    response.json(coverage.getLastAnalysis());
  });

  app.post('/api/coverage/analyze', (request, response) => {
    const input = parseCoverageAnalysisInput(request.body);
    if (!input) {
      response.status(400).json({ error: 'Selecciona un PDF válido con páginas de cobertura analizables.' });
      return;
    }
    const documentCoverage = summarizeDocumentCoverage(input.pages);
    const analysis: CoverageAnalysis = coverage.saveAnalysis({
      sourceName: input.sourceName,
      coverage: documentCoverage,
      analyzedAt: new Date().toISOString(),
      inputMode: 'pdf',
      failedPages: input.failedPages,
    });
    const model = input.modelId ? coverage.listModels().find((item) => item.id === input.modelId) : undefined;
    response.json({ analysis, yieldEstimate: model ? calculateYield(model, documentCoverage.average) : null });
  });

  app.delete('/api/coverage/last', (_request, response) => {
    coverage.clearLastAnalysis();
    response.status(204).end();
  });
}
