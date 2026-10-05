/**
 * Lectura común de las respuestas de la API local. El servidor responde `{ error: string }` en los fallos,
 * pero un proxy, un límite de tamaño (413) o un fallo de Express pueden devolver HTML o nada: en ese caso
 * se informa el código HTTP en vez de "Unexpected token '<'".
 */
export async function readJson<T>(responseOrPromise: Response | Promise<Response>): Promise<T> {
  const response = await responseOrPromise;
  const text = await response.text();
  let body: unknown;
  let parsed = false;
  if (text) {
    try {
      body = JSON.parse(text);
      parsed = true;
    } catch {
      // Cuerpo que no es JSON: se trata abajo según el código HTTP.
    }
  }

  if (!response.ok) {
    const message = parsed && typeof body === 'object' && body !== null && 'error' in body && typeof body.error === 'string' && body.error
      ? body.error
      : `La API local devolvió un error (${response.status}).`;
    throw new Error(message);
  }
  if (!parsed) {
    if (!text) return undefined as T;
    throw new Error(`La API local devolvió una respuesta que no es JSON (${response.status}).`);
  }
  return body as T;
}

export function toErrorMessage(value: unknown, fallback = 'No se pudo completar la operación.'): string {
  if (value instanceof TypeError && /fetch|network|load failed/i.test(value.message)) return 'No se pudo conectar con la API local. Verifica que la Suite siga abierta.';
  return value instanceof Error && value.message ? value.message : fallback;
}
