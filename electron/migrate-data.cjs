const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

async function exists(filePath) {
  try {
    await fs.stat(filePath);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

async function migrateLegacyDataDirectory(appDataRoot, userDataDirectory) {
  const newData = path.join(userDataDirectory, 'data');
  if (await exists(path.join(newData, 'dcss.sqlite'))) return;
  const oldProfiles = ['datasystems-suite', 'Data Systems Suite'];
  const sources = [];
  for (const name of oldProfiles) {
    const directory = path.join(appDataRoot, name, 'data');
    if (directory !== newData && await exists(path.join(directory, 'datasystems.sqlite'))) sources.push(directory);
  }
  if (sources.length === 0) return;
  if (sources.length > 1) {
    throw new Error('Hay dos instalaciones anteriores con bases distintas. Selecciona un respaldo antes de migrar a DCSS Suite.');
  }
  const oldData = sources[0];
  if (await exists(newData)) {
    throw new Error('DCSS Suite ya tiene un directorio de datos sin base. Revisa su contenido antes de migrar la instalación anterior.');
  }

  await fs.mkdir(userDataDirectory, { recursive: true });
  const staging = path.join(userDataDirectory, `.data-migration-${randomUUID()}`);
  try {
    await fs.cp(oldData, staging, { recursive: true, errorOnExist: true, force: false });
    const oldDatabase = path.join(staging, 'datasystems.sqlite');
    const newDatabase = path.join(staging, 'dcss.sqlite');
    await fs.rename(oldDatabase, newDatabase);
    for (const suffix of ['-wal', '-shm']) {
      if (await exists(`${oldDatabase}${suffix}`)) {
        await fs.rename(`${oldDatabase}${suffix}`, `${newDatabase}${suffix}`);
      }
    }

    // Verify the copied SQLite (including any WAL) before exposing it to the API.
    const Database = require('better-sqlite3');
    const database = new Database(newDatabase, { readonly: true, fileMustExist: true });
    try {
      const result = database.pragma('quick_check');
      if (result.length !== 1 || result[0].quick_check !== 'ok') {
        throw new Error('La copia de la base anterior no superó la comprobación de integridad.');
      }
    } finally {
      database.close();
    }
    await fs.rename(staging, newData);
  } catch (error) {
    await fs.rm(staging, { recursive: true, force: true });
    throw error;
  }
}

module.exports = { migrateLegacyDataDirectory };
