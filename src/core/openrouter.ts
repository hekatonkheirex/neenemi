import type { SettingsRepository } from '../db/repositories';

const ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';
/** Modelo gratuito por defecto; se cambia con `ai/openrouter_model` o la variable OPENROUTER_MODEL. */
export const DEFAULT_OPENROUTER_MODEL = 'nvidia/nemotron-3-super-120b-a12b:free';

/**
 * Orden de prioridad: configuración de la instalación (`ai/openrouter_*`, desde el panel de IA) y variables de entorno.
 * Un valor vacío cuenta como no definido. La clave nunca sale en respaldos ni lecturas.
 */
export function getOpenRouterConfig(settings: SettingsRepository): { apiKey: string; model: string } {
  return {
    apiKey: settings.get('ai', 'openrouter_api_key', '') || process.env.OPENROUTER_API_KEY || '',
    model: settings.get('ai', 'openrouter_model', '') || process.env.OPENROUTER_MODEL || DEFAULT_OPENROUTER_MODEL,
  };
}

export type OpenRouterKeySource = 'installation' | 'environment' | 'none';

/** Estado de la configuración sin revelar la clave: de dónde sale y qué modelo se usará. */
export function describeOpenRouterConfig(settings: SettingsRepository): { configured: boolean; source: OpenRouterKeySource; model: string } {
  const source: OpenRouterKeySource = settings.get('ai', 'openrouter_api_key', '') ? 'installation' : process.env.OPENROUTER_API_KEY ? 'environment' : 'none';
  return { configured: source !== 'none', source, model: getOpenRouterConfig(settings).model };
}

/** Las claves de OpenRouter empiezan por `sk-or-` y no llevan espacios; se rechaza todo lo demás antes de guardarla. */
export function isPlausibleOpenRouterKey(value: unknown): value is string {
  return typeof value === 'string' && /^sk-or-[A-Za-z0-9_-]{16,200}$/.test(value);
}

export class OpenRouterError extends Error {
  constructor(readonly status: number | undefined, message: string) {
    super(message);
    this.name = 'OpenRouterError';
  }
}

export function openRouterErrorStatus(error: unknown): number | undefined {
  return error instanceof OpenRouterError ? error.status : undefined;
}

export function openRouterErrorMessage(error: unknown): string {
  const status = openRouterErrorStatus(error);
  if (status === 401 || status === 403) return 'OpenRouter rechazó la clave de API. Revisa que sea válida.';
  if (status === 402) return 'La cuenta de OpenRouter no tiene crédito para este modelo. Usa un modelo gratuito (sufijo :free).';
  if (status === 429) return 'El modelo de OpenRouter alcanzó su límite de uso. Espera un momento y vuelve a intentarlo.';
  if (status === 408 || (status !== undefined && status >= 500)) return 'OpenRouter o el modelo está temporalmente no disponible. La solicitud se reintentó; inténtalo de nuevo en un momento.';
  if (error instanceof OpenRouterError) return error.message;
  return 'No se pudo completar el análisis con OpenRouter.';
}

/** Extrae el primer JSON de una respuesta con cercas ```json o texto alrededor. Si es un objeto con un único arreglo, devuelve el arreglo. */
export function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const source = (fenced ? fenced[1] : text).trim();
  const start = source.search(/[[{]/);
  if (start < 0) throw new OpenRouterError(undefined, 'La respuesta del modelo no contiene JSON.');
  const close = source[start] === '[' ? ']' : '}';
  const end = source.lastIndexOf(close);
  if (end <= start) throw new OpenRouterError(undefined, 'El JSON de la respuesta del modelo está incompleto.');
  let parsed: unknown;
  try {
    parsed = JSON.parse(source.slice(start, end + 1));
  } catch {
    throw new OpenRouterError(undefined, 'La respuesta del modelo no es un JSON válido.');
  }
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    const arrays = Object.values(parsed).filter(Array.isArray);
    if (arrays.length === 1 && Object.keys(parsed).length === 1) return arrays[0];
  }
  return parsed;
}

export type AskOptions = { attempts?: number; retryDelayMs?: number; timeoutMs?: number; fetchImpl?: typeof fetch };

/** Una consulta de texto; reintenta 429 y 5xx con espera creciente y falla de inmediato ante 4xx como 401 o 402. */
export async function askOpenRouter(apiKey: string, model: string, prompt: string, options: AskOptions = {}): Promise<string> {
  const { attempts = 3, retryDelayMs = 2_000, timeoutMs = 120_000, fetchImpl = fetch } = options;
  let lastStatus: number | undefined;
  let lastDetail = 'sin respuesta';
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetchImpl(ENDPOINT, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
        body: JSON.stringify({ model, temperature: 0, messages: [{ role: 'user', content: `${prompt}\n\nResponde únicamente con JSON válido, sin texto adicional.` }] }),
        signal: AbortSignal.timeout(timeoutMs),
      });
      const body = await response.text();
      if (response.ok) {
        const content = (JSON.parse(body) as { choices?: Array<{ message?: { content?: string } }> }).choices?.[0]?.message?.content;
        if (typeof content === 'string' && content.trim()) return content;
        lastStatus = undefined;
        lastDetail = 'respuesta vacía';
      } else {
        lastStatus = response.status;
        lastDetail = body.slice(0, 200);
        if (response.status !== 429 && response.status < 500) throw new OpenRouterError(response.status, `OpenRouter respondió ${response.status}: ${lastDetail}`);
      }
    } catch (error) {
      if (error instanceof OpenRouterError) throw error;
      lastStatus = undefined;
      lastDetail = error instanceof Error ? error.message : String(error);
    }
    if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, attempt * retryDelayMs));
  }
  throw new OpenRouterError(lastStatus, `OpenRouter ${model}: ${lastDetail}`);
}
