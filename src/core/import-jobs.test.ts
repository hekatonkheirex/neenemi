import { describe, expect, it } from 'vitest';
import { ImportJobRegistry } from './import-jobs';

describe('ImportJobRegistry', () => {
  it('tracks a job through progress and completion', () => {
    const registry = new ImportJobRegistry();
    const created = registry.create({ kind: 'fleet.equipment', sourceName: 'cartera.xlsx' });

    expect(created.status).toBe('queued');
    expect(created.progress).toBe(0);

    registry.update(created.id, { status: 'running', progress: 42.4, stage: 'Leyendo archivo…' });
    expect(registry.get(created.id)).toMatchObject({ status: 'running', progress: 42, stage: 'Leyendo archivo…' });

    registry.complete(created.id, { rows: 12 });
    expect(registry.get(created.id)).toMatchObject({ status: 'completed', progress: 100, result: { rows: 12 } });
  });

  it('keeps failures available for the client to display', () => {
    const registry = new ImportJobRegistry();
    const created = registry.create({ kind: 'discontinuation.canon', sourceName: 'canon.xlsx' });

    registry.fail(created.id, 'El archivo no contiene hojas válidas.');

    expect(registry.get(created.id)).toMatchObject({
      status: 'failed',
      stage: 'Error',
      error: 'El archivo no contiene hojas válidas.',
    });
  });
});
