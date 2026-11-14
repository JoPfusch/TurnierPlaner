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
  private readonly file: string;

  constructor(private readonly dataDir: string) {
    this.file = path.join(dataDir, 'team-tokens.json');
  }

  async load(): Promise<void> {
    try {
      const raw = JSON.parse(await readFile(this.file, 'utf8')) as Record<string, string>;
      this.byTeam = new Map(Object.entries(raw));
    } catch {
      // first start or unreadable file: new tokens are created on demand
    }
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
    await this.save();
  }

  private async save(): Promise<void> {
    await mkdir(this.dataDir, { recursive: true });
    const temp = `${this.file}.tmp`;
    await writeFile(temp, JSON.stringify(Object.fromEntries(this.byTeam), null, 2), 'utf8');
    await rename(temp, this.file);
  }
}
