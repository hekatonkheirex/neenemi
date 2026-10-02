import { useEffect, useState, type FormEvent } from 'react';

type AiConfig = { configured: boolean; source: 'installation' | 'environment' | 'none'; model: string };

const SOURCE_LABEL: Record<AiConfig['source'], string> = {
  installation: 'clave guardada en este equipo',
  environment: 'clave del entorno de la aplicación',
  none: 'sin clave',
};

export const OPENROUTER_SIGNUP_URL = 'https://openrouter.ai/';
export const OPENROUTER_KEYS_URL = 'https://openrouter.ai/keys';

/** Panel plegable para ver el estado de la IA y guardar la clave de OpenRouter; la clave nunca vuelve del servidor. */
export default function AiKeyPanel() {
  const [config, setConfig] = useState<AiConfig | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/ai/config', { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error())))
      .then((value: AiConfig) => setConfig(value))
      .catch(() => { if (!controller.signal.aborted) setMessage({ kind: 'error', text: 'No se pudo consultar la configuración de IA.' }); });
    return () => controller.abort();
  }, []);

  async function send(method: 'PUT' | 'DELETE', successText: string) {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch('/api/ai/config', {
        method,
        headers: { 'content-type': 'application/json' },
        body: method === 'PUT' ? JSON.stringify({ apiKey }) : undefined,
      });
      const payload = await response.json() as AiConfig & { error?: string };
      if (!response.ok) throw new Error(payload.error || 'No se pudo guardar la clave.');
      setConfig(payload);
      setApiKey('');
      setMessage({ kind: 'ok', text: successText });
    } catch (error) {
      setMessage({ kind: 'error', text: error instanceof Error ? error.message : 'No se pudo guardar la clave.' });
    } finally {
      setBusy(false);
    }
  }

  function save(event: FormEvent) {
    event.preventDefault();
    void send('PUT', 'Clave guardada en este equipo.');
  }

  return (
    <details className="sales-card ai-key-panel" open={config !== null && !config.configured}>
      <summary>
        <strong>Configuración de IA (OpenRouter)</strong>
        <span className={`ai-key-status ${config?.configured ? 'ready' : 'missing'}`}>{config ? `IA: ${SOURCE_LABEL[config.source]}` : 'Consultando…'}</span>
      </summary>
      <form onSubmit={save}>
        <p className="form-hint">
          El análisis con IA usa OpenRouter. ¿No tienes cuenta?{' '}
          <a href={OPENROUTER_SIGNUP_URL} target="_blank" rel="noreferrer">Crea una cuenta en OpenRouter</a> y{' '}
          <a href={OPENROUTER_KEYS_URL} target="_blank" rel="noreferrer">genera una clave de API</a>. El texto del pliego se envía al proveedor del modelo; los modelos gratuitos pueden tener políticas de privacidad distintas.
        </p>
        <label className="search-field">
          <span>Clave de API</span>
          <input type="password" autoComplete="off" spellCheck={false} placeholder="sk-or-v1-…" value={apiKey} onChange={(event) => setApiKey(event.target.value)} />
        </label>
        <div className="ai-key-actions">
          <button className="primary-button" type="submit" disabled={busy || !apiKey.trim()}>Guardar clave</button>
          <button className="secondary-button" type="button" disabled={busy || config?.source !== 'installation'} onClick={() => void send('DELETE', 'Clave quitada de este equipo.')}>Quitar clave guardada</button>
          {config && <span className="muted-note">Modelo: {config.model}</span>}
        </div>
        {message && <p className={`form-hint ai-key-message ${message.kind}`} role={message.kind === 'error' ? 'alert' : 'status'}>{message.text}</p>}
      </form>
    </details>
  );
}
