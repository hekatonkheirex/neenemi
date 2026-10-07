const fs = require('node:fs/promises');
const { createWriteStream } = require('node:fs');
const path = require('node:path');
const { Readable } = require('node:stream');
const { pipeline } = require('node:stream/promises');

// Write beside the destination, then replace it only after the entire transfer succeeds.
async function saveBackupFile(url, filePath) {
  const response = await fetch(url, { redirect: 'error' });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.error || `No se pudo descargar el respaldo (HTTP ${response.status}).`);
  }
  if (!response.body || !response.headers.get('content-type')?.includes('application/vnd.sqlite3')) {
    await response.body?.cancel();
    throw new Error('El servicio no devolvió un respaldo SQLite.');
  }
  let temporaryDirectory;
  try {
    temporaryDirectory = await fs.mkdtemp(path.join(path.dirname(filePath), '.dcss-backup-'));
    const temporaryPath = path.join(temporaryDirectory, 'backup.sqlite');
    await pipeline(Readable.fromWeb(response.body), createWriteStream(temporaryPath, { flags: 'wx' }));
    await fs.rename(temporaryPath, filePath);
  } finally {
    await response.body.cancel().catch(() => undefined);
    if (temporaryDirectory) await fs.rm(temporaryDirectory, { recursive: true, force: true });
  }
}

module.exports = { saveBackupFile };
