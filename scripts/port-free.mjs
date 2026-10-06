import net from 'node:net';

/** Resuelve true si nadie escucha en host:port. Cualquier error distinto de EADDRINUSE cuenta como libre. */
export function isPortFree(port, host = '127.0.0.1') {
  return new Promise((resolve) => {
    const probe = net.createServer();
    probe.once('error', (error) => resolve(error.code !== 'EADDRINUSE'));
    probe.once('listening', () => probe.close(() => resolve(true)));
    probe.listen(port, host);
  });
}
