import type { Express } from 'express';
import type { SuiteDatabase } from '../../db/database';
import { SettingsRepository } from '../../db/repositories';
import { askOpenRouter, extractJson, getOpenRouterConfig, OpenRouterError, openRouterErrorMessage, openRouterErrorStatus } from '../../core/openrouter';
import { parseTextAnalysisInput } from '../../core/validation';
import { analyzeSlaRequirements } from './analysis';
import { buildSlaAiPrompt, mergeAiSlaItems } from './ai';
import { SLA_REFERENCE_SECTIONS } from './constants';
import { SlaRepository } from './repository';

export function registerSlaRoutes(app: Express, database: SuiteDatabase): void {
  const sla = new SlaRepository(database);
  const settings = new SettingsRepository(database);

  app.get('/api/sla/reference', (_request, response) => {
    response.json(SLA_REFERENCE_SECTIONS);
  });

  app.get('/api/sla/last', (_request, response) => {
    response.json(sla.getLastAnalysis());
  });

  app.post('/api/sla/analyze', (request, response) => {
    const input = parseTextAnalysisInput(request.body, 'pliego.txt');
    if (!input) {
      response.status(400).json({ error: 'text debe contener el pliego y fileName debe ser válido.' });
      return;
    }
    response.json(sla.saveAnalysis(analyzeSlaRequirements(input.text, input.fileName)));
  });

  app.delete('/api/sla/last', (_request, response) => {
    sla.clearLastAnalysis();
    response.status(204).end();
  });

  app.post('/api/ai/analyze-sla', async (request, response) => {
    const { text, fileName } = request.body;
    if (typeof text !== 'string' || !text) {
      response.status(400).json({ error: 'Falta el texto a analizar.' });
      return;
    }
    try {
      const { apiKey, model } = getOpenRouterConfig(settings);
      if (!apiKey) {
        response.status(403).json({ error: 'Clave de OpenRouter no configurada.' });
        return;
      }
      const payload = extractJson(await askOpenRouter(apiKey, model, buildSlaAiPrompt(text)));
      if (!Array.isArray(payload)) throw new OpenRouterError(undefined, 'Respuesta IA inválida.');
      const analysis = mergeAiSlaItems(text, fileName ?? 'pliego.txt', payload);
      const stored = sla.saveAnalysis(analysis);
      response.json(stored);
    } catch (e: unknown) {
      console.error('OpenRouter Error:', e);
      response.status(openRouterErrorStatus(e) ?? 500).json({ error: openRouterErrorMessage(e) });
    }
  });
}
