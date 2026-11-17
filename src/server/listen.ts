import { readFileSync } from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import type { Express } from 'express';
import type { ServerConfig } from './config';

export interface RunningServer {
  /** `http` or `https` – what the main server speaks. */
  scheme: 'http' | 'https';
  /** Stops all listeners; resolves when the ports are free. */
  close: () => Promise<void>;
}

/**
 * Starts the web server.
 *
 * With a certificate configured (TLS_CERT / TLS_KEY) the app is served via
 * HTTPS. Optionally a second, plain HTTP listener only redirects to the
 * HTTPS address, so that typing the bare host name still works.
 * The certificate is read once at start; restart after renewing it.
 */
export async function startServer(app: Express, config: ServerConfig): Promise<RunningServer> {
  const servers: http.Server[] = [];
  const listen = (server: http.Server, port: number): Promise<void> =>
    new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(port, config.host, () => {
        server.off('error', reject);
        servers.push(server);
        resolve();
      });
    });

  const tls = config.tls;
  if (!tls) {
    await listen(http.createServer(app), config.port);
  } else {
    const options = { cert: readFileSync(tls.certFile), key: readFileSync(tls.keyFile) };
    await listen(https.createServer(options, app), config.port);
    if (tls.redirectPort !== null) {
      const redirect = http.createServer((req, res) => {
        const host = (req.headers.host ?? 'localhost').replace(/:\d+$/, '');
        const port = config.port === 443 ? '' : `:${config.port}`;
        res.writeHead(308, { Location: `https://${host}${port}${req.url ?? '/'}` }).end();
      });
      await listen(redirect, tls.redirectPort);
    }
  }

  return {
    scheme: tls ? 'https' : 'http',
    close: async () => {
      await Promise.all(
        servers.map(
          (server) =>
            new Promise<void>((resolve) => {
              server.closeAllConnections();
              server.close(() => resolve());
            }),
        ),
      );
    },
  };
}
