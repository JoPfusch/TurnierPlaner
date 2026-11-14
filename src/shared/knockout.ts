import type { Seed } from './qualification';
import type { MatchId, Result, TeamId } from './types';

/** One side of a knockout match. */
export interface BracketSlot {
  /** `null` while the participant is not known yet. */
  teamId: TeamId | null;
  /** Seeding position of the team, if known. */
  seed: number | null;
  /** Text shown while `teamId` is unknown, e.g. "Sieger VF 1". */
  placeholder: string;
}

export interface BracketMatch {
  id: MatchId;
  round: number;
  index: number;
  /** Short label such as "VF 1" or "Finale". */
  label: string;
  a: BracketSlot;
  b: BracketSlot;
  result: Result | null;
  winnerId: TeamId | null;
  loserId: TeamId | null;
  /** First-round match with only one participant – that team advances without playing. */
  isBye: boolean;
  /** Global time slot and table; `null` for byes. */
  slot: number | null;
  table: number | null;
}

export interface BracketRound {
  name: string;
  short: string;
  matches: BracketMatch[];
}

export interface Bracket {
  rounds: BracketRound[];
  thirdPlace: BracketMatch | null;
  championId: TeamId | null;
  runnerUpId: TeamId | null;
  thirdId: TeamId | null;
  /** First slot after the last knockout match. */
  endSlot: number;
}

export const THIRD_PLACE_ID = 'ko-third';

export function koMatchId(round: number, index: number): MatchId {
  return `ko-${round}-${index}`;
}

/** Smallest power of two that fits `koSize` teams. */
export function bracketSize(koSize: number): number {
  let size = 2;
  while (size < koSize) size *= 2;
  return size;
}

/**
 * Seed numbers in bracket order, e.g. `[1, 8, 4, 5, 2, 7, 3, 6]` for eight.
 * Guarantees that seed 1 and 2 can only meet in the final, 1-4 only in the
 * semi-finals and so on.
 */
export function seedOrder(size: number): number[] {
  let order = [1, 2];
  while (order.length < size) {
    const next = order.length * 2 + 1;
    order = order.flatMap((seed) => [seed, next - seed]);
  }
  return order;
}

export function roundName(matchCount: number): { name: string; short: string } {
  switch (matchCount) {
    case 1:
      return { name: 'Finale', short: 'F' };
    case 2:
      return { name: 'Halbfinale', short: 'HF' };
    case 4:
      return { name: 'Viertelfinale', short: 'VF' };
    case 8:
      return { name: 'Achtelfinale', short: 'AF' };
    default:
      return { name: `Runde der letzten ${matchCount * 2}`, short: `R${matchCount * 2}` };
  }
}

/** A third-place match needs two real semi-finals, i.e. at least four qualifiers. */
export function hasThirdPlaceMatch(koSize: number, enabled: boolean): boolean {
  return enabled && koSize >= 4;
}

/**
 * Pairs the seeds for the first round. The standard pairing is
 * "best against worst" (1 vs N, 2 vs N-1, ...). If that would lead to a
 * rematch of two teams from the same group, the lower seeds are swapped
 * with the smallest possible deviation from the standard pairing.
 *
 * Returns the opponent seed number for every top seed (`null` = bye).
 */
