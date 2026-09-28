const path = require('node:path');

process.env.DS_SERVER_AUTOSTART = 'false';
const { startServer } = require(path.join(__dirname, '..', 'dist', 'server.cjs'));

const server = startServer({
  dataDirectory: process.env.DS_DATA_DIR || path.join(process.cwd(), 'data'),
  staticDirectory: path.join(__dirname, '..', 'dist'),
  host: '127.0.0.1',
  port: 0,
});

server.once('listening', () => {
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  if (!port) {
    reportError(new Error('La API local no obtuvo un puerto válido.'));
    return;
  }
  if (process.send) process.send({ type: 'ready', port });
});

server.once('error', (error) => {
  reportError(error);
});

function reportError(error) {
  const message = error instanceof Error ? error.message : 'La API local no pudo iniciar.';
  if (process.send) process.send({ type: 'error', message });
  console.error(message);
  process.exitCode = 1;
}
