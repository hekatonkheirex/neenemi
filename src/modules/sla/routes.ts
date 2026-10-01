import type { Express } from 'express';
import type { SuiteDatabase } from '../../db/database';
import { SettingsRepository } from '../../db/repositories';
import { createGeminiClient, getGeminiApiKey, getGeminiErrorMessage, getGeminiErrorStatus } from '../../core/gemini';
import { parseTextAnalysisInput } from '../../core/validation';
import { analyzeSlaRequirements } from './analysis';
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
      const apiKey = getGeminiApiKey(settings);
      if (!apiKey) {
        response.status(403).json({ error: 'Clave de Gemini API no configurada.' });
        return;
      }
      const ai = createGeminiClient(apiKey);
      const prompt = `Analiza el siguiente texto de un pliego de condiciones (SLA) y devuelve un arreglo JSON estricto. Identifica todos los requisitos de nivel de servicio (tiempos de respuesta, solución, disponibilidad, multas, stock, guardias). Cada objeto debe tener:\n- section: string (número o nombre de la sección)\n- excerpt: string (el texto literal del requerimiento)\n- requirement: string (un resumen claro de la obligación)\nTexto:\n\n${text.slice(0, 30000)}`;
      
      const result = await ai.models.generateContent({
        model: 'gemini-3.6-flash',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          temperature: 0,
        }
      });
      const payload = JSON.parse(result.text ?? '[]');
      if (!Array.isArray(payload)) throw new Error('Respuesta IA inválida.');
      
      const analysis = analyzeSlaRequirements(text, fileName ?? 'pliego.txt');
      analysis.source = 'IA Gemini';
      for (const item of payload) {
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
      const stored = sla.saveAnalysis(analysis);
      response.json(stored);
    } catch (e: unknown) {
      console.error('Gemini API Error:', e);
      response.status(getGeminiErrorStatus(e) ?? 500).json({ error: getGeminiErrorMessage(e) });
    }
  });
}
