import { existsSync, createReadStream, mkdirSync, openSync, writeSync, closeSync } from 'node:fs';
import { mkdir, mkdtemp, rename, rm, writeFile } from 'node:fs/promises';
import { join, resolve, relative, isAbsolute, dirname, delimiter } from 'node:path';
import { spawn, execFile, type ChildProcess } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { Readable } from 'node:stream';
import { createInterface } from 'node:readline';
import { Unzip, UnzipInflate } from 'fflate';
import { z } from 'zod';
import { downloadVerified } from './resources';
import { ollamaRequest } from './summarizer';

// Official standalone distribution for application embedding: https://docs.ollama.com/windows#standalone-cli
const version = '0.40.3';
const archiveHash = 'e5ecff02dfc7cae8ddf6d6b7a7ac5f727ffeedf4491f44ae75ff5b0820dbbbd5';
const archiveUrl = `https://github.com/ollama/ollama/releases/download/v${version}/ollama-windows-amd64.zip`;
const ollamaLicense = `MIT License

Copyright (c) Ollama

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
`;

export async function extractOllamaArchive(archive: string, directory: string, signal: AbortSignal): Promise<void> {
  const root = resolve(directory), descriptors = new Set<number>();
  let failure: Error | undefined;
  const unzip = new Unzip(file => {
    if (failure) return;
    const name = file.name.replaceAll('\\', '/');
    const destination = resolve(root, name), path = relative(root, destination);
    if (!path || isAbsolute(name) || isAbsolute(path) || path.split(/[\\/]/).includes('..') || name.includes(':') || name.includes('\0')) {
      failure = new Error('El archivo Ollama contiene una ruta no segura.'); return;
    }
    if (name.endsWith('/')) { mkdirSync(destination, { recursive: true }); return; }
    mkdirSync(dirname(destination), { recursive: true });
    const descriptor = openSync(destination, 'wx'); descriptors.add(descriptor);
    file.ondata = (error, data, final) => {
      if (error) { failure = error; return; }
      if (failure) return;
      try {
        signal.throwIfAborted();
        let offset = 0;
        while (offset < data.length) offset += writeSync(descriptor, data, offset, data.length - offset);
        if (final) { closeSync(descriptor); descriptors.delete(descriptor); }
      } catch (error) { failure = error instanceof Error ? error : new Error(String(error)); }
    };
    file.start();
  });
  unzip.register(UnzipInflate);
  try {
    for await (const chunk of createReadStream(archive)) {
      signal.throwIfAborted(); unzip.push(chunk); if (failure) throw failure;
    }
    unzip.push(new Uint8Array(), true); if (failure) throw failure;
    signal.throwIfAborted();
    if (descriptors.size || !existsSync(join(root, 'ollama.exe'))) throw new Error('El paquete Ollama está incompleto.');
  } finally { for (const descriptor of descriptors) closeSync(descriptor); }
}

export async function installOllamaWindows(directory: string, progress: (text: string) => void, signal: AbortSignal): Promise<string> {
  const installed = join(directory, version), executable = join(installed, 'ollama.exe');
  signal.throwIfAborted();
  if (existsSync(join(installed, 'ready.json')) && existsSync(executable)) {
    if (!existsSync(join(installed, 'LICENSE_OLLAMA'))) await writeFile(join(installed, 'LICENSE_OLLAMA'), ollamaLicense);
    return executable;
  }
  await mkdir(directory, { recursive: true });
  const archive = join(directory, `ollama-${version}.zip`);
  progress('Descargando Ollama oficial para Windows (aproximadamente 1,5 GB).');
  await downloadVerified(archiveUrl, archive, archiveHash, progress, signal);
  const staging = await mkdtemp(join(directory, '.install-'));
  try {
    progress('Instalando Ollama en el perfil local, sin permisos de administrador.');
    await extractOllamaArchive(archive, staging, signal);
    await writeFile(join(staging, 'LICENSE_OLLAMA'), ollamaLicense);
    await writeFile(join(staging, 'ready.json'), JSON.stringify({ version, sha256: archiveHash }));
    signal.throwIfAborted();
    // Only this version's incomplete, app-managed directory can be replaced.
    await rm(installed, { recursive: true, force: true }); await rename(staging, installed);
    await rm(archive, { force: true });
    return executable;
  } finally { await rm(staging, { recursive: true, force: true }); }
}

export class OllamaRuntime {
  private engine: ChildProcess | undefined;
  private starting: Promise<void> | undefined;
  private readonly lifetime = new AbortController();
  constructor(private readonly directory: string) {}

