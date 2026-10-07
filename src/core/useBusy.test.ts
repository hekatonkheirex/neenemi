import { describe, expect, it } from 'vitest';
import { runExclusive } from './useBusy';

describe('runExclusive', () => {
  it('marca ocupado durante la tarea y lo libera al terminar', async () => {
    const lock = { current: false };
    const states: boolean[] = [];
    const result = await runExclusive(lock, (b) => states.push(b), async () => 42);
    expect(result).toBe(42);
    expect(states).toEqual([true, false]);
    expect(lock.current).toBe(false);
  });

  it('libera aunque la tarea falle', async () => {
    const lock = { current: false };
    const states: boolean[] = [];
    await expect(runExclusive(lock, (b) => states.push(b), async () => { throw new Error('x'); })).rejects.toThrow('x');
    expect(states).toEqual([true, false]);
    expect(lock.current).toBe(false);
  });

  it('ignora un segundo llamado mientras corre el primero', async () => {
    const lock = { current: false };
    let release!: () => void;
    let calls = 0;
    const first = runExclusive(lock, () => {}, () => { calls += 1; return new Promise<void>((r) => { release = r; }); });
    const second = await runExclusive(lock, () => {}, async () => { calls += 1; });
    expect(second).toBeUndefined();
    release();
    await first;
    expect(calls).toBe(1);
  });
});
