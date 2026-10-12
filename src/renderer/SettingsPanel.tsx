import { useEffect, useState } from 'react';
import type { Settings, State } from '../shared/contracts';
export function SettingsPanel({ state, onClose, onSaved }: { state: State; onClose(): void; onSaved(): Promise<void> }) {
  const [settings, setSettings] = useState<Settings>(state.settings);
  const [message, setMessage] = useState('La primera preparación descarga motores y modelos. Después se procesan localmente.');
  const [preparing, setPreparing] = useState(state.preparing);
  const [saving, setSaving] = useState(false);
  useEffect(() => window.neenemi.subscribe(event => { if (event.event === 'preparation') setMessage(event.message); }), []);
  async function prepare(summary: boolean) {
    setPreparing(true);
    try { await window.neenemi.call('prepare', { summary, ollamaModel: settings.ollamaModel }); setMessage('Recursos preparados.'); }
    catch (error) { setMessage(String(error)); }
    finally { setPreparing(false); await onSaved(); }
  }
  async function save() {
    setSaving(true);
    try { await window.neenemi.call('settings', settings); await onSaved(); onClose(); }
    catch (error) { setMessage(String(error)); }
    finally { setSaving(false); }
  }
  return <section className="settings" aria-labelledby="settings-title">
    <div className="section-heading"><h2 id="settings-title">Configuración local</h2><button onClick={onClose} disabled={preparing || saving}>Cerrar</button></div>
    <p>Whisper medium Q5_0 · una tarea de IA a la vez · CPU. Mide memoria y tiempos en laptops de 8 GB antes de usar reuniones largas.</p>
    <fieldset disabled={preparing || saving}><legend>Procesamiento</legend>
      <label>Modelo de resumen<select value={settings.ollamaModel} onChange={event => setSettings({ ...settings, ollamaModel: event.target.value })}>
        <option value="qwen3:1.7b">Qwen3 1.7B</option><option value="qwen3:4b">Qwen3 4B</option><option value="qwen3:8b">Qwen3 8B</option>
      </select></label>
      <label>Hilos CPU<input type="number" min={1} max={16} value={settings.cpuThreads} onChange={event => setSettings({ ...settings, cpuThreads: Number(event.target.value) })} /></label>
      <label>Contexto (tokens; más contexto usa más RAM)<input type="number" min={8192} max={32768} step={1024} value={settings.contextTokens} onChange={event => setSettings({ ...settings, contextTokens: Number(event.target.value) })} /></label>
      <label className="checkbox"><input type="checkbox" checked={settings.autoSummarize} onChange={event => setSettings({ ...settings, autoSummarize: event.target.checked })} />Generar resumen después de transcribir</label>
    </fieldset>
    <p className="muted">Datos: {state.dataDirectory}</p><p role="status">{message}</p>
    <div className="actions"><button disabled={preparing || saving} onClick={() => void prepare(false)}>Preparar Whisper</button><button disabled={preparing || saving} onClick={() => void prepare(true)}>Preparar Ollama</button>
      {preparing && <button onClick={() => void window.neenemi.call('cancelPreparation', undefined).catch(error => setMessage(String(error)))}>Cancelar descarga</button>}
      <button onClick={() => void window.neenemi.installOllama().catch(error => setMessage(String(error)))}>Instalar Ollama para Windows</button>
      <button className="primary" disabled={preparing || saving} onClick={() => void save()}>{saving ? 'Guardando…' : 'Guardar configuración'}</button>
    </div>
  </section>;
}
