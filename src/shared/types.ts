/**
 * Domain model of the tournament.
 *
 * Only *facts* are persisted (teams, settings, the draw and entered results).
 * Everything else – standings, qualifiers, the knockout bracket, "now playing" –
 * is derived on demand by pure functions (see `view.ts`). That keeps the state
 * small, makes corrections trivial and guarantees server and clients can never
 * disagree about a table.
 */

export type TeamId = string;
export type MatchId = string;

export interface Team {
  id: TeamId;
  name: string;
}

/**
 * Ranking criteria. Their order in `Settings.criteria` is their priority
 * ("Gewichtung"): the first criterion decides, later ones only break ties.
 * A drawn lot is always the implicit last resort.
 */
export const CRITERION_KEYS = [
  'points',
  'cupDiff',
  'headToHead',
  'cupsFor',
  'wins',
  'cupsAgainst',
] as const;
export type CriterionKey = (typeof CRITERION_KEYS)[number];

export interface Settings {
  /** Tournament title shown on the display. */
  name: string;
  /** Number of groups in the group stage. */
  groupCount: number;
  /** One entry per venue ("Spielort"); its length is the number of tables. */
  tableNames: string[];
  /** Number of teams that reach the knockout stage (any number >= 2, byes are added if needed). */
  koSize: number;
  /** Play a match for third place. */
  thirdPlaceMatch: boolean;
  /** Table points for a win / a loss. */
  pointsWin: number;
  pointsLoss: number;
  /** Cups per team at the start of a game – upper bound for an entered result. */
  maxCups: number;
  /** Enabled ranking criteria in priority order. */
  criteria: CriterionKey[];
  /** Optional local start time, e.g. `2026-11-13T19:00`. `null` = no clock times shown. */
  startTime: string | null;
  /** Planned minutes per match slot (used for clock times and the duration estimate). */
  matchMinutes: number;
  /** Break between group stage and knockout stage in minutes. */
  koBreakMinutes: number;
  /** Teams may report their own results from their phones. */
  teamReporting: boolean;
  /** Who turns a reported result into an official one. */
  confirmation: ConfirmationMode;
  /** Minutes after which an unanswered report is accepted (mode `timeout`). */
  autoConfirmMinutes: number;
  /** House rules shown to the teams (plain text, line breaks are kept). */
  rules: string;
  /** Where to find each table, parallel to `tableNames` (e.g. "Garage, links"). */
  tableDescriptions: string[];
  /** Version of the uploaded venue map (upload time); `null` = no map. */
  venueMapVersion: number | null;
}

/**
 * How a result reported by a team becomes official:
 * - `opponent`: the other team confirms (the organiser always can, too)
 * - `timeout`:  like `opponent`, but an unanswered report is accepted automatically
 * - `admin`:    only the organiser confirms
 */
export const CONFIRMATION_MODES = ['opponent', 'timeout', 'admin'] as const;
export type ConfirmationMode = (typeof CONFIRMATION_MODES)[number];

/** A result reported by one of the two teams that is not official yet. */
export interface Proposal extends Result {
  byTeamId: TeamId;
  /** Time of the report (ms since epoch). */
  at: number;
  /** The other team contradicted – the organiser has to decide. */
  disputed: boolean;
}

export interface Group {
  /** `A`, `B`, ... */
  id: string;
  teamIds: TeamId[];
}

export interface GroupMatch {
  id: MatchId;
  groupId: string;
  /** Round-robin round inside the group (0-based). */
  round: number;
  /** Global time slot (0-based). All matches of a slot are played in parallel. */
  slot: number;
  /** Index into `Settings.tableNames`. */
  table: number;
  teamA: TeamId;
  teamB: TeamId;
}

/**
 * A result holds the remaining cups of both teams. In beer pong the loser has
 * 0 cups left, so the winner's score is the cup difference – but the model is
 * generic enough for any "higher score wins" game.
 */
export interface Result {
  scoreA: number;
  scoreB: number;
}

export interface Draw {
  /** Seed of the random generator, stored so the draw is reproducible. */
  seed: number;
  groups: Group[];
  matches: GroupMatch[];
  /** Lot number per team (lower wins) – the final, deterministic tie-breaker. */
  lots: Record<TeamId, number>;
}

export interface TournamentState {
  schemaVersion: 1;
  /** Incremented with every accepted command. */
  revision: number;
  settings: Settings;
  teams: Team[];
  nextTeamNumber: number;
  /** `null` until the group stage has been drawn. */
  draw: Draw | null;
  /** Results of group matches and knockout matches, keyed by match id. */
  results: Record<MatchId, Result>;
  /** Reported but unconfirmed results, keyed by match id. They do not count for the standings. */
  proposals: Record<MatchId, Proposal>;
}

export type Phase = 'setup' | 'group' | 'knockout' | 'finished';
