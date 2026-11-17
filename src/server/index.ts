import { createApp } from './app';
import { loadConfig } from './config';
import { startServer } from './listen';
import { lanAddresses } from './network';
import { TournamentStore } from './store';
import { TeamTokens } from './tokens';

/** Entry point: load data, start the web server, shut down cleanly. */
async function main(): Promise<void> {
  const config = loadConfig();
  const store = new TournamentStore(config.dataDir);
  await store.load();
  const tokens = new TeamTokens(config.dataDir);
  await tokens.load();

  // Auto-confirmation of reported results (setting "timeout").
  const timer = setInterval(() => store.expireProposals(Date.now()), 10_000);

  const server = await startServer(createApp(store, config, tokens), config);
  const origin = (host: string): string => `${server.scheme}://${host}:${config.port}`;
  console.log(`Turnierplaner läuft auf Port ${config.port} (${server.scheme.toUpperCase()})`);
  console.log(`  Beamer:      ${origin('localhost')}/`);
  console.log(`  Verwaltung:  ${origin('localhost')}/admin`);
  for (const address of lanAddresses()) console.log(`  Im Netzwerk: ${origin(address)}/admin`);
  if (config.publicUrl) console.log(`  Für QR-Codes: ${config.publicUrl}`);
  if (config.tls && !config.publicUrl) {
    console.log('  HINWEIS: Mit HTTPS PUBLIC_URL auf den Namen im Zertifikat setzen, sonst zeigen');
    console.log('           die QR-Codes auf die IP und die Handys melden einen Zertifikatsfehler.');
  }
  console.log(
    config.adminPin
      ? '  Verwaltung ist per PIN geschützt.'
      : '  ACHTUNG: Verwaltung ohne PIN – jeder im Netzwerk kann sie öffnen (ADMIN_PIN setzen).',
  );

  const shutdown = (): void => {
    clearInterval(timer);
    void server
      .close()
      .then(() => store.flush())
      .then(() => process.exit(0));
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
