import { describe, expect, it } from 'vitest';
import { analyzeFormat, listFormatOptions, suggestedKoSizes, validateFormat } from '../src/shared';

const base = { tableCount: 2, thirdPlaceMatch: true, matchMinutes: 15, koBreakMinutes: 0 };

describe('format planning', () => {
  it('16 teams, 4 groups, quarter-finals is a clean format', () => {
    const a = analyzeFormat({ ...base, teamCount: 16, groupCount: 4, koSize: 8 });
    expect(a).toMatchObject({ groupMatches: 24, koMatches: 8, totalMatches: 32, clean: true, byes: 0 });
    expect(a.rule).toEqual({ directPerGroup: 2, bestOfNext: 0 });
    expect(a.groupSlots).toBe(12);
    expect(a.koSlots).toBe(2 + 1 + 1 + 1);
    expect(a.durationMinutes).toBe(17 * 15);
  });

  it('20 teams straight into quarter-finals: 4 groups of 5 or 5 groups of 4', () => {
    const four = analyzeFormat({ ...base, teamCount: 20, groupCount: 4, koSize: 8 });
    expect(four).toMatchObject({ groupMatches: 40, totalMatches: 48, clean: true, additionalCriteria: 1 });

    const five = analyzeFormat({ ...base, teamCount: 20, groupCount: 5, koSize: 8 });
    expect(five.rule).toEqual({ directPerGroup: 1, bestOfNext: 3 });
    expect(five).toMatchObject({ groupMatches: 30, totalMatches: 38, clean: false, additionalCriteria: 2 });
    expect(five.recommendedCriteria).toContain('cupsFor');
    expect(five.notes.join(' ')).toContain('3 besten Gruppen-2.');
  });

  it('flags unequal group sizes and byes', () => {
    const a = analyzeFormat({ ...base, teamCount: 18, groupCount: 4, koSize: 6 });
    expect(a.groupSizes).toEqual([5, 5, 4, 4]);
    expect(a.byes).toBe(2);
    expect(a.notes.join(' ')).toMatch(/Quotient/);
    expect(a.notes.join(' ')).toMatch(/2 Freilose/);
  });

  it('rejects impossible formats', () => {
    expect(validateFormat(1, 1, 2)).not.toEqual([]);
    expect(validateFormat(8, 5, 4)).not.toEqual([]); // groups of one
    expect(validateFormat(8, 2, 16)).not.toEqual([]); // more KO places than teams
    expect(validateFormat(8, 4, 8)).toEqual([]); // everybody advances
    expect(validateFormat(10, 4, 10)).not.toEqual([]); // 3 per group needed, smallest group has 2
  });

  it('lists options and knockout sizes', () => {
    expect(suggestedKoSizes(20)).toEqual([2, 4, 8, 16]);
    const options = listFormatOptions({ ...base, teamCount: 20, koSize: 8 });
    expect(options.map((o) => o.groupCount)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(options.filter((o) => o.clean).map((o) => o.groupCount)).toEqual([1, 2, 4]);
  });
});
