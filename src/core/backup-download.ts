export type BackupDownloadResult =
  | { status: 'saved'; filePath?: string }
  | { status: 'downloaded' }
  | { status: 'cancelled' };

type BackupFileHandle = { createWritable: () => Promise<WritableStream<Uint8Array>> };
type SaveFileWindow = Window & {
  showSaveFilePicker?: (options: {
    suggestedName: string;
    types: { description: string; accept: Record<string, string[]> }[];
  }) => Promise<BackupFileHandle>;
};

export async function downloadBackup(): Promise<BackupDownloadResult> {
  if (window.dataSystemsDesktop?.saveBackup) {
    const result = await window.dataSystemsDesktop.saveBackup();
    return result.saved ? { status: 'saved', filePath: result.filePath } : { status: 'cancelled' };
  }

  const fileName = `dcss-suite-backup-${new Date().toISOString().replaceAll(':', '-')}.sqlite`;
  const picker = (window as SaveFileWindow).showSaveFilePicker;
  let fileHandle: BackupFileHandle | undefined;
  if (picker) {
    try {
      fileHandle = await picker.call(window, {
        suggestedName: fileName,
        types: [{ description: 'Respaldo SQLite', accept: { 'application/vnd.sqlite3': ['.sqlite'] } }],
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return { status: 'cancelled' };
      throw error;
    }
  }
  const response = await fetch('/api/system/backup', { cache: 'no-store' });
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { error?: string } | null;
    throw new Error(body?.error ?? `No se pudo descargar el respaldo (HTTP ${response.status}).`);
  }
  if (!response.body || !response.headers.get('content-type')?.includes('application/vnd.sqlite3')) {
    await response.body?.cancel();
    throw new Error('El servicio no devolvió un respaldo SQLite.');
  }
  if (fileHandle) {
    const destination = await fileHandle.createWritable();
    await response.body.pipeTo(destination);
    return { status: 'saved' };
  }

  // Browsers without file access delegate the final disk save to their download manager.
  const url = URL.createObjectURL(await response.blob());
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
  return { status: 'downloaded' };
}
