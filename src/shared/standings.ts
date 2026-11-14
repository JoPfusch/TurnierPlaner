import type { CriterionKey, Settings, TeamId } from './types';

/** A finished match, reduced to what the table calculation needs. */
export interface PlayedMatch {
  teamA: TeamId;
  teamB: TeamId;
  scoreA: number;
  scoreB: number;
}

export interface TeamStats {
  teamId: TeamId;
  played: number;
  wins: number;
  losses: number;
  points: number;
  /** Sum of own remaining cups. */
  cupsFor: number;
  /** Sum of the opponents' remaining cups. */
  cupsAgainst: number;
  cupDiff: number;
}

type PointSettings = Pick<Settings, 'pointsWin' | 'pointsLoss'>;

export function computeStats(
  teamIds: readonly TeamId[],
  matches: readonly PlayedMatch[],
  settings: PointSettings,
): Map<TeamId, TeamStats> {
  const stats = new Map<TeamId, TeamStats>(
    teamIds.map((teamId) => [
      teamId,
      { teamId, played: 0, wins: 0, losses: 0, points: 0, cupsFor: 0, cupsAgainst: 0, cupDiff: 0 },
    ]),
  );
  const book = (entry: TeamStats, own: number, other: number): void => {
    entry.played += 1;
    entry.cupsFor += own;
    entry.cupsAgainst += other;
    entry.cupDiff = entry.cupsFor - entry.cupsAgainst;
    if (own > other) {
      entry.wins += 1;
      entry.points += settings.pointsWin;
    } else {
      entry.losses += 1;
      entry.points += settings.pointsLoss;
    }
  };
  for (const match of matches) {
    const a = stats.get(match.teamA);
    const b = stats.get(match.teamB);
    if (!a || !b) continue;
    book(a, match.scoreA, match.scoreB);
    book(b, match.scoreB, match.scoreA);
  }
  return stats;
}

export interface RankOptions {
  /** Criteria in priority order. */
  criteria: readonly CriterionKey[];
  settings: PointSettings;
  /** Lot per team, lower wins. Used when all criteria are exhausted. */
  lots: Readonly<Record<TeamId, number>>;
  /** Matches used for the direct comparison. Leave empty to skip that criterion. */
  matches?: readonly PlayedMatch[];
  /**
   * Compare per-game averages instead of totals. Required when teams of
   * groups with different sizes are compared with each other.
   */
  perGame?: boolean;
}

export interface RankedTeam {
  teamId: TeamId;
  /** True if this position could only be decided by lot. */
  decidedByLot: boolean;
}

/**
 * Orders teams by the configured criteria.
 *
 * Works by successive refinement: all teams start in one bucket; each
 * criterion splits every bucket of still-tied teams into ordered sub-buckets.
 * The direct comparison is evaluated *inside* a bucket, i.e. only between
 * the teams that are actually tied at that point.
 */
export function rankTeams(
  teamIds: readonly TeamId[],
  stats: ReadonlyMap<TeamId, TeamStats>,
  options: RankOptions,
): RankedTeam[] {
  const { criteria, settings, lots, matches = [], perGame = false } = options;

  const totalValue = (key: Exclude<CriterionKey, 'headToHead'>, teamId: TeamId): number => {
    const entry = stats.get(teamId);
    if (!entry) return 0;
    const divisor = perGame ? Math.max(entry.played, 1) : 1;
    switch (key) {
      case 'points':
        return entry.points / divisor;
      case 'cupDiff':
        return entry.cupDiff / divisor;
      case 'cupsFor':
        return entry.cupsFor / divisor;
      case 'wins':
        return entry.wins / divisor;
      case 'cupsAgainst':
        return -entry.cupsAgainst / divisor;
    }
  };

  const refine = (bucket: readonly TeamId[], index: number): TeamId[][] => {
    const key = criteria[index];
    if (bucket.length <= 1 || key === undefined) return [[...bucket]];

    let valueOf: (teamId: TeamId) => number[];
    if (key === 'headToHead') {
      const members = new Set(bucket);
      const direct = matches.filter((m) => members.has(m.teamA) && members.has(m.teamB));
      if (direct.length === 0) return refine(bucket, index + 1);
      const mini = computeStats(bucket, direct, settings);
      valueOf = (teamId) => {
        const entry = mini.get(teamId);
        return entry ? [entry.points, entry.cupDiff] : [0, 0];
      };
    } else {
      valueOf = (teamId) => [totalValue(key, teamId)];
    }

    const byValue = new Map<string, { value: number[]; teams: TeamId[] }>();
    for (const teamId of bucket) {
      const value = valueOf(teamId);
      const mapKey = value.map((v) => v.toFixed(6)).join('|');
      const entry = byValue.get(mapKey) ?? { value, teams: [] };
      entry.teams.push(teamId);
      byValue.set(mapKey, entry);
    }
    return [...byValue.values()]
      .sort((x, y) => compareDescending(x.value, y.value))
      .flatMap((entry) => refine(entry.teams, index + 1));
  };

  return refine(teamIds, 0).flatMap((bucket) =>
    [...bucket]
      .sort((x, y) => (lots[x] ?? 0) - (lots[y] ?? 0) || x.localeCompare(y))
      .map((teamId) => ({ teamId, decidedByLot: bucket.length > 1 })),
  );
}

function compareDescending(x: readonly number[], y: readonly number[]): number {
  for (let i = 0; i < x.length; i++) {
    const diff = (y[i] ?? 0) - (x[i] ?? 0);
    if (Math.abs(diff) > 1e-9) return diff;
  }
  return 0;
}
