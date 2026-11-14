import { describe, expect, it } from 'vitest';
import { computeStats, rankTeams, type PlayedMatch } from '../src/shared';

const settings = { pointsWin: 3, pointsLoss: 0 };
const lots = { a: 1, b: 2, c: 3, d: 4 };
const order = (matches: PlayedMatch[], criteria: Parameters<typeof rankTeams>[2]['criteria']) => {
  const ids = ['a', 'b', 'c', 'd'];
  return rankTeams(ids, computeStats(ids, matches, settings), { criteria, settings, lots, matches });
};
const win = (winner: string, loser: string, cups: number): PlayedMatch => ({
  teamA: winner,
  teamB: loser,
  scoreA: cups,
  scoreB: 0,
});

describe('standings', () => {
  it('books points and cups', () => {
    const stats = computeStats(['a', 'b'], [win('a', 'b', 4)], settings);
    expect(stats.get('a')).toMatchObject({ played: 1, wins: 1, points: 3, cupsFor: 4, cupDiff: 4 });
    expect(stats.get('b')).toMatchObject({ played: 1, losses: 1, points: 0, cupsAgainst: 4, cupDiff: -4 });
  });

  it('uses the cup difference to break a tie on points', () => {
    const matches = [win('a', 'c', 1), win('b', 'd', 5)];
    expect(order(matches, ['points', 'cupDiff']).map((e) => e.teamId)).toEqual(['b', 'a', 'c', 'd']);
  });

  it('respects the priority order of the criteria', () => {
    // a and b both have one win; b has more cups, but a beat b directly
    const matches = [win('a', 'b', 1), win('b', 'c', 6), win('c', 'a', 1)];
    expect(order(matches, ['points', 'cupDiff', 'headToHead'])[0]?.teamId).toBe('b');
    expect(order(matches.slice(0, 2), ['points', 'headToHead', 'cupDiff'])[0]?.teamId).toBe('a');
  });

  it('evaluates the direct comparison only among the tied teams', () => {
    // a, b, c all 6 points; among them a beat b, b beat c, c beat a -> stays tied, next criterion decides
    const matches = [
      win('a', 'b', 1), win('b', 'c', 1), win('c', 'a', 1),
      win('a', 'd', 2), win('b', 'd', 5), win('c', 'd', 3),
    ];
    const ranked = order(matches, ['points', 'headToHead', 'cupsFor']);
    expect(ranked.map((e) => e.teamId)).toEqual(['b', 'c', 'a', 'd']);
    expect(ranked.every((e) => !e.decidedByLot)).toBe(true);
  });

  it('falls back to the lot and flags it', () => {
    const ranked = order([win('a', 'b', 2), win('d', 'c', 2)], ['points', 'cupDiff']);
    expect(ranked.map((e) => e.teamId)).toEqual(['a', 'd', 'b', 'c']);
    expect(ranked.every((e) => e.decidedByLot)).toBe(true);
  });

  it('can compare per game', () => {
    const ids = ['a', 'b'];
    const stats = computeStats(['a', 'b', 'x', 'y', 'z'], [win('a', 'x', 2), win('a', 'y', 2), win('z', 'a', 1), win('b', 'x', 3), win('b', 'y', 3)], settings);
    const opts = { criteria: ['points', 'cupDiff'] as const, settings, lots };
    expect(rankTeams(ids, stats, opts)[0]?.teamId).toBe('b'); // equal points, better diff
    expect(rankTeams(ids, stats, { ...opts, perGame: true })[0]?.teamId).toBe('b'); // 3.0 vs 2.0 points per game
  });
});
