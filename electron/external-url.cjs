/**
 * shell.openExternal entrega la URL al sistema operativo tal cual: file:, smb:, ms-msdt: y
 * otros esquemas ejecutan o abren recursos locales. Solo se permiten páginas web y correo.
 */
function openExternalSafely(shell, value) {
  try {
    const { protocol } = new URL(value);
    if (protocol === 'https:' || protocol === 'http:' || protocol === 'mailto:') {
      void shell.openExternal(value);
      return true;
    }
  } catch {
    // URL mal formada: no se abre.
  }
  return false;
}

module.exports = { openExternalSafely };
