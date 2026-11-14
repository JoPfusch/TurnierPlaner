import { createApp } from './app';
import { loadConfig } from './config';
import { lanAddresses } from './network';
import { TournamentStore } from './store';

/** Entry point: load data, start the HTTP server, shut down cleanly. */
async function main(): Promise<void> {
  const config = loadConfig();
  const store = new TournamentStore(config.dataDir);
  await store.load();

  const server = createApp(store, config).listen(config.port, config.host, () => {
    console.log(`Turnierplaner läuft auf Port ${config.port}`);
    console.log(`  Beamer:      http://localhost:${config.port}/`);
    console.log(`  Verwaltung:  http://localhost:${config.port}/admin`);
    for (const address of lanAddresses()) {
      console.log(`  Im Netzwerk: http://${address}:${config.port}/admin`);
    }
    if (config.adminPin) console.log('  Änderungen sind per PIN geschützt.');
  });

  const shutdown = (): void => {
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
