import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  applyCommand,
  hasDueProposals,
  initialState,
  parseState,
  type Command,
  type TournamentState,
} from '../shared';

type Listener = (state: TournamentState) => void;

/**
 * Holds the tournament state in memory, persists it to a JSON file and
 * notifies subscribers about every change.
 *
 * There is exactly one tournament per server instance; commands are applied
 * synchronously, so concurrent requests from laptop and phone cannot
 * interleave.
 */
export class TournamentStore {
  private state: TournamentState = initialState();
  private readonly listeners = new Set<Listener>();
  private writeQueue: Promise<void> = Promise.resolve();
  private readonly file: string;

  constructor(private readonly dataDir: string) {
    this.file = path.join(dataDir, 'tournament.json');
  }

  /** Loads the data file if present. A broken file is kept aside, never overwritten silently. */
  async load(): Promise<void> {
    await mkdir(this.dataDir, { recursive: true });
    let raw: string;
    try {
      raw = await readFile(this.file, 'utf8');
    } catch {
      return; // first start
    }
    try {
      this.state = parseState(JSON.parse(raw));
    } catch (error) {
      const backup = `${this.file}.invalid-${Date.now()}`;
      await rename(this.file, backup);
      console.error(`Datendatei war ungültig und wurde nach ${backup} verschoben.`, error);
    }
  }

  get current(): TournamentState {
    return this.state;
  }

  /** Applies a command; throws a `DomainError` if it is not allowed. */
  dispatch(command: Command): TournamentState {
    const prepared =
      command.type === 'draw' && command.seed === undefined
        ? { ...command, seed: Math.floor(Math.random() * 2 ** 31) }
        : command;
    return this.commit(applyCommand(this.state, prepared));
  }

  /**
   * Accepts reported results whose confirmation period is over. Called by a
   * timer; only creates a new revision if something is actually due.
   */
  expireProposals(now: number): void {
    if (hasDueProposals(this.state, now)) this.dispatch({ type: 'expireProposals', now });
  }

  /** Replaces the whole state (import of a backup). */
  replace(state: TournamentState): TournamentState {
    return this.commit({ ...state, revision: this.state.revision + 1 });
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Resolves when all pending writes have reached the disk. */
  flush(): Promise<void> {
    return this.writeQueue;
  }

  private commit(next: TournamentState): TournamentState {
    this.state = next;
    this.persist(next);
    for (const listener of this.listeners) listener(next);
    return next;
  }

  /** Atomic write (temp file + rename), serialised so that the newest state always wins. */
  private persist(state: TournamentState): void {
    this.writeQueue = this.writeQueue
      .then(async () => {
        const temp = `${this.file}.tmp`;
        await writeFile(temp, JSON.stringify(state, null, 2), 'utf8');
        await rename(temp, this.file);
      })
      .catch((error: unknown) => {
        console.error('Speichern fehlgeschlagen:', error);
      });
  }
}
