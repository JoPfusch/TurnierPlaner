import { describe, expect, it } from 'vitest';
import { buildGroupSchedule, createDraw, groupSizes, roundRobinRounds } from '../src/shared';

describe('roundRobinRounds', () => {
  it.each([2, 3, 4, 5, 6, 7])('pairs every team once with %i teams', (n) => {
    const ids = Array.from({ length: n }, (_, i) => `t${i}`);
    const rounds = roundRobinRounds(ids);
    const pairs = rounds.flat().map(([a, b]) => [a, b].sort().join('-'));
    expect(pairs).toHaveLength((n * (n - 1)) / 2);
    expect(new Set(pairs).size).toBe(pairs.length);
    for (const round of rounds) {
      const teams = round.flat();
      expect(new Set(teams).size).toBe(teams.length);
    }
  });
});

describe('group schedule', () => {
  it('splits teams into groups whose sizes differ by at most one', () => {
    expect(groupSizes(20, 4)).toEqual([5, 5, 5, 5]);
    expect(groupSizes(18, 4)).toEqual([5, 5, 4, 4]);
  });

  it.each([
    [20, 5, 3],
    [18, 4, 2],
    [7, 2, 4],
    [16, 4, 1],
  ])('%i teams, %i groups, %i tables: no clashes', (teams, groups, tables) => {
    const ids = Array.from({ length: teams }, (_, i) => `t${i}`);
    const draw = createDraw(ids, groups, tables, 7);
    const bySlot = new Map<number, typeof draw.matches>();
    for (const match of draw.matches) {
      expect(match.table).toBeGreaterThanOrEqual(0);
      expect(match.table).toBeLessThan(tables);
      bySlot.set(match.slot, [...(bySlot.get(match.slot) ?? []), match]);
    }
    for (const matches of bySlot.values()) {
      expect(matches.length).toBeLessThanOrEqual(tables);
      const busy = matches.flatMap((m) => [m.teamA, m.teamB]);
      expect(new Set(busy).size).toBe(busy.length);
      expect(new Set(matches.map((m) => m.table)).size).toBe(matches.length);
    }
    expect(new Set(draw.matches.map((m) => m.id)).size).toBe(draw.matches.length);
    expect(draw.matches).toHaveLength(
      groupSizes(teams, groups).reduce((sum, s) => sum + (s * (s - 1)) / 2, 0),
    );
  });

  it('is reproducible from the seed', () => {
    const ids = Array.from({ length: 12 }, (_, i) => `t${i}`);
    expect(createDraw(ids, 3, 2, 99)).toEqual(createDraw(ids, 3, 2, 99));
    expect(createDraw(ids, 3, 2, 99).groups).not.toEqual(createDraw(ids, 3, 2, 100).groups);
  });

  it('uses all tables when possible', () => {
    const groups = [
      { id: 'A', teamIds: ['a1', 'a2', 'a3', 'a4'] },
      { id: 'B', teamIds: ['b1', 'b2', 'b3', 'b4'] },
    ];
    const matches = buildGroupSchedule(groups, 4);
    expect(Math.max(...matches.map((m) => m.slot)) + 1).toBe(3);
  });
});
