import path from 'node:path';

/** Runtime configuration, read once from environment variables. */
export interface ServerConfig {
  port: number;
  host: string;
  /** Directory of the JSON data file. */
  dataDir: string;
  /** Optional PIN that protects all changing requests. Empty = no protection. */
  adminPin: string;
  /** Directory of the built client (served in production). */
  clientDir: string;
  /**
   * Address used for links and QR codes instead of the IP, e.g. `http://turnier.fritz.box:3000`.
   * Empty = use the network addresses of this machine.
   */
  publicUrl: string;
  /** HTTPS settings; `null` = plain HTTP. */
  tls: TlsConfig | null;
}

export interface TlsConfig {
  /** Certificate including the intermediate chain (PEM), e.g. `fullchain.cer`. */
  certFile: string;
  /** Private key (PEM). */
  keyFile: string;
  /** Port of an additional HTTP listener that redirects to HTTPS; `null` = none. */
  redirectPort: number | null;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const certFile = (env.TLS_CERT ?? '').trim();
  const keyFile = (env.TLS_KEY ?? '').trim();
  if ((certFile === '') !== (keyFile === '')) {
    throw new Error('Für HTTPS müssen TLS_CERT und TLS_KEY beide gesetzt sein.');
  }
  const redirectPort = (env.HTTP_REDIRECT_PORT ?? '').trim();
  return {
    tls: certFile
      ? {
          certFile: path.resolve(certFile),
          keyFile: path.resolve(keyFile),
          redirectPort: redirectPort ? Number(redirectPort) : null,
        }
      : null,
    port: Number(env.PORT ?? 3000),
    host: env.HOST ?? '0.0.0.0',
    dataDir: path.resolve(env.DATA_DIR ?? 'data'),
    adminPin: (env.ADMIN_PIN ?? '').trim(),
    publicUrl: (env.PUBLIC_URL ?? '').trim().replace(/\/+$/, ''),
    clientDir: path.resolve(env.CLIENT_DIR ?? path.join(import.meta.dirname, '..', 'client')),
  };
}
