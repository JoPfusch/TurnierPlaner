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
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  return {
    port: Number(env.PORT ?? 3000),
    host: env.HOST ?? '0.0.0.0',
    dataDir: path.resolve(env.DATA_DIR ?? 'data'),
    adminPin: (env.ADMIN_PIN ?? '').trim(),
    clientDir: path.resolve(env.CLIENT_DIR ?? path.join(import.meta.dirname, '..', 'client')),
  };
}
