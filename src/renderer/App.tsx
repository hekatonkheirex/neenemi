import { useCallback, useEffect, useRef, useState } from 'react';
import type { MeetingDetail, State } from '../shared/contracts';
import { SettingsPanel } from './SettingsPanel';
import { PcmRecorder } from './recorder';
const statusLabels: Record<string, string> = { grabando: 'Grabando', interrumpida: 'Interrumpida', en_cola: 'En cola', transcribiendo: 'Transcribiendo', listo: 'Lista', error: 'Error' };
export function clock(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  return [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60].map(value => String(value).padStart(2, '0')).join(':');
}
export function App() {
  const [state, setState] = useState<State | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<MeetingDetail | null>(null);
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [capture] = useState(() => new PcmRecorder(setMessage));
  const [busy, setBusy] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [tab, setTab] = useState<'transcript' | 'summary'>('transcript');
  const [audioURL, setAudioURL] = useState('');
  const [elapsed, setElapsed] = useState(0);
  const audio = useRef<HTMLAudioElement>(null);
  const recordingStart = useRef<number | null>(null);
  const generation = useRef(0);
  const playbackGeneration = useRef(0);
  const dialog = useRef<HTMLDialogElement>(null);
  const selection = useRef(selectedId);
  selection.current = selectedId;
  const refresh = useCallback(async () => {
    const request = ++generation.current;
    const next = await window.neenemi.call('state', undefined);
    const id = selection.current;
    const nextDetail = id && next.meetings.some(item => item.id === id) ? await window.neenemi.call('detail', { id }) : null;
    if (request !== generation.current || id !== selection.current) return;
    setState(next); setDetail(nextDetail);
    if (id && !nextDetail) { selection.current = null; setSelectedId(null); }
  }, []);
  useEffect(() => window.neenemi.onCaptureStop(async () => { await capture.stop(); await refresh(); }), [capture, refresh]);
  useEffect(() => {
    let alive = true;
    void refresh().catch(error => { if (alive) setMessage(String(error)); });
    const unsubscribe = window.neenemi.subscribe(event => {
      if (event.event === 'fatal') setMessage(event.message);
      if (event.event === 'changed') void refresh().catch(error => { if (alive) setMessage(String(error)); });
    });
    return () => { alive = false; generation.current++; unsubscribe(); };
  }, [refresh]);
  useEffect(() => {
    setDetail(null); setAudioURL(''); playbackGeneration.current++;
    void refresh().catch(error => setMessage(String(error)));
  }, [selectedId, refresh]);
  useEffect(() => {
    if (!state?.recordingId) { recordingStart.current = null; setElapsed(0); return; }
    recordingStart.current ??= Date.now();
    const timer = setInterval(() => setElapsed(Date.now() - recordingStart.current!), 1000);
    return () => clearInterval(timer);
  }, [state?.recordingId]);
  async function run(action: () => Promise<unknown>) {
    if (busy) return;
    setBusy(true); setMessage('');
    try { await action(); await refresh(); }
    catch (error) { setMessage(String(error)); }
    finally { setBusy(false); }
  }
  async function play(startMs = 0) {
    if (!selectedId) return;
    const id = selectedId, request = ++playbackGeneration.current;
    const url = await window.neenemi.playback(id);
    if (id !== selection.current || request !== playbackGeneration.current) return;
    const player = audio.current;
    if (!player) return;
    if (audioURL !== url) {
      const loaded = Promise.withResolvers<void>();
      const cleanup = () => { player.removeEventListener('loadedmetadata', ready); player.removeEventListener('error', failed); player.removeEventListener('emptied', interrupted); };
      const ready = () => { cleanup(); loaded.resolve(); };
      const failed = () => { cleanup(); loaded.reject(new Error('No se pudo reproducir el audio.')); };
      const interrupted = () => { if (request !== playbackGeneration.current) { cleanup(); loaded.reject(new Error('Reproducción interrumpida.')); } };
      player.addEventListener('loadedmetadata', ready); player.addEventListener('error', failed); player.addEventListener('emptied', interrupted);
      setAudioURL(url); await loaded.promise;
    }
    if (id !== selection.current || request !== playbackGeneration.current) return;
    player.currentTime = startMs / 1000; await player.play();
  }
  const m = detail?.meeting;
  const active = m && (['en_cola', 'transcribiendo'].includes(m.status) || ['queued', 'running'].includes(m.summaryStatus));
  const summary = detail?.summary;
  function references(sources: number[]) {
    return [...new Set(sources)].map(seq => {
      const segment = detail?.segments.find(item => item.seq === seq);
      return segment && <button key={seq} disabled={busy} title={segment.text} onClick={() => void run(() => play(segment.startMs))}>Escuchar {clock(segment.startMs)}</button>;
    });
  }
  return <main>
    <header><div><h1>Ñe'eñemi</h1><p className="muted">Grabaciones y resúmenes · en tu equipo</p></div><div className="actions">
      <button disabled={busy || !!state?.recordingId || showSettings} onClick={() => void run(async () => { const count = await window.neenemi.importDatabase(); if (count !== null) setMessage(`Se importaron ${count} grabaciones.`); })}>Importar grabaciones</button>
      <button disabled={busy || !!state?.recordingId || showSettings || !state} onClick={() => setShowSettings(true)}>Configuración</button>
    </div></header>
    {message && <div className="notice" role="alert"><span>{message}</span><button aria-label="Cerrar mensaje" onClick={() => setMessage('')}>Cerrar</button></div>}
    {showSettings && state ? <SettingsPanel state={state} onClose={() => setShowSettings(false)} onSaved={async () => { setAudioURL(''); await refresh(); }} /> : <>
      <section className="capture" aria-label="Nueva grabación"><label>Nombre de la grabación<input value={title} maxLength={300} placeholder="Ej.: Reunión de coordinación" disabled={busy || !!state?.recordingId} onChange={event => setTitle(event.target.value)} /></label>
        <button className="primary" disabled={!state || busy || !!state.recordingId || !title.trim()} onClick={() => void run(async () => { const meeting = await capture.start(title); recordingStart.current = Date.now(); selection.current = meeting.id; setSelectedId(meeting.id); })}>Grabar</button>
        <button disabled={busy || !state?.recordingId} onClick={() => void run(() => capture.stop())}>Terminar y procesar</button>
        {state?.recordingId && <strong role="status">Grabando · {clock(elapsed)}</strong>}
      </section>
      {state && !state.hasWhisper && <p className="resource-note">Prepara los recursos locales desde Configuración antes de transcribir. Puedes consultar e importar tu historial.</p>}
      <div className="workspace"><aside aria-label="Historial de grabaciones"><h2>Grabaciones <span className="count">{state?.meetings.length ?? 0}</span></h2>
        {!state ? <p role="status">Cargando historial…</p> : state.meetings.length === 0 ? <p className="muted">Tu primera grabación aparecerá aquí.</p> : <ul className="history">{state.meetings.map(item => <li key={item.id}><button aria-pressed={selectedId === item.id} onClick={() => setSelectedId(item.id)}><strong>{item.title}</strong><span>{statusLabels[item.status] ?? item.status} · {new Date(item.recordedAt).toLocaleString('es')}</span></button></li>)}</ul>}
      </aside><section className="detail" aria-label="Detalle de grabación" aria-busy={busy}>
        {!detail ? <div className="empty"><h2>{selectedId ? 'Cargando grabación…' : 'Tus reuniones, en tu equipo'}</h2><p>Graba una reunión o selecciona una del historial.</p></div> : <>
          <div className="section-heading"><h2>{m!.title}</h2><span className="status">{statusLabels[m!.status] ?? m!.status}</span></div>
          <p className="muted">{new Date(m!.recordedAt).toLocaleString('es')}{m!.durationS != null && ` · ${clock(m!.durationS * 1000)}`}</p>
          {m!.error && <p role="alert" className="error">{m!.error}</p>}
          {['en_cola', 'transcribiendo'].includes(m!.status) && <label>Transcripción: {m!.progress}%<progress value={m!.progress} max={100} /></label>}
          <div className="actions">
            {m!.status !== 'grabando' && m!.chunkCount > 0 && <button disabled={busy} onClick={() => void run(() => play())}>Reproducir</button>}
            {m!.status === 'interrumpida' && <button disabled={busy} onClick={() => void run(() => window.neenemi.call('process', { id: m!.id }))}>Procesar conservado</button>}
            {m!.status === 'error' && <button disabled={busy} onClick={() => void run(() => window.neenemi.call('retry', { id: m!.id }))}>Reintentar</button>}
            {active && <button disabled={busy} onClick={() => void run(() => window.neenemi.call('cancel', { id: m!.id }))}>Cancelar procesamiento</button>}
            {m!.id !== state?.recordingId && <button className="danger" disabled={busy} onClick={() => dialog.current?.showModal()}>Eliminar</button>}
          </div>
          <audio ref={audio} controls src={audioURL || undefined} aria-label="Audio de la grabación" onError={() => setMessage('No se pudo reproducir el audio.')} />
          <div className="tabs" role="tablist" aria-label="Resultados"><button id="transcript-tab" role="tab" aria-selected={tab === 'transcript'} aria-controls="transcript-panel" tabIndex={tab === 'transcript' ? 0 : -1} onKeyDown={event => { if (event.key === 'ArrowRight') { setTab('summary'); document.getElementById('summary-tab')?.focus(); } }} onClick={() => setTab('transcript')}>Transcripción</button><button id="summary-tab" role="tab" aria-selected={tab === 'summary'} aria-controls="summary-panel" tabIndex={tab === 'summary' ? 0 : -1} onKeyDown={event => { if (event.key === 'ArrowLeft') { setTab('transcript'); document.getElementById('transcript-tab')?.focus(); } }} onClick={() => setTab('summary')}>Resumen</button></div>
          <section id="transcript-panel" role="tabpanel" aria-labelledby="transcript-tab" hidden={tab !== 'transcript'}>
            {detail.segments.length ? <><div className="actions"><button disabled={busy} onClick={() => void run(() => window.neenemi.copyMarkdown(m!.id, false))}>Copiar texto</button><button disabled={busy} onClick={() => void run(() => window.neenemi.exportMarkdown(m!.id, false))}>Exportar transcripción</button></div><ol className="segments">{detail.segments.map(segment => <li key={segment.seq}><button disabled={busy} onClick={() => void run(() => play(segment.startMs))}><time>{clock(segment.startMs)}</time><span>{segment.text}</span></button></li>)}</ol></> : <p className="muted">{m!.status === 'listo' ? 'No se detectó texto hablado. No se generará un resumen.' : 'La transcripción aparecerá al terminar el procesamiento.'}</p>}
          </section>
          <section id="summary-panel" role="tabpanel" aria-labelledby="summary-tab" hidden={tab !== 'summary'}>
            <p className="ai-notice">Generado por IA. Verifica acuerdos, nombres y fechas con el audio original.</p>
            <p role="status">{{ queued: 'Resumen en cola', running: 'Generando resumen local…', error: 'No se pudo generar el resumen', ready: 'Resumen listo' }[m!.summaryStatus] ?? 'Sin resumen'}</p>
            {m!.summaryError && <p className="error" role="alert">{m!.summaryError}</p>}
            {m!.status === 'listo' && detail.segments.length > 0 && <button disabled={busy || ['queued', 'running'].includes(m!.summaryStatus)} onClick={() => void run(() => window.neenemi.call('summary', { id: m!.id }))}>{summary ? 'Regenerar resumen' : 'Generar resumen'}</button>}
            {summary && <><div className="actions"><button disabled={busy} onClick={() => void run(() => window.neenemi.copyMarkdown(m!.id, true))}>Copiar resumen</button><button disabled={busy} onClick={() => void run(() => window.neenemi.exportMarkdown(m!.id, true))}>Exportar resumen</button></div>
              <p className="muted">{summary.model} · {new Date(summary.generatedAt).toLocaleString('es')}</p><h3>Visión general</h3><p>{summary.document.overview}</p>
              <h3>Temas</h3><ul>{summary.document.topics.map((item, index) => <li key={index}>{item.text}<div className="actions">{references(item.sources)}</div></li>)}</ul><h3>Decisiones</h3><ul>{summary.document.decisions.map((item, index) => <li key={index}>{item.text}<div className="actions">{references(item.sources)}</div></li>)}</ul>
              <h3>Pendientes</h3><ul>{summary.document.actions.map((item, index) => <li key={index}>{item.task}{item.responsible && ` · ${item.responsible}`}{item.dueDate && ` · ${item.dueDate}`}<div className="actions">{references(item.sources)}</div></li>)}</ul>
            </>}
          </section>
        </>}
      </section></div>
    </>}
    <dialog ref={dialog} aria-labelledby="delete-title"><h2 id="delete-title">Eliminar grabación</h2><p>Se eliminarán el audio, la transcripción y el resumen de «{m?.title}». Esta acción no se puede deshacer.</p><form method="dialog" className="actions"><button autoFocus>Cancelar</button><button className="danger" onClick={() => { if (m) void run(async () => { playbackGeneration.current++; setAudioURL(''); await window.neenemi.call('delete', { id: m.id }); selection.current = null; setSelectedId(null); }); }}>Eliminar definitivamente</button></form></dialog>
  </main>;
}
