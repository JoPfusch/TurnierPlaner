import {
  bracketMatches,
  buildBracket,
  type Bracket,
  type BracketMatch,
} from './knockout';
import { computeSeeds, qualificationRule, type Seed } from './qualification';
import { groupSlotCount } from './schedule';
import { computeStats, rankTeams, type PlayedMatch, type TeamStats } from './standings';
import type { GroupMatch, MatchId, Phase, Result, TeamId, TournamentState } from './types';

/**
 * Read model: everything the UI shows, derived from the persisted state.
 * `deriveView` is pure and is evaluated by every client after each update
 * (and by the server to validate commands), so there is a single source of
 * truth for tables, qualifiers and the bracket.
 */

export type QualificationStatus =
  /** Currently on a qualifying place. */
  | 'in'
  /** On the rank that is compared across groups, but currently not among the best. */
  | 'bubble'
  | 'out';

export interface StandingRow extends TeamStats {
  rank: number;
  decidedByLot: boolean;
  status: QualificationStatus;
}

export interface GroupView {
  id: string;
  rows: StandingRow[];
  played: number;
  total: number;
  complete: boolean;
}

/** A match of either stage in a uniform shape for schedule lists. */
export interface MatchView {
  id: MatchId;
  kind: 'group' | 'knockout';
  /** "Gruppe A" or "VF 1". */
  label: string;
  slot: number;
  table: number;
  teamA: TeamId | null;
  teamB: TeamId | null;
  placeholderA: string;
  placeholderB: string;
  result: Result | null;
  winnerId: TeamId | null;
  /** Both participants are known and a result may be entered. */
  playable: boolean;
  /** Planned start relative to the tournament start. */
  minutesFromStart: number;
}

export interface TableView {
  index: number;
  name: string;
  current: MatchView | null;
  next: MatchView | null;
}

export interface TournamentView {
  phase: Phase;
  teamNames: Record<TeamId, string>;
  groups: GroupView[];
  groupStageComplete: boolean;
  /** Qualifiers in seeding order; a projection while the group stage is running. */
  seeds: Seed[];
  seedsProvisional: boolean;
  bracket: Bracket | null;
  /** All matches in playing order. */
  schedule: MatchView[];
  tables: TableView[];
  progress: { played: number; total: number };
  durationMinutes: number;
}

/** Group matches that already have a result. */
function playedGroupMatches(state: TournamentState): Map<string, PlayedMatch[]> {
  const byGroup = new Map<string, PlayedMatch[]>();
  for (const match of state.draw?.matches ?? []) {
    const result = state.results[match.id];
    if (!result) continue;
    const list = byGroup.get(match.groupId) ?? [];
    list.push({ teamA: match.teamA, teamB: match.teamB, ...result });
    byGroup.set(match.groupId, list);
  }
  return byGroup;
}