export function pairFirstRound(seeds: readonly Seed[], size: number): Map<number, number | null> {
  const bySeed = new Map(seeds.map((seed) => [seed.seed, seed]));
  const pairing = new Map<number, number | null>();
  const contested: number[] = [];
  for (let top = 1; top <= size / 2; top++) {
    const ideal = size + 1 - top;
    if (bySeed.has(ideal)) contested.push(top);
    pairing.set(top, bySeed.has(ideal) ? ideal : null);
  }
  const lows = contested.map((top) => size + 1 - top);

  let best: number[] | null = null;
  let bestCost = Number.POSITIVE_INFINITY;
  let budget = 50_000; // safety net; real brackets need a few dozen steps
  const current: number[] = [];
  const used = new Set<number>();
  const search = (index: number, cost: number): void => {
    if (cost >= bestCost || budget-- <= 0) return;
    const top = contested[index];
    if (top === undefined) {
      best = [...current];
      bestCost = cost;
      return;
    }
    const ideal = size + 1 - top;
    const topGroup = bySeed.get(top)?.groupId;
    const candidates = lows
      .filter((low) => !used.has(low) && bySeed.get(low)?.groupId !== topGroup)
      .sort((x, y) => Math.abs(x - ideal) - Math.abs(y - ideal));
    for (const low of candidates) {
      used.add(low);
      current.push(low);
      search(index + 1, cost + Math.abs(low - ideal));
      current.pop();
      used.delete(low);
    }
  };
  search(0, 0);

  const solution = best as number[] | null;
  if (solution) contested.forEach((top, index) => pairing.set(top, solution[index] ?? null));
  return pairing;
}

export interface BracketOptions {
  seeds: readonly Seed[];
  koSize: number;
  results: Readonly<Record<MatchId, Result>>;
  /** Fill in team names. `false` shows "Setzplatz n" placeholders instead. */
  resolveTeams: boolean;
  /** Evaluate entered knockout results (only once the group stage is complete). */
  honourResults: boolean;
  thirdPlaceMatch: boolean;
  tableCount: number;
  /** First time slot of the knockout stage. */
  firstSlot: number;
}

/**
 * Builds the complete knockout tree from the seeding list and the knockout
 * results entered so far. Pure and cheap, so it is simply recomputed after
 * every change – that is what makes the bracket "live".
 */
export function buildBracket(options: BracketOptions): Bracket {
  const { seeds, koSize, results, resolveTeams, honourResults, tableCount } = options;
  const size = bracketSize(koSize);
  const bySeed = new Map(seeds.map((seed) => [seed.seed, seed]));
  const pairing = pairFirstRound(seeds, size);

  const seedSlot = (seed: number | null): BracketSlot | null => {
    if (seed === null || seed > koSize) return null;
    const entry = bySeed.get(seed);
    return {
      teamId: resolveTeams ? (entry?.teamId ?? null) : null,
      seed,
      placeholder: `Setzplatz ${seed}`,
    };
  };
  const seedOfTeam = (teamId: TeamId): number | null =>
    seeds.find((seed) => seed.teamId === teamId)?.seed ?? null;
  const emptySlot: BracketSlot = { teamId: null, seed: null, placeholder: 'Freilos' };

  const decide = (match: BracketMatch): void => {
    const result = results[match.id];
    if (!honourResults || !result || !match.a.teamId || !match.b.teamId) return;
    if (result.scoreA === result.scoreB) return;
    const aWins = result.scoreA > result.scoreB;
    match.result = result;
    match.winnerId = aWins ? match.a.teamId : match.b.teamId;
    match.loserId = aWins ? match.b.teamId : match.a.teamId;
  };

  const rounds: BracketRound[] = [];
  const order = seedOrder(size);
  for (let round = 0, count = size / 2; count >= 1; round++, count /= 2) {
    const { name, short } = roundName(count);
    const previous = rounds[round - 1];
    const matches: BracketMatch[] = [];
    for (let index = 0; index < count; index++) {
      let a: BracketSlot | null;
      let b: BracketSlot | null;
      if (!previous) {
        const first = order[index * 2] as number;
        const second = order[index * 2 + 1] as number;
        const top = Math.min(first, second);
        const low = pairing.get(top) ?? null;
        a = seedSlot(first === top ? top : low);
        b = seedSlot(first === top ? low : top);
      } else {
        a = advance(previous.matches[index * 2] as BracketMatch, seedOfTeam);
        b = advance(previous.matches[index * 2 + 1] as BracketMatch, seedOfTeam);
      }
      const isBye = !previous && (a === null || b === null);
      const match: BracketMatch = {
        id: koMatchId(round, index),
        round,
        index,
        label: count === 1 ? 'Finale' : `${short} ${index + 1}`,
        a: a ?? emptySlot,
        b: b ?? emptySlot,
        result: null,
        winnerId: null,
        loserId: null,
        isBye,
        slot: null,
        table: null,
      };
      if (!isBye) decide(match);
      matches.push(match);
    }
    rounds.push({ name, short, matches });
  }

  const final = (rounds[rounds.length - 1] as BracketRound).matches[0] as BracketMatch;
  let thirdPlace: BracketMatch | null = null;
  if (hasThirdPlaceMatch(koSize, options.thirdPlaceMatch)) {
    const semis = (rounds[rounds.length - 2] as BracketRound).matches;
    const loserSlot = (semi: BracketMatch): BracketSlot => ({
      teamId: semi.loserId,
      seed: semi.loserId ? seedOfTeam(semi.loserId) : null,
      placeholder: `Verlierer ${semi.label}`,
    });
    thirdPlace = {
      id: THIRD_PLACE_ID,
      round: rounds.length - 1,
      index: 1,
      label: 'Spiel um Platz 3',
      a: loserSlot(semis[0] as BracketMatch),
      b: loserSlot(semis[1] as BracketMatch),
      result: null,
      winnerId: null,
      loserId: null,
      isBye: false,
      slot: null,
      table: null,
    };
    decide(thirdPlace);
  }

  // Time slots: every round fills the tables; the match for third place and
  // the final each get a slot of their own so everybody can watch.
  let slot = options.firstSlot;
  for (const round of rounds.slice(0, -1)) {
    const playable = round.matches.filter((match) => !match.isBye);
    playable.forEach((match, index) => {
      match.slot = slot + Math.floor(index / tableCount);
      match.table = index % tableCount;
    });
    slot += Math.ceil(playable.length / tableCount);
  }
  if (thirdPlace) {
    thirdPlace.slot = slot++;
    thirdPlace.table = 0;
  }
  final.slot = slot++;
  final.table = 0;

  return {
    rounds,
    thirdPlace,
    championId: final.winnerId,
    runnerUpId: final.loserId,
    thirdId: thirdPlace?.winnerId ?? null,
    endSlot: slot,
  };
}

