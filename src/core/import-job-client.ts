import { readJson } from './http';

export type ImportJobStatus = 'queued' | 'running' | 'completed' | 'failed';

export type ImportJobSnapshot<TResult = unknown> = {
  id: string;
  kind: string;
  sourceName: string;
  status: ImportJobStatus;
  progress: number;
  stage: string;
  result?: TResult;
  error?: string;
};

type ImportJobStartResponse = {
  jobId: string;
  kind: string;
  sourceName: string;
};

export async function submitImportJob<T>(
  url: string,
  body: unknown,
  onProgress: (job: ImportJobSnapshot<T>) => void = () => undefined,
  onStarted: (jobId: string) => void = () => undefined,
): Promise<T> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const started = await readJson<ImportJobStartResponse>(response);
  onStarted(started.jobId);
  return waitForImportJob<T>(started.jobId, onProgress);
}

async function waitForImportJob<T>(jobId: string, onProgress: (job: ImportJobSnapshot<T>) => void): Promise<T> {
  const deadline = Date.now() + 30 * 60 * 1000;
  while (Date.now() < deadline) {
    const response = await fetch(`/api/import-jobs/${encodeURIComponent(jobId)}`);
    const job = await readJson<ImportJobSnapshot<T>>(response);
    onProgress(job);
    if (job.status === 'completed') {
      if (job.result === undefined) throw new Error('La importación terminó sin devolver un resultado.');
      return job.result;
    }
    if (job.status === 'failed') throw new Error(job.error || 'No se pudo completar la importación.');
    await new Promise<void>((resolve) => setTimeout(resolve, 300));
  }
  throw new Error('La importación superó el tiempo máximo de espera de 30 minutos.');
}
