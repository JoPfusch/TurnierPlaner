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
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  return {
    port: Number(env.PORT ?? 3000),
    host: env.HOST ?? '0.0.0.0',
    dataDir: path.resolve(env.DATA_DIR ?? 'data'),
    adminPin: (env.ADMIN_PIN ?? '').trim(),
    publicUrl: (env.PUBLIC_URL ?? '').trim().replace(/\/+$/, ''),
    clientDir: path.resolve(env.CLIENT_DIR ?? path.join(import.meta.dirname, '..', 'client')),
  };
}