  private async available(signal: AbortSignal): Promise<boolean> {
    try {
      const response = await ollamaRequest('tags', undefined, AbortSignal.any([signal, AbortSignal.timeout(1500)]), 'GET');
      if (!response.ok) return false;
      z.object({ models: z.array(z.object({ name: z.string() })) }).parse(await response.json()); return true;
    } catch { signal.throwIfAborted(); return false; }
  }
  private executable(): string | undefined {
    const name = process.platform === 'win32' ? 'ollama.exe' : 'ollama';
    const candidates = [
      ...(process.platform === 'win32' ? [join(this.directory, version, name)] : []),
      ...(process.env.LOCALAPPDATA ? [join(process.env.LOCALAPPDATA, 'Programs', 'Ollama', name), join(process.env.LOCALAPPDATA, 'Ollama', name)] : []),
      ...(process.env.PATH ?? '').split(delimiter).filter(Boolean).map(directory => join(directory, name))
    ];
    return candidates.find(path => existsSync(path));
  }
  private async start(signal: AbortSignal, progress: (text: string) => void): Promise<void> {
    if (await this.available(signal)) return;
    let executable = this.executable();
    if (!executable) {
      if (process.platform !== 'win32' || process.arch !== 'x64') throw new Error('Instala Ollama para tu plataforma; la instalación automática admite Windows x64.');
      executable = await installOllamaWindows(this.directory, progress, signal);
    }
    signal.throwIfAborted(); progress('Iniciando la API local de Ollama en 127.0.0.1:11434.');
    let engine = this.engine;
    let startupError: Error | undefined;
    if (!engine || engine.exitCode !== null || engine.signalCode !== null) {
      engine = spawn(executable, ['serve'], {
        windowsHide: true, stdio: 'ignore',
        env: { ...process.env, OLLAMA_HOST: '127.0.0.1:11434', OLLAMA_NO_CLOUD: '1', OLLAMA_NUM_PARALLEL: '1', OLLAMA_MAX_LOADED_MODELS: '1' }
      });
      this.engine = engine;
      engine.on('error', error => { startupError = error; });
    }
    try {
      const deadline = Date.now() + 60000;
      while (Date.now() < deadline) {
        signal.throwIfAborted();
        if (await this.available(signal)) return;
        if (startupError || engine.exitCode !== null || engine.signalCode !== null) break;
        await delay(500, undefined, { signal });
      }
      throw startupError ?? new Error('Ollama no pudo iniciar la API local. Comprueba si otro programa ocupa el puerto 11434.');
    } catch (error) { await this.stopOwned(); throw error; }
  }
  async ensureRunning(signal: AbortSignal, progress: (text: string) => void = () => {}): Promise<void> {
    const combined = AbortSignal.any([signal, this.lifetime.signal]); combined.throwIfAborted();
    if (!this.starting) this.starting = this.start(combined, progress).finally(() => { this.starting = undefined; });
    const starting = this.starting;
    await new Promise<void>((resolve, reject) => {
      const abort = () => reject(combined.reason);
      combined.addEventListener('abort', abort, { once: true });
      starting.then(resolve, reject).finally(() => combined.removeEventListener('abort', abort));
    });
    combined.throwIfAborted();
  }
  async prepare(model: string, progress: (text: string) => void, signal: AbortSignal): Promise<void> {
    const combined = AbortSignal.any([signal, this.lifetime.signal]);
    await this.ensureRunning(combined, progress);
    progress(`Preparando ${model}. La primera descarga necesita conexión.`);
    const response = await ollamaRequest('pull', { model, stream: true }, combined);
    if (!response.ok || !response.body) throw new Error(`Ollama no pudo descargar el modelo (${response.status}).`);
    const body = response.body as Parameters<typeof Readable.fromWeb>[0];
    const input = Readable.fromWeb(body), reader = createInterface({ input });
    const abort = () => input.destroy(new Error('Descarga cancelada.'));
    combined.addEventListener('abort', abort, { once: true }); let success = false;
    try {
      for await (const line of reader) {
        combined.throwIfAborted();
        const value = z.object({ error: z.string().optional(), status: z.string().optional(), completed: z.number().optional(), total: z.number().optional() }).parse(JSON.parse(line));
        if (value.error) throw new Error(value.error);
        success = value.status === 'success';
        progress((value.status ?? '') + (value.total ? ` ${Math.floor((value.completed ?? 0) / 1000000)}/${Math.floor(value.total / 1000000)} MB` : ''));
      }
      if (!success) throw new Error('Ollama no confirmó la descarga del modelo.');
    } finally { combined.removeEventListener('abort', abort); reader.close(); input.destroy(); }
  }
  private async stopOwned(): Promise<void> {
    const engine = this.engine;
    if (!engine || engine.exitCode !== null || engine.signalCode !== null || !engine.pid) { this.engine = undefined; return; }
    const closed = new Promise<void>(resolve => { engine.once('close', resolve); });
    if (process.platform === 'win32') {
      // Terminate descendants as well: model runners must not outlive our server.
      await new Promise<void>((resolve, reject) => {
        execFile(join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'taskkill.exe'), ['/PID', String(engine.pid), '/T', '/F'], { windowsHide: true, timeout: 10000 }, error => {
          if (error && engine.exitCode === null && engine.signalCode === null) reject(error); else resolve();
        });
      });
    } else if (!engine.kill()) {
      throw new Error('No se pudo detener el motor Ollama iniciado por la aplicación.');
    }
    await closed;
    if (this.engine === engine) this.engine = undefined;
  }
  async close(): Promise<void> {
    this.lifetime.abort(); await this.starting?.catch(() => {}); await this.stopOwned();
  }
}
