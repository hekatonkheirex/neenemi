import { GoogleGenAI } from '@google/genai';
import type { SettingsRepository } from '../db/repositories';

/** La clave se lee de la instalación (`ai/gemini_api_key`) o de `GEMINI_API_KEY`; nunca sale en respaldos ni lecturas. */
export function getGeminiApiKey(settings: SettingsRepository): string {
  return settings.get('ai', 'gemini_api_key', process.env.GEMINI_API_KEY || '');
}

export function createGeminiClient(apiKey: string): GoogleGenAI {
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      retryOptions: {
        attempts: 5,
        initialDelay: 1,
        maxDelay: 8,
        expBase: 2,
        jitter: 1,
      },
    },
  });
}

export function getGeminiErrorStatus(error: unknown): number | undefined {
  if (!error || typeof error !== 'object') return undefined;
  const details = error as Record<string, unknown>;
  for (const key of ['status', 'statusCode']) {
    const status = details[key];
    if (typeof status === 'number') return status;
  }

  const rawMessage = error instanceof Error ? error.message : details.message;
  if (typeof rawMessage !== 'string') return undefined;
  try {
    const payload = JSON.parse(rawMessage) as { error?: { code?: unknown } };
    return typeof payload.error?.code === 'number' ? payload.error.code : undefined;
  } catch {
    return undefined;
  }
}

export function getGeminiErrorMessage(error: unknown): string {
  const status = getGeminiErrorStatus(error);
  if (status === 503) {
    return 'Gemini está temporalmente saturado. La solicitud se reintentó automáticamente; espera un momento e inténtalo de nuevo.';
  }
  if (status === 429) {
    return 'Gemini alcanzó un límite de uso. Espera un momento y vuelve a intentarlo.';
  }

  const rawMessage = error instanceof Error ? error.message : '';
  if (rawMessage) {
    try {
      const payload = JSON.parse(rawMessage) as { error?: { message?: unknown } };
      if (typeof payload.error?.message === 'string') return payload.error.message;
    } catch {
      // The SDK also returns human-readable messages that are not JSON.
    }
    return rawMessage;
  }
  return 'No se pudo completar el análisis con Gemini.';
}
