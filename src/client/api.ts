import type { Command } from '../shared/commands';
import type { TournamentState } from '../shared/types';

/** Thin client for the HTTP API. Live updates arrive separately via `useTournament`. */

const PIN_KEY = 'turnierplaner.pin';

export interface ServerInfo {
  pinRequired: boolean;
  addresses: string[];
  port: number;
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
