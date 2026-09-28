type CurrentImportLookup = {
  domain: string;
  sourceHash: string;
  sourceType?: string;
};

export type CurrentImportStatus = {
  current: boolean;
  batchId: string | null;
};

export async function checkCurrentAppliedImport(input: CurrentImportLookup): Promise<CurrentImportStatus> {
  const query = new URLSearchParams({ domain: input.domain, sourceHash: input.sourceHash });
  if (input.sourceType) query.set('sourceType', input.sourceType);

  const response = await fetch(`/api/imports/check-current?${query.toString()}`);
  const body = await response.json().catch(() => null) as { current?: unknown; batchId?: unknown; error?: unknown } | null;
  if (!response.ok) {
    throw new Error(typeof body?.error === 'string' ? body.error : 'No se pudo comprobar el archivo importado.');
  }
  if (!body || typeof body.current !== 'boolean' || !(typeof body.batchId === 'string' || body.batchId === null)) {
    throw new Error('La API devolvió una comprobación de importación no válida.');
  }
  return { current: body.current, batchId: body.batchId };
}
