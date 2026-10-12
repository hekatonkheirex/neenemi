import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import http, { type RequestOptions, type IncomingMessage, type RequestListener } from 'node:http';
import childProcess, { type ChildProcess } from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { join, delimiter } from 'node:path';
import { tmpdir } from 'node:os';
import { zipSync, strToU8 } from 'fflate';
import { extractOllamaArchive, OllamaRuntime } from './ollama-runtime';

async function transport(context: TestContext, handler: RequestListener) {
  const server = http.createServer(handler), ready = Promise.withResolvers<void>();
  server.once('error', ready.reject); server.listen(0, '127.0.0.1', ready.resolve); await ready.promise;
  const address = server.address(); if (!address || typeof address === 'string') throw new Error('Falta el servidor local de prueba.');
  const route = { port: address.port }, request = http.request;
  context.mock.method(http, 'request', (options: RequestOptions, callback?: (response: IncomingMessage) => void) => request({ ...options, port: route.port }, callback));
  syncBuiltinESMExports();
  return { route, async close() {
    context.mock.restoreAll(); syncBuiltinESMExports(); server.closeAllConnections();
    const closed = Promise.withResolvers<void>(); server.close(() => closed.resolve()); await closed.promise;
  } };
}

test('streaming installation preserves nested engine libraries and refuses archive path traversal', async () => {
  const root = mkdtempSync(join(tmpdir(), 'neenemi-ollama-zip-')), destination = join(root, 'installed');
  try {
    mkdirSync(destination); const archive = join(root, 'engine.zip');
    writeFileSync(archive, zipSync({ 'ollama.exe': strToU8('PE fixture'), 'lib/ollama/cpu.dll': strToU8('CPU library fixture') }));
    await extractOllamaArchive(archive, destination, new AbortController().signal);
    assert.equal(readFileSync(join(destination, 'lib/ollama/cpu.dll'), 'utf8'), 'CPU library fixture');
    const guarded = join(root, 'guarded'); mkdirSync(guarded);
    const existing = join(root, 'personal.txt'); writeFileSync(existing, 'Keep my data');
    writeFileSync(archive, zipSync({ '../personal.txt': strToU8('overwrite'), 'ollama.exe': strToU8('PE fixture') }));
    await assert.rejects(extractOllamaArchive(archive, guarded, new AbortController().signal), /ruta no segura/);
    assert.equal(readFileSync(existing, 'utf8'), 'Keep my data');
    assert.equal(existsSync(join(guarded, 'ollama.exe')), false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('absolute archive entries are rejected even when they point inside the staging directory', async () => {
  const root = mkdtempSync(join(tmpdir(), 'neenemi-ollama-absolute-'));
  try {
    const archive = join(root, 'engine.zip'), target = join(root, 'ollama.exe').replaceAll('\\', '/');
    writeFileSync(archive, zipSync({ [target]: strToU8('unsafe absolute entry') }));
    await assert.rejects(extractOllamaArchive(archive, root, new AbortController().signal), /ruta no segura/);
    assert.equal(existsSync(join(root, 'ollama.exe')), false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('reuses a running external API and leaves it alive when the application closes', async context => {
  const root = mkdtempSync(join(tmpdir(), 'neenemi-ollama-external-'));
  const api = await transport(context, (_request, response) => response.end(JSON.stringify({ models: [{ name: 'qwen3:4b' }] })));
  const runtime = new OllamaRuntime(root);
  try {
    await runtime.ensureRunning(new AbortController().signal); await runtime.close();
    const response = await fetch(`http://127.0.0.1:${api.route.port}/api/tags`);
    assert.deepEqual(await response.json(), { models: [{ name: 'qwen3:4b' }] });
    assert.equal(existsSync(join(root, '0.40.3')), false);
  } finally { await runtime.close(); await api.close(); rmSync(root, { recursive: true, force: true }); }
});

test('starts an installed engine on demand, completes preparation and stops only its owned process', async context => {
  const root = mkdtempSync(join(tmpdir(), 'neenemi-ollama-owned-')), runtime = new OllamaRuntime(root);
  const api = await transport(context, (_request, response) => { response.statusCode = 503; response.end('API not started'); });
  const name = process.platform === 'win32' ? 'ollama.exe' : 'ollama';
  writeFileSync(join(root, name), 'Executable discovery fixture');
  const previousPath = process.env.PATH, previousLocalAppData = process.env.LOCALAPPDATA;
  process.env.PATH = root + delimiter + (previousPath ?? '');
  process.env.LOCALAPPDATA = join(root, 'no-system-install');
  const spawn = childProcess.spawn;
  let engine: ChildProcess | undefined;
  const engines: ChildProcess[] = [];
  const exited = Promise.withResolvers<void>();
  context.mock.method(childProcess, 'spawn', () => {
    engine = spawn(process.execPath, ['--eval', `
      const http = require('node:http'); let installed = false, unavailable = false;
      const server = http.createServer((request, response) => {
        if (request.url === '/api/pull') { installed = true; response.end('{"status":"success"}\\n'); }
        else if (request.url === '/api/pause-health') { unavailable = true; response.end('Temporary health interruption'); }
        else if (unavailable) { unavailable = false; response.statusCode = 503; response.end('Temporarily unavailable'); }
        else response.end(JSON.stringify({models: installed ? [{name:'qwen3:4b'}] : []}));
      });
      server.listen(0, '127.0.0.1', () => console.log(server.address().port));
    `], { stdio: ['ignore', 'pipe', 'pipe'] });
    engines.push(engine);
    engine.stdout!.once('data', data => { api.route.port = Number(data.toString().trim()); });
    engine.once('exit', () => exited.resolve()); return engine;
  });
  syncBuiltinESMExports();
  try {
    const signal = new AbortController().signal;
    await Promise.all([runtime.ensureRunning(signal), runtime.ensureRunning(signal)]);
    await runtime.prepare('qwen3:4b', () => {}, signal);
    await fetch(`http://127.0.0.1:${api.route.port}/api/pause-health`);
    await runtime.ensureRunning(signal);
    const response = await fetch(`http://127.0.0.1:${api.route.port}/api/tags`);
    assert.deepEqual(await response.json(), { models: [{ name: 'qwen3:4b' }] });
    await runtime.close(); await exited.promise;
    await assert.rejects(fetch(`http://127.0.0.1:${api.route.port}/api/tags`));
  } finally {
    await runtime.close();
    for (const child of engines) if (child.exitCode === null && child.signalCode === null) child.kill();
    if (previousPath === undefined) delete process.env.PATH; else process.env.PATH = previousPath;
    if (previousLocalAppData === undefined) delete process.env.LOCALAPPDATA; else process.env.LOCALAPPDATA = previousLocalAppData;
    await api.close(); rmSync(root, { recursive: true, force: true });
  }
});

test('preparation never claims success when the model download ends without confirmation', async context => {
  const root = mkdtempSync(join(tmpdir(), 'neenemi-ollama-incomplete-')), runtime = new OllamaRuntime(root);
  const api = await transport(context, (request, response) => response.end(request.url === '/api/tags' ? '{"models":[]}' : '{"status":"pulling manifest"}\n'));
  try { await assert.rejects(runtime.prepare('qwen3:4b', () => {}, new AbortController().signal), /no confirmó/); }
  finally { await runtime.close(); await api.close(); rmSync(root, { recursive: true, force: true }); }
});

test('cancels a stalled model stream without stopping an external Ollama API', { timeout: 5000 }, async context => {
  const root = mkdtempSync(join(tmpdir(), 'neenemi-ollama-cancel-')), runtime = new OllamaRuntime(root);
  const controller = new AbortController();
  const api = await transport(context, (request, response) => {
    if (request.url === '/api/tags') response.end('{"models":[]}');
    else {
      response.write('{"status":"pulling manifest');
      setImmediate(() => controller.abort());
    }
  });
  try {
    await assert.rejects(runtime.prepare('qwen3:4b', () => {}, controller.signal), /abort|cancelad/i);
    await runtime.close();
    const response = await fetch(`http://127.0.0.1:${api.route.port}/api/tags`);
    assert.deepEqual(await response.json(), { models: [] });
  } finally { await runtime.close(); await api.close(); rmSync(root, { recursive: true, force: true }); }
});
