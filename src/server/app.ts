import { existsSync } from 'node:fs';
import path from 'node:path';
import express, { type ErrorRequestHandler, type Express, type RequestHandler } from 'express';
import { ZodError } from 'zod';
import { commandSchema, DomainError, stateSchema } from '../shared';
import type { ServerConfig } from './config';
import { lanAddresses } from './network';
import type { TournamentStore } from './store';

/**
 * HTTP API
 *
 *   GET  /api/state     current state (JSON)
 *   GET  /api/events    Server-Sent Events: the full state on connect and after every change
 *   GET  /api/info      network addresses and whether a PIN is required
 *   POST /api/commands  apply a command            (PIN protected)
 *   POST /api/import    replace the state (backup) (PIN protected)
 *
 * Everything else serves the built client (single-page app).
 */
export function createApp(store: TournamentStore, config: ServerConfig): Express {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '1mb' }));

  const requirePin: RequestHandler = (req, res, next) => {
    if (config.adminPin && req.get('x-admin-pin') !== config.adminPin) {
      res.status(401).json({ error: 'PIN erforderlich oder falsch.' });
      return;
    }
    next();
  };

  app.get('/api/state', (_req, res) => {
    res.json(store.current);
  });

  app.get('/api/info', (_req, res) => {
    res.json({ pinRequired: config.adminPin !== '', addresses: lanAddresses(), port: config.port });
  });

  app.get('/api/events', (req, res) => {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    const send = (state: unknown): void => {
      res.write(`data: ${JSON.stringify(state)}\n\n`);
    };
    send(store.current);
    const unsubscribe = store.subscribe(send);
    // Comment lines keep proxies and sleepy phones from closing the connection.
    const heartbeat = setInterval(() => res.write(': ping\n\n'), 20_000);
    req.on('close', () => {
      clearInterval(heartbeat);
      unsubscribe();
    });
  });

  app.post('/api/commands', requirePin, (req, res) => {
    const command = commandSchema.parse(req.body);
    res.json(store.dispatch(command));
  });

  app.post('/api/import', requirePin, (req, res) => {
    res.json(store.replace(stateSchema.parse(req.body)));
  });

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'Unbekannter API-Pfad.' });
  });

  if (existsSync(config.clientDir)) {
    app.use(express.static(config.clientDir));
    app.use((req, res, next) => {
      if (req.method !== 'GET') return next();
      res.sendFile(path.join(config.clientDir, 'index.html'));
    });
  }

  const onError: ErrorRequestHandler = (error, _req, res, _next) => {
    if (error instanceof DomainError) {
      res.status(400).json({ error: error.message });
    } else if (error instanceof ZodError) {
      res.status(400).json({ error: 'Ungültige Eingabe.', details: error.issues });
    } else if (error instanceof SyntaxError) {
      res.status(400).json({ error: 'Ungültiges JSON.' });
    } else {
      console.error(error);
      res.status(500).json({ error: 'Interner Fehler.' });
    }
  };
  app.use(onError);

  return app;
}
