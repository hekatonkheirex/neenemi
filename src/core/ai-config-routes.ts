import type { Express } from 'express';
import type { SuiteDatabase } from '../db/database';
import { SettingsRepository } from '../db/repositories';
import { describeOpenRouterConfig, isPlausibleOpenRouterKey } from './openrouter';
import { isRecord } from './validation';

/** Estado y alta de la clave de OpenRouter desde la interfaz. La clave nunca se devuelve: solo su origen. */
export function registerAiConfigRoutes(app: Express, database: SuiteDatabase): void {
  const settings = new SettingsRepository(database);

  app.get('/api/ai/config', (_request, response) => {
    response.set('Cache-Control', 'no-store').json(describeOpenRouterConfig(settings));
  });

  app.put('/api/ai/config', (request, response) => {
    const apiKey = isRecord(request.body) && typeof request.body.apiKey === 'string' ? request.body.apiKey.trim() : '';
    if (!isPlausibleOpenRouterKey(apiKey)) {
      response.status(400).json({ error: 'La clave debe empezar por sk-or- y no contener espacios. Cópiala completa desde openrouter.ai/keys.' });
      return;
    }
    settings.set('ai', 'openrouter_api_key', apiKey);
    response.set('Cache-Control', 'no-store').json(describeOpenRouterConfig(settings));
  });

  app.delete('/api/ai/config', (_request, response) => {
    settings.remove('ai', 'openrouter_api_key');
    response.set('Cache-Control', 'no-store').json(describeOpenRouterConfig(settings));
  });
}
