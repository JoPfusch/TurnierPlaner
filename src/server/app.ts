import { existsSync } from 'node:fs';
import path from 'node:path';
import express, { type ErrorRequestHandler, type Express, type RequestHandler } from 'express';
import { ZodError } from 'zod';
import {
  commandSchema,
  DomainError,
  parseState,
  teamActionSchema,
  type Command,
  type TeamAction,
} from '../shared';
import type { ServerConfig } from './config';
import { lanAddresses } from './network';
import type { TournamentStore } from './store';
import type { TeamTokens } from './tokens';
import { deleteVenueMap, findVenueMap, saveVenueMap, VENUE_MAP_TYPES } from './venueMap';

/**
 * HTTP API
 *
 *   GET  /api/state     current state (JSON)
 *   GET  /api/events    Server-Sent Events: the full state on connect and after every change
 *   GET  /api/info      network addresses and whether a PIN is required
 *   POST /api/commands  apply a command            (PIN protected)
 *   POST /api/import    replace the state (backup) (PIN protected)
 *   GET  /api/team-links             secret link token per team, for the QR codes (PIN protected)
 *   GET  /api/team/:token            which team a phone belongs to
 *   POST /api/team/:token/actions    report / confirm / dispute / withdraw a result
 *   GET  /api/manifest               web app manifest ("install" on the home screen)
 *   GET  /api/admin/check            204 if the PIN is right (login of the administration)
 *   GET  /api/venue-map              venue map image
 *   PUT  /api/venue-map              upload the venue map (PIN protected, body = image)
 *   DELETE /api/venue-map            remove the venue map (PIN protected)
 *
 * Everything else serves the built client (single-page app).
 */
export function createApp(store: TournamentStore, config: ServerConfig, tokens: TeamTokens): Express {
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
    res.json({
      pinRequired: config.adminPin !== '',
      addresses: lanAddresses(),
      port: config.port,
      publicUrl: config.publicUrl,
    });
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

  app.post('/api/commands', requirePin, async (req, res) => {
    const command = commandSchema.parse(req.body);
    const state = store.dispatch(command);
    // Team ids start over in a new tournament; old links must not point to new teams.
    if (command.type === 'resetTournament') await tokens.clear();
    res.json(state);
  });

  app.post('/api/import', requirePin, (req, res) => {
    res.json(store.replace(parseState(req.body)));
  });

  app.get('/api/admin/check', requirePin, (_req, res) => {
    res.status(204).end();
  });

  app.get('/api/venue-map', async (_req, res) => {
    const file = await findVenueMap(config.dataDir);
    if (!file) {
      res.status(404).json({ error: 'Kein Tischplan hinterlegt.' });
      return;
    }
    // The URL carries the version (?v=…), so the image may be cached for good.
    res.set('Cache-Control', 'public, max-age=31536000, immutable').sendFile(file);
  });

  app.put(
    '/api/venue-map',
    requirePin,
    express.raw({ type: Object.keys(VENUE_MAP_TYPES), limit: '8mb' }),
    async (req, res) => {
      const contentType = req.get('content-type') ?? '';
      if (!Buffer.isBuffer(req.body) || req.body.length === 0 || !VENUE_MAP_TYPES[contentType]) {
        res.status(400).json({ error: 'Bitte ein Bild als JPEG, PNG oder WebP hochladen.' });
        return;
      }
      await saveVenueMap(config.dataDir, contentType, req.body);
      store.dispatch({ type: 'updateSettings', patch: { venueMapVersion: Date.now() } });
      res.status(204).end();
    },
  );

  app.delete('/api/venue-map', requirePin, async (_req, res) => {
    await deleteVenueMap(config.dataDir);
    store.dispatch({ type: 'updateSettings', patch: { venueMapVersion: null } });
    res.status(204).end();
  });

  app.get('/api/team-links', requirePin, async (_req, res) => {
    res.json(await tokens.linksFor(store.current.teams.map((team) => team.id)));
  });

  /** Resolves a link token to a team that still exists. */
  const teamOf = (token: string | undefined): string | null => {
    const teamId = token ? tokens.teamIdFor(token) : null;
    return teamId && store.current.teams.some((team) => team.id === teamId) ? teamId : null;
  };

  app.get('/api/team/:token', (req, res) => {
    const teamId = teamOf(req.params.token);
    if (!teamId) {
      res.status(404).json({ error: 'Dieser Team-Link ist nicht (mehr) gültig.' });
      return;
    }
    res.json({ teamId });
  });

  app.post('/api/team/:token/actions', (req, res) => {
    const teamId = teamOf(req.params.token);
    if (!teamId) {
      res.status(404).json({ error: 'Dieser Team-Link ist nicht (mehr) gültig.' });
      return;
    }
    store.dispatch(teamCommand(teamActionSchema.parse(req.body), teamId));
    res.json({ ok: true });
  });

  app.get('/api/manifest', (req, res) => {
    // The start URL carries the team link: installed web apps on iOS do not share storage with the browser.
    const start = typeof req.query.start === 'string' && /^\/[\w\-/]*$/.test(req.query.start) ? req.query.start : '/team';
    res.type('application/manifest+json').json({
      name: store.current.settings.name,
      short_name: 'Turnier',
      start_url: start,
      scope: '/',
      display: 'standalone',
      background_color: '#0b1020',
      theme_color: '#0b1020',
      icons: [
        { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
        { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
      ],
    });
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

  app.use(onError);
  return app;
}

/** Translates what a phone sent into a command on behalf of its team. */
function teamCommand(action: TeamAction, teamId: string): Command {
  switch (action.action) {
    case 'propose':
      return {
        type: 'proposeResult',
        matchId: action.matchId,
        teamId,
        scoreA: action.scoreA,
        scoreB: action.scoreB,
        at: Date.now(),
      };
    case 'confirm':
      return { type: 'confirmProposal', matchId: action.matchId, teamId };
    case 'dispute':
      return { type: 'disputeProposal', matchId: action.matchId, teamId };
    case 'withdraw':
      return { type: 'withdrawProposal', matchId: action.matchId, teamId };
  }
}

const onError: ErrorRequestHandler = (error, _req, res, _next) => {
  if (error instanceof DomainError) {
    res.status(400).json({ error: error.message });
  } else if (error instanceof ZodError) {
    res.status(400).json({ error: 'Ungültige Eingabe.', details: error.issues });
  } else if (error instanceof SyntaxError) {
    res.status(400).json({ error: 'Ungültiges JSON.' });
  } else if ((error as { type?: string }).type === 'entity.too.large') {
    res.status(413).json({ error: 'Die Datei ist zu groß.' });
  } else {
    console.error(error);
    res.status(500).json({ error: 'Interner Fehler.' });
  }
};
