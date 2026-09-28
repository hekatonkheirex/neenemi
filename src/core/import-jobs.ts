import { randomUUID } from 'node:crypto';

export type ImportJobStatus = 'queued' | 'running' | 'completed' | 'failed';

export type ImportJobSnapshot = {
  id: string;
  kind: string;
  sourceName: string;
  status: ImportJobStatus;
  progress: number;
  stage: string;
  createdAt: string;
  updatedAt: string;
  result?: unknown;
  error?: string;
};

type ImportJobPatch = Partial<Pick<ImportJobSnapshot, 'status' | 'progress' | 'stage'>>;

const jobRetentionMs = 30 * 60 * 1000;
const maxRetainedJobs = 100;

export class ImportJobRegistry {
  private readonly jobs = new Map<string, ImportJobSnapshot>();

  create(input: { kind: string; sourceName: string }): ImportJobSnapshot {
    this.prune();
    const now = new Date().toISOString();
    const job: ImportJobSnapshot = {
      id: randomUUID(),
      kind: input.kind,
      sourceName: input.sourceName,
      status: 'queued',
      progress: 0,
      stage: 'En cola',
      createdAt: now,
      updatedAt: now,
    };
    this.jobs.set(job.id, job);
    return this.copy(job);
  }

  update(id: string, patch: ImportJobPatch): void {
    const job = this.jobs.get(id);
    if (!job) return;
    job.status = patch.status ?? job.status;
    job.progress = patch.progress === undefined ? job.progress : clampProgress(patch.progress);
    job.stage = patch.stage ?? job.stage;
    job.updatedAt = new Date().toISOString();
  }

  complete(id: string, result: unknown): void {
    const job = this.jobs.get(id);
    if (!job) return;
    job.status = 'completed';
    job.progress = 100;
    job.stage = 'Completado';
    job.result = result;
    job.updatedAt = new Date().toISOString();
  }

  fail(id: string, error: string): void {
    const job = this.jobs.get(id);
    if (!job) return;
    job.status = 'failed';
    job.stage = 'Error';
    job.error = error;
    job.updatedAt = new Date().toISOString();
  }

  get(id: string): ImportJobSnapshot | undefined {
    this.prune();
    const job = this.jobs.get(id);
    return job ? this.copy(job) : undefined;
  }

  private prune(): void {
    const cutoff = Date.now() - jobRetentionMs;
    for (const [id, job] of this.jobs) {
      if ((job.status === 'completed' || job.status === 'failed') && Date.parse(job.updatedAt) < cutoff) {
        this.jobs.delete(id);
      }
    }

    if (this.jobs.size <= maxRetainedJobs) return;
    const terminalJobs = [...this.jobs.values()]
      .filter((job) => job.status === 'completed' || job.status === 'failed')
      .sort((left, right) => Date.parse(left.updatedAt) - Date.parse(right.updatedAt));
    for (const job of terminalJobs) {
      if (this.jobs.size <= maxRetainedJobs) break;
      this.jobs.delete(job.id);
    }
  }

  private copy(job: ImportJobSnapshot): ImportJobSnapshot {
    return { ...job };
  }
}

function clampProgress(progress: number): number {
  return Math.min(100, Math.max(0, Math.round(progress)));
}
