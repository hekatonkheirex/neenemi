import { parseCatalogWorkbook, parseLegacyCatalogJson, type ParsedCatalog } from './parser';
import { checkCurrentAppliedImport } from '../../core/import-status';

export type CatalogImportProgress = {
  phase: 'reading' | 'uploading';
  message: string;
  percent: number;
};

export type CatalogImportResult = {
  batchId: string;
  duplicate: boolean;
  parts: number;
  modelFamilies: number;
  modelNotes: number;
  serviceItems: number;
};

type ProgressCallback = (progress: CatalogImportProgress) => void;

/**
 * Reads a legacy catalog file and persists both its normalized projection and
 * the original bytes through the shared suite import API.
 */
export async function importCatalogFile(
  file: File,
  onProgress?: ProgressCallback,
): Promise<CatalogImportResult> {
  const lowerName = file.name.toLowerCase();
  const isJson = lowerName.endsWith('.json');
  if (!isJson && !lowerName.endsWith('.xlsx')) {
    throw new Error('Selecciona una planilla .xlsx o un respaldo .json del catálogo.');
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  let parsed: ParsedCatalog;
  if (isJson) {
    onProgress?.({ phase: 'reading', message: 'Validando respaldo JSON…', percent: 35 });
    parsed = parseLegacyCatalogJson(new TextDecoder().decode(bytes));
  } else {
    parsed = await parseCatalogWorkbook(bytes, (message, percent) => {
      onProgress?.({ phase: 'reading', message, percent });
    });
  }

  const sourceHash = await digestBytes(bytes);
  const currentImport = await checkCurrentAppliedImport({ domain: 'catalog', sourceHash });
  if (currentImport.current) {
    if (!currentImport.batchId) throw new Error('La API no devolvió la carga vigente del catálogo.');
    return {
      batchId: currentImport.batchId,
      duplicate: true,
      parts: parsed.parts.length,
      modelFamilies: parsed.modelFamilies.length,
      modelNotes: parsed.modelNotes.length,
      serviceItems: parsed.serviceItems.length,
    };
  }

  onProgress?.({
    phase: 'uploading',
    message: `Guardando ${parsed.parts.length.toLocaleString('es-PY')} repuestos y ${parsed.serviceItems.length.toLocaleString('es-PY')} opciones comerciales…`,
    percent: 82,
  });

  const batchResponse = await fetch('/api/imports', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ domain: 'catalog', sourceName: file.name, sourceHash }),
  });
  if (!batchResponse.ok) {
    throw new Error(await readImportError(batchResponse, 'No se pudo crear la importación del catálogo.'));
  }
  const batch = await batchResponse.json() as { id?: unknown };
  if (typeof batch.id !== 'string' || batch.id.trim() === '') {
    throw new Error('La API no devolvió una importación válida.');
  }

  try {
    const sourceResponse = await fetch(`/api/imports/${batch.id}/source`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        fileName: file.name,
        contentBase64: bytesToBase64(bytes),
        contentType: file.type || (isJson ? 'application/json' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'),
      }),
    });
    if (!sourceResponse.ok) {
      throw new Error(await readImportError(sourceResponse, 'No se pudo conservar el archivo original.'));
    }
  } catch (error: unknown) {
    try {
      await fetch(`/api/imports/${batch.id}/status`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: 'failed' }),
      });
    } catch {
      // El error de conservación del archivo original es el que debe ver el usuario.
    }
    throw error;
  }

  const importResponse = await fetch('/api/catalog/parts', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      batchId: batch.id,
      parts: parsed.parts,
      modelFamilies: parsed.modelFamilies,
      modelNotes: parsed.modelNotes,
      serviceItems: parsed.serviceItems,
    }),
  });
  const importBody = await importResponse.json().catch(() => null) as { parts?: unknown; error?: string } | null;
  if (!importResponse.ok || !importBody || typeof importBody.parts !== 'number') {
    throw new Error(importBody?.error || 'La API rechazó los registros del catálogo.');
  }

  onProgress?.({ phase: 'uploading', message: 'Catálogo guardado en SQLite.', percent: 100 });
  return {
    batchId: batch.id,
    duplicate: false,
    parts: importBody.parts,
    modelFamilies: parsed.modelFamilies.length,
    modelNotes: parsed.modelNotes.length,
    serviceItems: parsed.serviceItems.length,
  };
}

async function digestBytes(bytes: Uint8Array): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function readImportError(response: Response, fallback: string): Promise<string> {
  const body = await response.json().catch(() => null) as { error?: unknown } | null;
  if (typeof body?.error === 'string' && body.error.trim() !== '') return body.error;
  if (response.status === 413) return 'El archivo supera el límite de carga de la aplicación (HTTP 413).';
  return `${fallback} (HTTP ${response.status}).`;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}
