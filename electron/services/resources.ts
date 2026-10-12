import { createHash } from 'node:crypto';
import { existsSync, createReadStream, createWriteStream } from 'node:fs';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join, basename, delimiter } from 'node:path';
import { createGunzip } from 'node:zlib';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createInterface } from 'node:readline';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { unzipSync } from 'fflate';
import { z } from 'zod';
import { toolPaths } from './settings';
import { ollamaRequest } from './summarizer';
export function hasWhisper(directory: string): boolean { return Object.values(toolPaths(directory)).every(existsSync); }
async function matchesHash(path: string, expected: string, signal: AbortSignal): Promise<boolean> {
  if (!existsSync(path)) return false;
  const hash = createHash('sha256'); for await (const chunk of createReadStream(path)) { signal.throwIfAborted(); hash.update(chunk); }
  return hash.digest('hex') === expected;
}
export async function downloadVerified(url: string, path: string, hash: string, progress: (text: string) => void, signal: AbortSignal): Promise<void> {
  signal.throwIfAborted(); if (await matchesHash(path,hash,signal)) return;
  await mkdir(join(path,'..'),{recursive:true});
  const partial = path+'.part';
  try {
    const stall = new AbortController();
    const requestSignal = AbortSignal.any([signal,stall.signal]);
    const headersTimer = setTimeout(()=>stall.abort(new Error('La descarga dejó de responder.')),60000);
    let response: Response;
    try { response = await fetch(url,{signal:requestSignal}); } finally { clearTimeout(headersTimer); }
    if (!response.ok || !response.body) throw new Error(`Descarga: ${response.status} ${url}`);
    const total = Number(response.headers.get('content-length'));
    const reader = response.body.getReader();
    let received = 0, last = -1;
    const stream = Readable.from((async function* () {
      try {
        while (true) {
          const timer = setTimeout(()=>stall.abort(new Error('La descarga dejó de responder.')),60000);
          let next: ReadableStreamReadResult<Uint8Array>;
          try { next = await reader.read(); } finally { clearTimeout(timer); }
          if (next.done) break;
          received += next.value.byteLength;
          const mb = Math.floor(received/1000000);
          if (mb !== last) { last = mb; progress(`${basename(path)}: ${mb} MB${total ? ` / ${Math.floor(total/1000000)} MB` : ''}`); }
          yield next.value;
        }
      } finally { await reader.cancel().catch(()=>{}); }
    })());
    await pipeline(stream,createWriteStream(partial),{signal:requestSignal});
    if (!await matchesHash(partial,hash,signal)) throw new Error(`La descarga no pasó SHA-256: ${basename(path)}`);
    await rename(partial,path);
  } finally { await rm(partial,{force:true}); }
}
export async function ensureWhisper(directory: string, progress: (text: string) => void, signal: AbortSignal): Promise<void> {
  const whisper = join(directory,'whisper'), cache = join(directory,'.downloads');
  await mkdir(whisper,{recursive:true}); await mkdir(cache,{recursive:true});
  const zip = join(cache,'whisper-x64.zip');
  await downloadVerified('https://github.com/ggml-org/whisper.cpp/releases/download/v1.9.2/whisper-bin-x64.zip',zip,'49dcc16de826f20bd53d44f947a1ae49dfa81f86cad67a64d80820cb192d674a',progress,signal);
  const allowed = (name: string) => name === 'whisper-cli.exe' || name === 'whisper.dll' || /^ggml.*\.dll$/.test(name) || name === 'LICENSE';
  const files = unzipSync(await readFile(zip),{filter:entry=>allowed(basename(entry.name))});
  let executable = false;
  for (const [path,data] of Object.entries(files)) {
    signal.throwIfAborted(); const name = basename(path); if (name === 'whisper-cli.exe') executable = true;
    const destination = join(whisper,name === 'LICENSE' ? 'LICENSE.whisper' : name);
    await writeFile(destination+'.part',data); await rename(destination+'.part',destination);
  }
  if (!executable) throw new Error('El paquete no contiene whisper-cli.exe.');
  await downloadVerified('https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-medium-q5_0.bin',join(whisper,'ggml-medium-q5_0.bin'),'19fea4b380c3a618ec4723c3eef2eb785ffba0d0538cf43f8f235e7b3b34220f',progress,signal);
  const gz = join(cache,'ffmpeg-win32-x64.gz');
  await downloadVerified('https://github.com/eugeneware/ffmpeg-static/releases/download/b6.1.1/ffmpeg-win32-x64.gz',gz,'8883a3dffbd0a16cf4ef95206ea05283f78908dbfb118f73c83f4951dcc06d77',progress,signal);
  const ffmpeg = join(directory,'ffmpeg.exe');
  await pipeline(createReadStream(gz),createGunzip(),createWriteStream(ffmpeg+'.part'),{signal}); await rename(ffmpeg+'.part',ffmpeg);
  for (const suffix of ['LICENSE','README']) {
    const response = await fetch('https://github.com/eugeneware/ffmpeg-static/releases/download/b6.1.1/win32-x64.'+suffix,{signal}); if (!response.ok) throw new Error('No se pudieron descargar avisos ffmpeg.');
    await writeFile(join(directory,'ffmpeg.'+suffix),await response.text());
  }
  const license = await fetch('https://raw.githubusercontent.com/ggml-org/whisper.cpp/v1.9.2/LICENSE',{signal}); if (!license.ok) throw new Error('No se pudo descargar licencia Whisper.');
  await writeFile(join(whisper,'LICENSE.whisper'),await license.text()); progress('Whisper medium Q5_0 y ffmpeg preparados.');
}
export async function prepareOllama(model: string, progress: (text:string)=>void, signal:AbortSignal): Promise<void> {
  async function available(): Promise<boolean> {
    try {
      const response = await ollamaRequest('tags',undefined,AbortSignal.any([signal,AbortSignal.timeout(3000)]),'GET');
      z.object({models:z.array(z.unknown())}).parse(await response.json()); return response.ok;
    } catch(error) { signal.throwIfAborted(); return false; }
  }
  if (!await available()) {
    const name = process.platform === 'win32' ? 'ollama.exe' : 'ollama';
    const candidates = [...(process.env.LOCALAPPDATA ? [join(process.env.LOCALAPPDATA,'Programs','Ollama',name),join(process.env.LOCALAPPDATA,'Ollama',name)] : []),...(process.env.PATH ?? '').split(delimiter).map(directory=>join(directory,name))];
    const executable = candidates.find(existsSync); if (!executable) throw new Error('Instala Ollama y vuelve a pulsar Preparar Ollama.');
    const engine = spawn(executable,['serve'],{windowsHide:true,detached:true,stdio:'ignore',env:{...process.env,OLLAMA_HOST:'127.0.0.1:11434',OLLAMA_NO_CLOUD:'1',OLLAMA_NUM_PARALLEL:'1',OLLAMA_MAX_LOADED_MODELS:'1'}});
    let startupError: Error | undefined; engine.on('error',error=>{startupError=error;}); engine.unref();
    let ready = false;
    for (let i=0;i<30;i++) { signal.throwIfAborted(); if (await available()) {ready=true;break;} if (startupError || engine.exitCode !== null) break; await delay(500,undefined,{signal}); }
    if (!ready) throw startupError ?? new Error('Ollama no inició su API local.');
  }
  progress(`Preparando ${model}. La primera descarga necesita conexión.`);
  const response = await ollamaRequest('pull',{model,stream:true},signal);
  if (!response.body) throw new Error('Ollama no devolvió progreso de descarga.');
  // DOM and node:stream/web use distinct declarations for the same native stream.
  const body = response.body as Parameters<typeof Readable.fromWeb>[0];
  const input = Readable.fromWeb(body); const reader = createInterface({input});
  const abort = () => input.destroy(new Error('Descarga cancelada.'));
  signal.addEventListener('abort',abort,{once:true}); let success=false;
  try {
    for await (const line of reader) {
      signal.throwIfAborted(); const value = z.object({error:z.string().optional(),status:z.string().optional(),completed:z.number().optional(),total:z.number().optional()}).parse(JSON.parse(line));
      if (value.error) throw new Error(value.error);
      success = value.status === 'success'; progress((value.status ?? '')+(value.total ? ` ${Math.floor((value.completed ?? 0)/1000000)}/${Math.floor(value.total/1000000)} MB` : ''));
    }
    if (!success) throw new Error('Ollama no confirmó la descarga del modelo.');
  } finally { signal.removeEventListener('abort',abort); reader.close(); input.destroy(); }
}
