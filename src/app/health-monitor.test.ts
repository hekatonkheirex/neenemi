import { describe, expect, it } from 'vitest';
import { HEALTH_FAILURES_BEFORE_ALERT, nextFailureCount, shouldAlert, type HealthCheckResult } from './health-monitor';

const unreachable: HealthCheckResult = { kind: 'unreachable' };

describe('monitor de salud', () => {
  it('un solo fallo (consulta pesada que bloquea el servidor) no muestra el aviso', () => {
    const failures = nextFailureCount(0, unreachable);
    expect(failures).toBe(1);
    expect(shouldAlert(failures, unreachable)).toBe(false);
  });

  it('avisa tras fallos seguidos y se limpia con el primer éxito', () => {
    let failures = 0;
    for (let i = 0; i < HEALTH_FAILURES_BEFORE_ALERT; i += 1) failures = nextFailureCount(failures, unreachable);
    expect(shouldAlert(failures, unreachable)).toBe(true);
    failures = nextFailureCount(failures, { kind: 'ok' });
    expect(failures).toBe(0);
    expect(shouldAlert(failures, { kind: 'ok' })).toBe(false);
  });

  it('un fallo intercalado con éxitos nunca acumula', () => {
    let failures = 0;
    for (const result of [unreachable, { kind: 'ok' }, unreachable, { kind: 'ok' }, unreachable] as HealthCheckResult[]) {
      failures = nextFailureCount(failures, result);
      expect(shouldAlert(failures, result)).toBe(false);
    }
  });

  it('si el servidor responde expresamente que está caído, avisa de inmediato', () => {
    const down: HealthCheckResult = { kind: 'reported-down' };
    expect(shouldAlert(nextFailureCount(0, down), down)).toBe(true);
  });
});
