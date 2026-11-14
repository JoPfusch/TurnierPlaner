import type { Command, TeamAction } from '../shared/commands';
import type { TournamentState } from '../shared/types';

/** Thin client for the HTTP API. Live updates arrive separately via `useTournament`. */

const PIN_KEY = 'turnierplaner.pin';

export interface ServerInfo {
  pinRequired: boolean;
  addresses: string[];
  port: number;
  /** Configured address for links (PUBLIC_URL), empty if not set. */
  publicUrl: string;
}

export class ApiError extends Error {}

function storedPin(): string {
  try {
    return localStorage.getItem(PIN_KEY) ?? '';
  } catch {
    return '';
  }
}

function storePin(pin: string): void {
  try {
    localStorage.setItem(PIN_KEY, pin);
  } catch {
    // private mode: the PIN is simply asked again next time
  }
}

async function post(path: string, body: unknown, retry = true): Promise<TournamentState> {
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-admin-pin': storedPin() },
    body: JSON.stringify(body),
  });
  if (response.status === 401 && retry) {
    const pin = window.prompt('Admin-PIN eingeben:');
    if (pin === null) throw new ApiError('Ohne PIN sind keine Änderungen möglich.');
    storePin(pin.trim());
    return post(path, body, false);
  }
  const payload = (await response.json().catch(() => ({}))) as { error?: string };
  if (!response.ok) throw new ApiError(payload.error ?? `Fehler ${response.status}`);
  return payload as TournamentState;
}

export function sendCommand(command: Command): Promise<TournamentState> {
  return post('/api/commands', command);
}

export function importState(state: unknown): Promise<TournamentState> {
  return post('/api/import', state);
}

export async function fetchInfo(): Promise<ServerInfo> {
  return (await fetch('/api/info')).json() as Promise<ServerInfo>;
}

/** Secret link token per team id – needed for the QR codes (PIN protected). */
export async function fetchTeamLinks(): Promise<Record<string, string>> {
  const response = await fetch('/api/team-links', { headers: { 'x-admin-pin': storedPin() } });
  if (!response.ok) throw new ApiError('Team-Links konnten nicht geladen werden (PIN?).');
  return response.json() as Promise<Record<string, string>>;
}

/** The team a link token belongs to, or `null` if the link is not valid (any more). */
export async function fetchTeamId(token: string): Promise<string | null> {
  const response = await fetch(`/api/team/${encodeURIComponent(token)}`);
  if (!response.ok) return null;
  return ((await response.json()) as { teamId: string }).teamId;
}

export async function sendTeamAction(token: string, action: TeamAction): Promise<void> {
  const response = await fetch(`/api/team/${encodeURIComponent(token)}/actions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(action),
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as { error?: string };
    throw new ApiError(payload.error ?? `Fehler ${response.status}`);
  }
}

/**
 * Addresses under which other devices reach this server: the configured
 * PUBLIC_URL, else – when opened via localhost – the LAN addresses, else the
 * address in the browser.
 */
export function shareOrigins(info: ServerInfo | null): string[] {
  if (info?.publicUrl) return [info.publicUrl];
  const { protocol, hostname, port } = window.location;
  const local = hostname === 'localhost' || hostname === '127.0.0.1';
  const hosts = local && info && info.addresses.length > 0 ? info.addresses : [hostname];
  return hosts.map((host) => `${protocol}//${host}${port ? `:${port}` : ''}`);
}
