/**
 * El servidor local usa SQLite síncrono: una consulta grande (Discontinuador devuelve ~24 MB en ~1,7 s) deja el hilo
 * ocupado y /api/health tarda varios segundos aunque la base esté bien. Un solo fallo no es una avería: se avisa tras
 * varios seguidos. Una respuesta que dice expresamente ok:false sí avisa de inmediato.
 */
export const HEALTH_TIMEOUT_MS = 10_000;
export const HEALTH_FAILURES_BEFORE_ALERT = 3;

export type HealthCheckResult = { kind: 'ok' } | { kind: 'reported-down' } | { kind: 'unreachable' };

export function nextFailureCount(previous: number, result: HealthCheckResult): number {
  return result.kind === 'ok' ? 0 : previous + 1;
}

export function shouldAlert(failures: number, result: HealthCheckResult): boolean {
  return result.kind === 'reported-down' || failures >= HEALTH_FAILURES_BEFORE_ALERT;
}

export type HealthSnapshot = { ok: boolean; database: string };

export function sameHealth(left: HealthSnapshot | null, right: HealthSnapshot): boolean {
  return left !== null && left.ok === right.ok && left.database === right.database;
}
