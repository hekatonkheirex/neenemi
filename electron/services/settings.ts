import { z } from 'zod';
import { existsSync, readFileSync, mkdirSync, writeFileSync, renameSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { availableParallelism } from 'node:os';
import type { Settings } from '../../src/shared/contracts';
export const settingsSchema = z.object({
  ollamaModel: z.enum(['qwen3:1.7b', 'qwen3:4b', 'qwen3:8b']),
  cpuThreads: z.number().int().min(1).max(16), contextTokens: z.number().int().min(8192).max(32768), autoSummarize: z.boolean()
});
export interface ServiceOptions { dataDirectory: string; toolsDirectory: string; settingsPath: string }
export function loadSettings(path: string): Settings {
  if (!existsSync(path)) return { ollamaModel: 'qwen3:4b', cpuThreads: Math.max(1, Math.min(4, availableParallelism() - 1)), contextTokens: 8192, autoSummarize: true };
  const old = JSON.parse(readFileSync(path, 'utf8'));
  // Read the former C# casing once; all newly saved settings use the shared TS contract.
  return settingsSchema.parse({ ollamaModel: old.ollamaModel ?? old.OllamaModel, cpuThreads: old.cpuThreads ?? old.CpuThreads, contextTokens: old.contextTokens ?? old.ContextTokens, autoSummarize: old.autoSummarize ?? old.AutoSummarize });
}
export function saveSettings(path: string, value: Settings): void {
  const settings = settingsSchema.parse(value);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path + '.tmp', JSON.stringify(settings, null, 2)); renameSync(path + '.tmp', path);
}
export function toolPaths(directory: string) {
  return { ffmpeg: join(directory, process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'), whisper: join(directory, 'whisper', process.platform === 'win32' ? 'whisper-cli.exe' : 'whisper-cli'), model: join(directory, 'whisper', 'ggml-medium-q5_0.bin') };
}
