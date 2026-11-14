import { describe, expect, it } from 'vitest';
import {
  bracketSize,
  buildBracket,
  dependentMatchIds,
  pairFirstRound,
  seedOrder,
  type Seed,
} from '../src/shared';

const seeds = (groups: string[]): Seed[] =>
  groups.map((groupId, i) => ({ seed: i + 1, teamId: `s${i + 1}`, groupId, groupRank: 1 }));
const build = (list: Seed[], results = {}, thirdPlaceMatch = true) =>
  buildBracket({
    seeds: list,
    koSize: list.length,
    results,
    resolveTeams: true,
    honourResults: true,
    thirdPlaceMatch,
    tableCount: 2,
    firstSlot: 10,
  });

describe('bracket', () => {
  it('orders seeds so that the best meet as late as possible', () => {
    expect(seedOrder(4)).toEqual([1, 4, 2, 3]);
    expect(seedOrder(8)).toEqual([1, 8, 4, 5, 2, 7, 3, 6]);
    expect(bracketSize(6)).toBe(8);
  });

  it('pairs best against worst when groups allow it', () => {
    const pairing = pairFirstRound(seeds(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']), 8);
    expect([...pairing.entries()]).toEqual([[1, 8], [2, 7], [3, 6], [4, 5]]);
  });

  it('avoids first-round rematches of the same group', () => {
    // winners A B C D, runners-up D C B A would pair 1(A) vs 8(A)
    const list = seeds(['A', 'B', 'C', 'D', 'D', 'C', 'B', 'A']);
    const pairing = pairFirstRound(list, 8);
    for (const [top, low] of pairing) {
      expect(list[top - 1]?.groupId).not.toBe(list[(low as number) - 1]?.groupId);
    }
    expect(new Set(pairing.values()).size).toBe(4);
  });

  it('gives byes to the top seeds', () => {
    const bracket = build(seeds(['A', 'B', 'C', 'D', 'E', 'F']));
    const first = bracket.rounds[0]!.matches;
    expect(first.filter((m) => m.isBye)).toHaveLength(2);
    const semis = bracket.rounds[1]!.matches;
    expect(semis[0]!.a.teamId).toBe('s1');
    expect(semis[1]!.a.teamId).toBe('s2');
    expect(first.filter((m) => !m.isBye).every((m) => m.slot === 10)).toBe(true);
  });

  it('advances winners and determines the podium', () => {
    const results = {
      'ko-0-0': { scoreA: 3, scoreB: 0 }, // s1 beats s4
      'ko-0-1': { scoreA: 0, scoreB: 2 }, // s3 beats s2
      'ko-third': { scoreA: 1, scoreB: 0 },
      'ko-1-0': { scoreA: 0, scoreB: 1 },
    };
    const bracket = build(seeds(['A', 'B', 'C', 'D']), results);
    expect(bracket.rounds.map((r) => r.name)).toEqual(['Halbfinale', 'Finale']);
    expect(bracket.championId).toBe('s3');
    expect(bracket.runnerUpId).toBe('s1');
    expect(bracket.thirdId).toBe('s4');
    expect(bracket.thirdPlace!.slot).toBe(11);
    expect(bracket.rounds[1]!.matches[0]!.slot).toBe(12);
    expect(bracket.endSlot).toBe(13);
  });

  it('shows placeholders for undecided matches', () => {
    const bracket = build(seeds(['A', 'B', 'C', 'D']));
    const final = bracket.rounds[1]!.matches[0]!;
    expect(final.a).toMatchObject({ teamId: null, placeholder: 'Sieger HF 1' });
    expect(bracket.thirdPlace!.b.placeholder).toBe('Verlierer HF 2');
  });

  it('knows which matches depend on a result', () => {
    const bracket = build(seeds(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']));
    expect(dependentMatchIds(bracket, 'ko-0-3')).toEqual(['ko-1-1', 'ko-2-0']);
    expect(dependentMatchIds(bracket, 'ko-1-0')).toEqual(['ko-third', 'ko-2-0']);
    expect(dependentMatchIds(bracket, 'ko-2-0')).toEqual([]);
  });
});
