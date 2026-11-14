import { rankTeams, type TeamStats } from './standings';
import type { CriterionKey, Settings, TeamId } from './types';

/**
 * How `koSize` knockout places are filled from `groupCount` groups:
 * the best `directPerGroup` teams of every group qualify directly, the
 * remaining `bestOfNext` places go to the best teams on the next group rank
 * (e.g. "the three best runners-up"), compared across all groups.
 */
export interface QualificationRule {
  directPerGroup: number;
  bestOfNext: number;
}

export function qualificationRule(groupCount: number, koSize: number): QualificationRule {
  return {
    directPerGroup: Math.floor(koSize / groupCount),
    bestOfNext: koSize % groupCount,
  };
}

/** A qualified team with its position in the knockout seeding list. */
export interface Seed {
  /** 1 = best qualifier. */
  seed: number;
  teamId: TeamId;
  groupId: string;
  /** Final rank inside its group (1-based). */
  groupRank: number;
}

export interface GroupRanking {
  groupId: string;
  /** Team ids in table order. */
  order: readonly TeamId[];
  stats: ReadonlyMap<TeamId, TeamStats>;
}

export interface SeedingOptions {
  koSize: number;
  criteria: readonly CriterionKey[];
  settings: Pick<Settings, 'pointsWin' | 'pointsLoss'>;
  lots: Readonly<Record<TeamId, number>>;
}

/**
 * Determines the qualifiers and their seeding.
 *
 * Seeding goes by group rank first (all group winners before all runners-up
 * and so on). Teams on the same group rank are ordered by a comparison across
 * groups. That comparison cannot use the direct comparison (the teams never
 * met) and switches to per-game averages when the groups have different
 * sizes, because totals would favour the larger groups.
 */
export function computeSeeds(groups: readonly GroupRanking[], options: SeedingOptions): Seed[] {
  const rule = qualificationRule(groups.length, options.koSize);
  const sizes = groups.map((group) => group.order.length);
  const perGame = new Set(sizes).size > 1;
  const criteria = options.criteria.filter((key) => key !== 'headToHead');

  const allStats = new Map<TeamId, TeamStats>();
  for (const group of groups) for (const [id, entry] of group.stats) allStats.set(id, entry);

  const seeds: Seed[] = [];
  const lastRank = rule.directPerGroup + (rule.bestOfNext > 0 ? 1 : 0);
  for (let rank = 1; rank <= lastRank; rank++) {
    const candidates = new Map<TeamId, string>();
    for (const group of groups) {
      const teamId = group.order[rank - 1];
      if (teamId !== undefined) candidates.set(teamId, group.groupId);
    }
    const ranked = rankTeams([...candidates.keys()], allStats, {
      criteria,
      settings: options.settings,
      lots: options.lots,
      perGame,
    });
    const take = rank <= rule.directPerGroup ? ranked.length : rule.bestOfNext;
    for (const { teamId } of ranked.slice(0, take)) {
      seeds.push({
        seed: seeds.length + 1,
        teamId,
        groupId: candidates.get(teamId) as string,
        groupRank: rank,
      });
    }
  }
  return seeds;
}
