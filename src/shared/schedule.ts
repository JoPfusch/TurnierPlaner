import { createRng, shuffle } from './random';
import type { Draw, Group, GroupMatch, TeamId } from './types';

/** `A`..`Z` – group ids double as display names ("Gruppe A"). */
export function groupId(index: number): string {
  return String.fromCharCode(65 + index);
}

/** Sizes of `groupCount` groups for `teamCount` teams; sizes differ by at most one. */
export function groupSizes(teamCount: number, groupCount: number): number[] {
  const base = Math.floor(teamCount / groupCount);
  const rest = teamCount % groupCount;
  return Array.from({ length: groupCount }, (_, i) => base + (i < rest ? 1 : 0));
}

/**
 * Round-robin pairings via the circle method. Every team meets every other
 * team exactly once; within one round no team plays twice.
 */
export function roundRobinRounds(teamIds: readonly TeamId[]): Array<Array<[TeamId, TeamId]>> {
  const ring: Array<TeamId | null> = [...teamIds];
  if (ring.length % 2 === 1) ring.push(null); // odd group size: one team rests per round
  const n = ring.length;
  const rounds: Array<Array<[TeamId, TeamId]>> = [];
  for (let round = 0; round < n - 1; round++) {
    const pairs: Array<[TeamId, TeamId]> = [];
    for (let i = 0; i < n / 2; i++) {
      const a = ring[i];
      const b = ring[n - 1 - i];
      if (a != null && b != null) pairs.push(round % 2 === 0 ? [a, b] : [b, a]);
    }
    rounds.push(pairs);
    // rotate everything except the first entry
    ring.splice(1, 0, ring.pop() as TeamId | null);
  }
  return rounds;
}

/**
 * Distributes all group matches over time slots and tables.
 *
 * A slot holds at most `tableCount` matches and never the same team twice.
 * Groups are served in rotating order so that all groups progress evenly,
 * and inside a group the round-robin order is kept whenever possible.
 */
export function buildGroupSchedule(groups: readonly Group[], tableCount: number): GroupMatch[] {
  interface Pending {
    groupId: string;
    round: number;
    teamA: TeamId;
    teamB: TeamId;
  }
  const queues: Pending[][] = groups.map((group) =>
    roundRobinRounds(group.teamIds).flatMap((pairs, round) =>
      pairs.map(([teamA, teamB]) => ({ groupId: group.id, round, teamA, teamB })),
    ),
  );
  const counters = new Map<string, number>();
  const matches: GroupMatch[] = [];
  let remaining = queues.reduce((sum, queue) => sum + queue.length, 0);

  for (let slot = 0; remaining > 0; slot++) {
    const busy = new Set<TeamId>();
    const picked: Pending[] = [];
    let progress = true;
    while (picked.length < tableCount && progress) {
      progress = false;
      for (let offset = 0; offset < queues.length && picked.length < tableCount; offset++) {
        const queue = queues[(slot + offset) % queues.length] as Pending[];
        const index = queue.findIndex((m) => !busy.has(m.teamA) && !busy.has(m.teamB));
        if (index < 0) continue;
        const [match] = queue.splice(index, 1) as [Pending];
        busy.add(match.teamA).add(match.teamB);
        picked.push(match);
        progress = true;
      }
    }
    picked.forEach((match, index) => {
      const number = (counters.get(match.groupId) ?? 0) + 1;
      counters.set(match.groupId, number);
      matches.push({
        id: `g-${match.groupId}-${number}`,
        ...match,
        slot,
        // rotate the starting table so groups do not always play at the same venue
        table: (index + slot) % tableCount,
      });
    });
    remaining -= picked.length;
  }
  return matches;
}

/** Number of time slots the group stage needs. */
export function groupSlotCount(matches: readonly GroupMatch[]): number {
  return matches.reduce((max, match) => Math.max(max, match.slot + 1), 0);
}

/**
 * Random draw: shuffles the teams into groups, assigns the lots used as last
 * tie-breaker and creates the complete group schedule.
 */
export function createDraw(
  teamIds: readonly TeamId[],
  groupCount: number,
  tableCount: number,
  seed: number,
): Draw {
  const rng = createRng(seed);
  const shuffled = shuffle(teamIds, rng);
  const groups: Group[] = Array.from({ length: groupCount }, (_, i) => ({
    id: groupId(i),
    teamIds: [],
  }));
  shuffled.forEach((teamId, index) => {
    (groups[index % groupCount] as Group).teamIds.push(teamId);
  });
  const lots: Record<TeamId, number> = {};
  shuffle(teamIds, rng).forEach((teamId, index) => {
    lots[teamId] = index + 1;
  });
  return { seed, groups, matches: buildGroupSchedule(groups, tableCount), lots };
}

/**
 * Checks whether two group matches may exchange their places (round and
 * table). Returns the reason if not, `null` if the swap is allowed.
 *
 * Rules: both matches are open (no result) and after the swap no team plays
 * twice in the same round.
 */
export function swapProblem(
  matches: readonly GroupMatch[],
  playedIds: ReadonlySet<string>,
  matchA: string,
  matchB: string,
): string | null {
  const a = matches.find((match) => match.id === matchA);
  const b = matches.find((match) => match.id === matchB);
  if (!a || !b) return 'Nur Gruppenspiele können getauscht werden.';
  if (a.id === b.id) return 'Ein Spiel kann nicht mit sich selbst getauscht werden.';
  if (playedIds.has(a.id) || playedIds.has(b.id)) {
    return 'Gespielte Spiele können nicht verschoben werden.';
  }
  if (a.slot === b.slot) return null; // same round: only the tables change
  const clash = (moving: GroupMatch, slot: number, leaving: GroupMatch): boolean =>
    matches.some(
      (other) =>
        other.slot === slot &&
        other.id !== leaving.id &&
        [other.teamA, other.teamB].some((team) => team === moving.teamA || team === moving.teamB),
    );
  if (clash(a, b.slot, b) || clash(b, a.slot, a)) {
    return 'Dann würde ein Team in derselben Runde zweimal spielen.';
  }
  return null;
}

/** The matches with the places of `matchA` and `matchB` exchanged. */
export function swapMatches(matches: readonly GroupMatch[], matchA: string, matchB: string): GroupMatch[] {
  const a = matches.find((match) => match.id === matchA);
  const b = matches.find((match) => match.id === matchB);
  if (!a || !b) return [...matches];
  return matches.map((match) => {
    if (match.id === a.id) return { ...match, slot: b.slot, table: b.table };
    if (match.id === b.id) return { ...match, slot: a.slot, table: a.table };
    return match;
  });
}
