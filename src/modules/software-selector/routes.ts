import type { Express } from 'express';
import type { SuiteDatabase } from '../../db/database';
import { SettingsRepository } from '../../db/repositories';
import { createGeminiClient, getGeminiApiKey, getGeminiErrorMessage, getGeminiErrorStatus } from '../../core/gemini';
import { parseTextAnalysisInput } from '../../core/validation';
import { SOFTWARE_FEATURES, SOFTWARE_PRODUCTS } from './catalog';
import { analyzeSoftwareRequirements, buildSoftwareAnalysisResponse } from './analysis';
import { buildSoftwareAiPrompt, mergeAiFeatures } from './ai';
import { SoftwareSelectorRepository } from './repository';

export function registerSoftwareSelectorRoutes(app: Express, database: SuiteDatabase): void {
  const softwareSelector = new SoftwareSelectorRepository(database);
  const settings = new SettingsRepository(database);

  app.get('/api/software-selector/catalog', (_request, response) => {
    response.json({ features: SOFTWARE_FEATURES, products: SOFTWARE_PRODUCTS });
  });

  app.get('/api/software-selector/last', (_request, response) => {
    const analysis = softwareSelector.getLastAnalysis();
    response.json(analysis ? buildSoftwareAnalysisResponse(analysis) : null);
  });

  app.post('/api/software-selector/analyze', (request, response) => {
    const input = parseTextAnalysisInput(request.body, 'texto_pegado.txt');
    if (!input) {
      response.status(400).json({ error: 'text debe contener requisitos de texto y fileName debe ser válido.' });
      return;
    }

    const analysis = softwareSelector.saveAnalysis(analyzeSoftwareRequirements(input.text, input.fileName));
    response.json(buildSoftwareAnalysisResponse(analysis));
  });

  app.delete('/api/software-selector/last', (_request, response) => {
    softwareSelector.clearLastAnalysis();
    response.status(204).end();
  });

  app.post('/api/ai/analyze-software', async (request, response) => {
    const { text, fileName } = request.body;
    if (typeof text !== 'string' || !text) {
      response.status(400).json({ error: 'Falta el texto a analizar.' });
      return;
    }
    try {
      const apiKey = getGeminiApiKey(settings);
      if (!apiKey) {
        response.status(403).json({ error: 'Clave de Gemini API no configurada.' });
        return;
      }
      const ai = createGeminiClient(apiKey);
      const prompt = buildSoftwareAiPrompt(text);

      const result = await ai.models.generateContent({
        model: 'gemini-3.6-flash',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          temperature: 0,
        }
      });
      const payload = JSON.parse(result.text ?? '{}');
      if (!Array.isArray(payload.features)) throw new Error('Respuesta IA inválida.');
      
      const { analysis: baseAnalysis, rejected } = mergeAiFeatures(analyzeSoftwareRequirements(text, fileName ?? 'texto.txt'), payload.features);
      if (rejected.length > 0) console.warn('Gemini devolvió funcionalidades fuera del catálogo:', rejected.join(', '));
      const stored = softwareSelector.saveAnalysis(baseAnalysis);
      response.json(buildSoftwareAnalysisResponse(stored));
    } catch (e: unknown) {
      console.error('Gemini API Error:', e);
      response.status(getGeminiErrorStatus(e) ?? 500).json({ error: getGeminiErrorMessage(e) });
    }
  });
}
