import { describe, expect, it } from 'vitest';
import { LIMITS, parseTeamList } from '../src/shared';

describe('pasted team lists', () => {
  it('reads names, players, tabs and number columns', () => {
    const { teams, errors } = parseTeamList(
      'Pong Pirates\r\nCup Killers; Anna ;Ben\n\n3\tHopfen & Malz\tChris\tDana\n  Nur Name ;  \n',
    );
    expect(errors).toEqual([]);
    expect(teams).toEqual([
      { name: 'Pong Pirates', players: [] },
      { name: 'Cup Killers', players: ['Anna', 'Ben'] },
      { name: 'Hopfen & Malz', players: ['Chris', 'Dana'] },
      { name: 'Nur Name', players: [] },
    ]);
  });

  it('keeps a team whose name is a number', () => {
    expect(parseTeamList('42').teams).toEqual([{ name: '42', players: [] }]);
  });

  it('names the line of a problem', () => {
    const long = 'x'.repeat(LIMITS.maxTeamNameLength + 1);
    const { errors } = parseTeamList(`Gut\n${long}\nDrei; a; b; c`);
    expect(errors[0]).toMatch(/^Zeile 2: Teamname hat/);
    expect(errors[1]).toMatch(/^Zeile 3: 3 Spieler/);
  });
});
