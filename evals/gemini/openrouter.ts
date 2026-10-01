// Cliente mínimo de OpenRouter (API compatible con OpenAI) solo para la eval; la app sigue usando únicamente Gemini.
const ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';

/** Extrae el primer JSON de una respuesta con cercas ```json o texto alrededor. Si es un objeto con un único arreglo, devuelve el arreglo. */
export function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const source = (fenced ? fenced[1] : text).trim();
  const start = source.search(/[[{]/);
  if (start < 0) throw new Error('La respuesta no contiene JSON.');
  const open = source[start];
  const close = open === '[' ? ']' : '}';
  const end = source.lastIndexOf(close);
  if (end <= start) throw new Error('El JSON de la respuesta está incompleto.');
  const parsed: unknown = JSON.parse(source.slice(start, end + 1));
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    const arrays = Object.values(parsed).filter(Array.isArray);
    if (arrays.length === 1 && Object.keys(parsed).length === 1) return arrays[0];
  }
  return parsed;
}

export async function askOpenRouter(apiKey: string, model: string, prompt: string, attempts = 4): Promise<string> {
  let lastError = '';
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({ model, temperature: 0, messages: [{ role: 'user', content: `${prompt}\n\nResponde únicamente con JSON válido, sin texto adicional.` }] }),
      signal: AbortSignal.timeout(180_000),
    });
    const body = await response.text();
    if (response.ok) {
      const content = (JSON.parse(body) as { choices?: Array<{ message?: { content?: string } }> }).choices?.[0]?.message?.content;
      if (typeof content === 'string' && content.trim()) return content;
      lastError = 'respuesta vacía';
    } else {
      lastError = `${response.status} ${body.slice(0, 200)}`;
      if (response.status !== 429 && response.status < 500) throw new Error(`OpenRouter ${model}: ${lastError}`);
    }
    await new Promise((resolve) => setTimeout(resolve, attempt * 8_000));
  }
  throw new Error(`OpenRouter ${model}: ${lastError}`);
}
