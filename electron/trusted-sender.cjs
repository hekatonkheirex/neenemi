/**
 * Los handlers IPC escriben archivos y abren diálogos del sistema. Solo los atiende el marco
 * principal de la ventana de la suite, cargado desde el servidor local; un iframe o una
 * página externa que llegue al preload no debe poder invocarlos.
 */
function isLocalUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' && (url.hostname === '127.0.0.1' || url.hostname === 'localhost');
  } catch {
    return false;
  }
}

function assertTrustedSender(event) {
  const frame = event && event.senderFrame;
  const isMainFrame = frame && event.sender && frame === event.sender.mainFrame;
  if (!frame || !isMainFrame || !isLocalUrl(frame.url)) {
    throw new Error('Origen no autorizado para esta operación.');
  }
}

module.exports = { isLocalUrl, assertTrustedSender };
