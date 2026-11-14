import { mkdtemp, readFile, rm } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/server/app';
import { TournamentStore } from '../src/server/store';
import { TeamTokens } from '../src/server/tokens';

let dir: string;
let base: string;
let close: () => void;
let store: TournamentStore;
let tokens: TeamTokens;

const post = (url: string, body: unknown, pin?: string) =>
  fetch(base + url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(pin ? { 'x-admin-pin': pin } : {}) },
    body: JSON.stringify(body),
  });

async function start(adminPin = ''): Promise<void> {
  store = new TournamentStore(dir);
  await store.load();
  tokens = new TeamTokens(dir);
  const app = createApp(store, { port: 0, host: '127.0.0.1', dataDir: dir, adminPin, clientDir: '/nonexistent', publicUrl: '' }, tokens);
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  close = () => {
    server.closeAllConnections();
    server.close();
  };
}

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'turnier-'));
});
afterEach(async () => {
  close();
  await store.flush();
  await rm(dir, { recursive: true, force: true });
});

describe('api', () => {
  it('applies commands, persists them and reloads them', async () => {
    await start();
    const response = await post('/api/commands', { type: 'addTeams', names: ['A', 'B'] });
    expect(response.status).toBe(200);
    expect(((await response.json()) as { teams: unknown[] }).teams).toHaveLength(2);
    await store.flush();
    expect(JSON.parse(await readFile(path.join(dir, 'tournament.json'), 'utf8')).teams).toHaveLength(2);

    const reloaded = new TournamentStore(dir);
    await reloaded.load();
    expect(reloaded.current.teams.map((t) => t.name)).toEqual(['A', 'B']);
  });

  it('answers rule violations and invalid input with 400', async () => {
    await start();
    const domain = await post('/api/commands', { type: 'draw' });
    expect(domain.status).toBe(400);
    expect(((await domain.json()) as { error: string }).error).toMatch(/mindestens 2 Teams/);
    expect((await post('/api/commands', { type: 'nope' })).status).toBe(400);
    expect((await post('/api/import', { foo: 1 })).status).toBe(400);
  });

  it('protects changes with the PIN but keeps reading open', async () => {
    await start('1234');
    expect((await post('/api/commands', { type: 'addTeams', names: ['A'] })).status).toBe(401);
    expect((await post('/api/commands', { type: 'addTeams', names: ['A'] }, '1234')).status).toBe(200);
    expect((await fetch(`${base}/api/state`)).status).toBe(200);
    expect(await (await fetch(`${base}/api/info`)).json()).toMatchObject({ pinRequired: true });
  });

  it('pushes changes via server-sent events', async () => {
    await start();
    const response = await fetch(`${base}/api/events`);
    const reader = response.body!.getReader();
    const next = async (): Promise<{ teams: unknown[] }> => {
      const { value } = await reader.read();
      return JSON.parse(new TextDecoder().decode(value).replace(/^data: /, ''));
    };
    expect((await next()).teams).toHaveLength(0);
    await post('/api/commands', { type: 'addTeams', names: ['A'] });
    expect((await next()).teams).toHaveLength(1);
    await reader.cancel();
  });

  it('binds phones to teams via secret links and lets them report results', async () => {
    await start('1234');
    const names = ['A', 'B', 'C', 'D'];
    await post('/api/commands', { type: 'addTeams', names }, '1234');
    await post('/api/commands', { type: 'updateSettings', patch: { groupCount: 1, koSize: 2 } }, '1234');
    await post('/api/commands', { type: 'draw', seed: 3 }, '1234');

    expect((await fetch(`${base}/api/team-links`)).status).toBe(401);
    const links = (await (await fetch(`${base}/api/team-links`, { headers: { 'x-admin-pin': '1234' } })).json()) as Record<string, string>;
    expect(Object.keys(links)).toHaveLength(4);
    expect(JSON.stringify(store.current)).not.toContain(Object.values(links)[0]);

    const match = store.current.draw!.matches[0]!;
    const tokenA = links[match.teamA]!;
    const tokenB = links[match.teamB]!;
    const outsider = Object.entries(links).find(([id]) => id !== match.teamA && id !== match.teamB)![1];
    expect(await (await fetch(`${base}/api/team/${tokenA}`)).json()).toEqual({ teamId: match.teamA });
    expect((await fetch(`${base}/api/team/wrong`)).status).toBe(404);

    const report = { action: 'propose', matchId: match.id, scoreA: 2, scoreB: 0 };
    expect((await post(`/api/team/${outsider}/actions`, report)).status).toBe(400);
    expect((await post(`/api/team/${tokenA}/actions`, report)).status).toBe(200);
    expect(store.current.proposals[match.id]).toMatchObject({ byTeamId: match.teamA });
    expect((await post(`/api/team/${tokenA}/actions`, { action: 'confirm', matchId: match.id })).status).toBe(400);
    expect((await post(`/api/team/${tokenB}/actions`, { action: 'confirm', matchId: match.id })).status).toBe(200);
    expect(store.current.results[match.id]).toEqual({ scoreA: 2, scoreB: 0 });

    // links survive a restart, but not a new tournament
    const again = new TeamTokens(dir);
    await again.load();
    expect(again.teamIdFor(tokenA)).toBe(match.teamA);
    await post('/api/commands', { type: 'resetTournament' }, '1234');
    expect((await fetch(`${base}/api/team/${tokenA}`)).status).toBe(404);
  });

  it('serves a manifest whose start url keeps the team link', async () => {
    await start();
    const manifest = (await (await fetch(`${base}/api/manifest?start=/team/abc-123`)).json()) as { start_url: string };
    expect(manifest.start_url).toBe('/team/abc-123');
    const evil = (await (await fetch(`${base}/api/manifest?start=https://evil.example`)).json()) as { start_url: string };
    expect(evil.start_url).toBe('/team');
  });
});
