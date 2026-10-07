import { useEffect, useState, type FormEvent } from 'react';
import { cn } from './cn';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Card, Muted } from './ui/card';
import { Input } from './ui/input';

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
    <Card as="details" className="group" open={config !== null && !config.configured}>
      <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-3 text-navy dark:text-white">
        <div className="font-bold">Configuración de IA (OpenRouter)</div>
        <Badge tone={config?.configured ? 'success' : 'warning'}>{config ? `IA: ${SOURCE_LABEL[config.source]}` : 'Consultando…'}</Badge>
      </summary>
      <form className="mt-4 grid gap-3" onSubmit={save}>
        <Muted className="text-sm leading-relaxed">
          El análisis con IA usa OpenRouter. ¿No tienes cuenta?{' '}
          <a className="font-bold text-[#00698f] underline dark:text-sky" href={OPENROUTER_SIGNUP_URL} target="_blank" rel="noreferrer">Crea una cuenta en OpenRouter</a> y{' '}
          <a className="font-bold text-[#00698f] underline dark:text-sky" href={OPENROUTER_KEYS_URL} target="_blank" rel="noreferrer">genera una clave de API</a>. El texto del pliego se envía al proveedor del modelo; los modelos gratuitos pueden tener políticas de privacidad distintas.
        </Muted>
        <label className="grid max-w-xl gap-1.5 text-xs font-bold text-ink-2! dark:text-[#9fb2d1]!">
          Clave de API
          <Input type="password" autoComplete="off" spellCheck={false} placeholder="sk-or-v1-…" value={apiKey} onChange={(event) => setApiKey(event.target.value)} />
        </label>
        <div className="flex flex-wrap items-center gap-2.5">
          <Button type="submit" disabled={busy || !apiKey.trim()}>Guardar clave</Button>
          <Button variant="outline" disabled={busy || config?.source !== 'installation'} onClick={() => void send('DELETE', 'Clave quitada de este equipo.')}>Quitar clave guardada</Button>
          {config && <Muted>Modelo: {config.model}</Muted>}
        </div>
        {message && (
          <div
            role={message.kind === 'error' ? 'alert' : 'status'}
            className={cn('rounded-xl border px-4 py-2.5 text-sm', message.kind === 'error'
              ? 'border-status-danger/40 bg-status-danger/10 text-status-danger-ink dark:text-status-danger-ink-dark'
              : 'border-status-ok/40 bg-status-ok/10 text-status-ok-ink dark:text-status-ok-ink-dark')}
          >
            {message.text}
          </div>
        )}
      </form>
    </Card>
  );
}
