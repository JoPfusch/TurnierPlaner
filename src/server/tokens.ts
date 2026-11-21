import { randomBytes } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

/**
 * Secret links that bind a phone to a team (`/team/<token>`).
 *
 * The tokens are deliberately kept out of the tournament state: that state is
 * pushed to every display and phone, the tokens must only reach the organiser
 * (for the QR codes) and the phone that scanned one.
 */
export class TeamTokens {
  private byTeam = new Map<string, string>();
  /** Phones that opened a team link: team id -> device id -> last seen (ms). */
  private devices = new Map<string, Map<string, number>>();
  private readonly file: string;
  private readonly devicesFile: string;

  constructor(private readonly dataDir: string) {
    this.file = path.join(dataDir, 'team-tokens.json');
    this.devicesFile = path.join(dataDir, 'team-devices.json');
  }

  async load(): Promise<void> {
    try {
      const raw = JSON.parse(await readFile(this.file, 'utf8')) as Record<string, string>;
      this.byTeam = new Map(Object.entries(raw));
    } catch {
      // first start or unreadable file: new tokens are created on demand
    }
    try {
      const raw = JSON.parse(await readFile(this.devicesFile, 'utf8')) as Record<string, Record<string, number>>;
      this.devices = new Map(
        Object.entries(raw).map(([teamId, seen]) => [teamId, new Map(Object.entries(seen))]),
      );
    } catch {
      // no phone has been paired yet
    }
  }

  /**
   * Notes that a phone uses a team link. New devices are written to disk at
   * once; the "last seen" time of known ones only in memory (it changes every
   * minute and is not worth a write).
   */
  async touch(teamId: string, deviceId: string, now: number): Promise<void> {
    const seen = this.devices.get(teamId) ?? new Map<string, number>();
    const known = seen.has(deviceId);
    seen.set(deviceId, now);
    this.devices.set(teamId, seen);
    if (!known) await this.saveDevices();
  }

  /** Number of paired phones and last activity per team. */
  deviceStats(teamIds: readonly string[]): Record<string, { devices: number; lastSeen: number | null }> {
    return Object.fromEntries(
      teamIds.map((teamId) => {
        const seen = [...(this.devices.get(teamId)?.values() ?? [])];
        return [teamId, { devices: seen.length, lastSeen: seen.length ? Math.max(...seen) : null }];
      }),
    );
  }

  /** Tokens for the given teams; missing ones are created. */
  async linksFor(teamIds: readonly string[]): Promise<Record<string, string>> {
    let created = false;
    for (const teamId of teamIds) {
      if (this.byTeam.has(teamId)) continue;
      this.byTeam.set(teamId, randomBytes(9).toString('base64url'));
      created = true;
    }
    if (created) await this.save();
    return Object.fromEntries(teamIds.map((teamId) => [teamId, this.byTeam.get(teamId) as string]));
  }

  teamIdFor(token: string): string | null {
    for (const [teamId, value] of this.byTeam) if (value === token) return teamId;
    return null;
  }

  /** Invalidates all links (new tournament: team ids start over). */
  async clear(): Promise<void> {
    this.byTeam.clear();
    this.devices.clear();
    await this.save();
    await this.saveDevices();
  }

  private async saveDevices(): Promise<void> {
    await mkdir(this.dataDir, { recursive: true });
    const data = Object.fromEntries(
      [...this.devices].map(([teamId, seen]) => [teamId, Object.fromEntries(seen)]),
    );
    const temp = `${this.devicesFile}.tmp`;
    await writeFile(temp, JSON.stringify(data, null, 2), 'utf8');
    await rename(temp, this.devicesFile);
  }

  private async save(): Promise<void> {
    await mkdir(this.dataDir, { recursive: true });
    const temp = `${this.file}.tmp`;
    await writeFile(temp, JSON.stringify(Object.fromEntries(this.byTeam), null, 2), 'utf8');
    await rename(temp, this.file);
  }
}