/** The slot of the next round that is fed by `match`. */
function advance(
  match: BracketMatch,
  seedOfTeam: (teamId: TeamId) => number | null,
): BracketSlot {
  if (match.isBye) return match.a.seed !== null ? match.a : match.b;
  if (match.winnerId) {
    return { teamId: match.winnerId, seed: seedOfTeam(match.winnerId), placeholder: '' };
  }
  return { teamId: null, seed: null, placeholder: `Sieger ${match.label}` };
}

/** All matches of the bracket in playing order (byes excluded). */
export function bracketMatches(bracket: Bracket): BracketMatch[] {
  const matches = bracket.rounds.flatMap((round) => round.matches.filter((m) => !m.isBye));
  if (bracket.thirdPlace) matches.push(bracket.thirdPlace);
  return matches.sort((x, y) => (x.slot ?? 0) - (y.slot ?? 0) || (x.table ?? 0) - (y.table ?? 0));
}

/**
 * Ids of the matches whose participants depend on the outcome of `matchId`.
 * Their results become invalid when that outcome changes.
 */
export function dependentMatchIds(bracket: Bracket, matchId: MatchId): MatchId[] {
  const dependents: MatchId[] = [];
  const roundCount = bracket.rounds.length;
  for (const round of bracket.rounds) {
    const match = round.matches.find((m) => m.id === matchId);
    if (!match) continue;
    if (match.round === roundCount - 2 && bracket.thirdPlace) dependents.push(THIRD_PLACE_ID);
    let index = match.index;
    for (let next = match.round + 1; next < roundCount; next++) {
      index = Math.floor(index / 2);
      dependents.push(koMatchId(next, index));
    }
  }
  return dependents;
}
