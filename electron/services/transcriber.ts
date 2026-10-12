import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { z } from 'zod';
import { toolPaths } from './settings';
import type { Segment, Settings } from '../../src/shared/contracts';
export async function runProcess(command: string, args: string[], signal: AbortSignal, onLine?: (line: string) => void): Promise<void> {
  signal.throwIfAborted();
  const child = spawn(command, args, { windowsHide: true, stdio: ['ignore','pipe','pipe'] });
  const exit = Promise.withResolvers<void>();
  let diagnostics = '';
  const line = (text: string) => { diagnostics = (diagnostics + text + '\n').slice(-4000); onLine?.(text); };
  createInterface({ input: child.stdout }).on('line', line);
  createInterface({ input: child.stderr }).on('line', line);
  const abort = () => { child.kill('SIGKILL'); };
  signal.addEventListener('abort', abort, { once: true });
  // Attach the listener before checking again: abort can race process creation.
  if (signal.aborted) abort();
  child.once('error', exit.reject);
  child.once('close', code => {
    if (signal.aborted) exit.reject(signal.reason);
    else if (code !== 0) exit.reject(new Error(`${command}: salida ${code}. ${diagnostics}`));
    else exit.resolve();
  });
  try { await exit.promise; } finally { signal.removeEventListener('abort', abort); }
}
const whisperOutput = z.object({ transcription: z.array(z.object({ text: z.string(), offsets: z.object({ from: z.number().int().nonnegative(), to: z.number().int().nonnegative() }).refine(value => value.to >= value.from) })) });
export function parseSegments(value: unknown): Segment[] {
  const output = whisperOutput.parse(value), segments: Segment[] = [];
  for (const item of output.transcription) {
    const text = item.text.trim(); if (!text || /^[\[(][^\])]*[\])]$/.test(text)) continue;
    segments.push({ seq: segments.length, startMs: item.offsets.from, endMs: item.offsets.to, text });
  }
  return segments;
}
export async function transcribe(audio: string, toolsDirectory: string, settings: Settings, progress: (value: number) => void, signal: AbortSignal): Promise<Segment[]> {
  const paths = toolPaths(toolsDirectory);
  if (![paths.ffmpeg,paths.whisper,paths.model].every(existsSync)) throw new Error('Faltan recursos de transcripción. Abre Configuración y prepara Whisper.');
  const directory = await mkdtemp(join(tmpdir(), 'neenemi-whisper-'));
  try {
    const wav = join(directory, 'audio.wav'), output = join(directory, 'transcript');
    await runProcess(paths.ffmpeg, ['-y','-loglevel','error','-i',audio,'-ar','16000','-ac','1','-c:a','pcm_s16le',wav], signal);
    let peak: number | undefined;
    await runProcess(paths.ffmpeg, ['-hide_banner','-nostats','-i',wav,'-af','volumedetect','-f','null','-'], signal, line => {
      const match = /max_volume:\s*(-?\d+(?:\.\d+)?|-inf)\s*dB/.exec(line); if (match) peak = Number(match[1] === '-inf' ? '-Infinity' : match[1]);
    });
    if (peak === undefined) throw new Error('No se pudo analizar el nivel de audio.');
    if (peak < -45) return [];
    await runProcess(paths.whisper, ['-m',paths.model,'-f',wav,'-l','es','-oj','-of',output,'-pp','-sns','-t',String(settings.cpuThreads)], signal, line => {
      const match = /progress\s*=\s*(\d+)%/.exec(line); if (match) progress(Math.min(99,Number(match[1])));
    });
    return parseSegments(JSON.parse(await readFile(output + '.json','utf8')));
  } finally { await rm(directory, { recursive:true, force:true }); }
}
