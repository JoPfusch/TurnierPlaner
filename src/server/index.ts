import { createApp } from './app';
import { loadConfig } from './config';
import { lanAddresses } from './network';
import { TournamentStore } from './store';
import { TeamTokens } from './tokens';

/** Entry point: load data, start the HTTP server, shut down cleanly. */
async function main(): Promise<void> {
  const config = loadConfig();
  const store = new TournamentStore(config.dataDir);
  await store.load();
  const tokens = new TeamTokens(config.dataDir);
  await tokens.load();

  // Auto-confirmation of reported results (setting "timeout").
  const timer = setInterval(() => store.expireProposals(Date.now()), 10_000);

  const server = createApp(store, config, tokens).listen(config.port, config.host, () => {
    console.log(`Turnierplaner läuft auf Port ${config.port}`);
    console.log(`  Beamer:      http://localhost:${config.port}/`);
    console.log(`  Verwaltung:  http://localhost:${config.port}/admin`);
    for (const address of lanAddresses()) {
      console.log(`  Im Netzwerk: http://${address}:${config.port}/admin`);
    }
    if (config.publicUrl) console.log(`  Für QR-Codes: ${config.publicUrl}`);
    console.log(
      config.adminPin
        ? '  Verwaltung ist per PIN geschützt.'
        : '  ACHTUNG: Verwaltung ohne PIN – jeder im Netzwerk kann sie öffnen (ADMIN_PIN setzen).',
    );
  });

  const shutdown = (): void => {
    clearInterval(timer);
    server.closeAllConnections();
    server.close(() => {
      void store.flush().then(() => process.exit(0));
    });
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