export function deriveView(state: TournamentState): TournamentView {
  const { settings, draw, results } = state;
  const teamNames: Record<TeamId, string> = {};
  for (const team of state.teams) teamNames[team.id] = team.name;
  const tableCount = settings.tableNames.length;

  if (!draw) {
    return {
      phase: 'setup',
      teamNames,
      groups: [],
      groupStageComplete: false,
      seeds: [],
      seedsProvisional: true,
      bracket: null,
      schedule: [],
      tables: settings.tableNames.map((name, index) => ({ index, name, current: null, next: null })),
      progress: { played: 0, total: 0 },
      durationMinutes: 0,
    };
  }

  // --- group tables ---------------------------------------------------------
  const played = playedGroupMatches(state);
  const rankings = draw.groups.map((group) => {
    const matches = played.get(group.id) ?? [];
    const stats = computeStats(group.teamIds, matches, settings);
    const ranked = rankTeams(group.teamIds, stats, {
      criteria: settings.criteria,
      settings,
      lots: draw.lots,
      matches,
    });
    return { groupId: group.id, order: ranked.map((entry) => entry.teamId), stats, ranked };
  });
  const groupMatchCount = draw.matches.length;
  const groupPlayedCount = draw.matches.filter((match) => results[match.id]).length;
  const groupStageComplete = groupPlayedCount === groupMatchCount;

  // --- qualifiers and bracket -----------------------------------------------
  const seeds = computeSeeds(rankings, {
    koSize: settings.koSize,
    criteria: settings.criteria,
    settings,
    lots: draw.lots,
  });
  const groupSlots = groupSlotCount(draw.matches);
  const bracket = buildBracket({
    seeds,
    koSize: settings.koSize,
    results,
    // Before the first result the projection would only reflect the lots.
    resolveTeams: groupPlayedCount > 0,
    honourResults: groupStageComplete,
    thirdPlaceMatch: settings.thirdPlaceMatch,
    tableCount,
    firstSlot: groupSlots,
  });

  const rule = qualificationRule(draw.groups.length, settings.koSize);
  const qualified = new Set(seeds.map((seed) => seed.teamId));
  const groups: GroupView[] = rankings.map((ranking) => {
    const matches = draw.matches.filter((match) => match.groupId === ranking.groupId);
    const done = matches.filter((match) => results[match.id]).length;
    return {
      id: ranking.groupId,
      played: done,
      total: matches.length,
      complete: done === matches.length,
      rows: ranking.ranked.map((entry, index) => ({
        ...(ranking.stats.get(entry.teamId) as TeamStats),
        rank: index + 1,
        decidedByLot: entry.decidedByLot,
        status: qualified.has(entry.teamId)
          ? 'in'
          : rule.bestOfNext > 0 && index === rule.directPerGroup
            ? 'bubble'
            : 'out',
      })),
    };
  });

  // --- schedule -------------------------------------------------------------
  const minutes = (slot: number, knockout: boolean): number =>
    slot * settings.matchMinutes + (knockout ? settings.koBreakMinutes : 0);

  const groupView = (match: GroupMatch): MatchView => {
    const result = results[match.id] ?? null;
    return {
      id: match.id,
      kind: 'group',
      label: `Gruppe ${match.groupId}`,
      slot: match.slot,
      table: match.table,
      teamA: match.teamA,
      teamB: match.teamB,
      placeholderA: '',
      placeholderB: '',
      result,
      winnerId: result ? (result.scoreA > result.scoreB ? match.teamA : match.teamB) : null,
      playable: true,
      minutesFromStart: minutes(match.slot, false),
    };
  };
  const knockoutView = (match: BracketMatch): MatchView => ({
    id: match.id,
    kind: 'knockout',
    label: match.label,
    slot: match.slot ?? 0,
    table: match.table ?? 0,
    teamA: match.a.teamId,
    teamB: match.b.teamId,
    placeholderA: match.a.placeholder,
    placeholderB: match.b.placeholder,
    result: match.result,
    winnerId: match.winnerId,
    playable: groupStageComplete && match.a.teamId !== null && match.b.teamId !== null,
    minutesFromStart: minutes(match.slot ?? 0, true),
  });
  const schedule: MatchView[] = [
    ...[...draw.matches]
      .sort((x, y) => x.slot - y.slot || x.table - y.table)
      .map(groupView),
    ...bracketMatches(bracket).map(knockoutView),
  ];

  const tables: TableView[] = settings.tableNames.map((name, index) => {
    const open = schedule.filter((match) => match.table === index && !match.result);
    const current = open[0]?.playable ? open[0] : null;
    return { index, name, current, next: (current ? open[1] : open[0]) ?? null };
  });

  const playedTotal = schedule.filter((match) => match.result).length;
  const phase: Phase = bracket.championId
    ? 'finished'
    : groupStageComplete
      ? 'knockout'
      : 'group';

  return {
    phase,
    teamNames,
    groups,
    groupStageComplete,
    seeds,
    seedsProvisional: !groupStageComplete,
    bracket,
    schedule,
    tables,
    progress: { played: playedTotal, total: schedule.length },
    durationMinutes: bracket.endSlot * settings.matchMinutes + settings.koBreakMinutes,
  };
}
