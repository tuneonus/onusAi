import { createServer } from 'node:http';
import { app } from './app.js';
import { branding } from './config/branding.js';
import { env } from './config/env.js';

// Keep this unauthenticated foundation local until public access is approved.
const host = '127.0.0.1';
const shutdownTimeoutMs = 10_000;

const server = createServer(app);

server.on('error', (error: NodeJS.ErrnoException) => {
  console.error(`Server startup failed (${error.code ?? 'UNKNOWN_ERROR'}).`);
  process.exitCode = 1;
});

server.listen(env.port, host, () => {
  console.info(`${branding.productName} business API listening at http://${host}:${env.port}`);
});

let shuttingDown = false;

function shutdown(signal: NodeJS.Signals): void {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  console.info(`Received ${signal}; stopping the HTTP server.`);

  const timeout = setTimeout(() => {
    console.error('Shutdown timed out; closing remaining connections.');
    server.closeAllConnections();
    process.exit(1);
  }, shutdownTimeoutMs);
  timeout.unref();

  // Stop accepting connections and allow in-flight requests to finish.
  server.close((error) => {
    clearTimeout(timeout);

    if (error) {
      console.error('HTTP server shutdown failed.');
      process.exitCode = 1;
      return;
    }

    console.info('HTTP server stopped.');
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
