import { describe, expect, it } from 'vitest';
import { applyCommand, deriveView, DomainError, initialState } from '../src/shared';
import { drawnTournament, playGroupStage, run } from './helpers';

describe('tournament flow', () => {
  it('manages teams in the setup phase', () => {
    let state = run(initialState(), { type: 'addTeams', names: ['Alpha', 'Beta', 'alpha ', 'Gamma'] });
    expect(state.teams.map((t) => t.name)).toEqual(['Alpha', 'Beta', 'Gamma']);
    state = run(state, { type: 'renameTeam', teamId: 't1', name: 'Omega' }, { type: 'removeTeam', teamId: 't2' });
    expect(state.teams.map((t) => t.name)).toEqual(['Omega', 'Gamma']);
    expect(() => applyCommand(state, { type: 'renameTeam', teamId: 't1', name: 'GAMMA' })).toThrow(DomainError);
    expect(state.revision).toBe(3);
  });

  it('refuses to draw an impossible format', () => {
    const state = run(initialState(), { type: 'addTeams', names: ['A', 'B', 'C'] });
    expect(() => applyCommand(state, { type: 'draw', seed: 1 })).toThrow(DomainError);
  });

  it('projects the bracket live during the group stage', () => {
    let state = drawnTournament(16, 4, 8);
    let view = deriveView(state);
    expect(view.phase).toBe('group');
    expect(view.bracket!.rounds[0]!.matches[0]!.a).toMatchObject({ teamId: null, placeholder: 'Setzplatz 1' });
    expect(view.tables.every((t) => t.current && t.next)).toBe(true);

    const first = state.draw!.matches[0]!;
    state = applyCommand(state, { type: 'setResult', matchId: first.id, scoreA: 4, scoreB: 0 });
    view = deriveView(state);
    expect(view.seedsProvisional).toBe(true);
    expect(view.seeds).toHaveLength(8);
    expect(view.seeds.map((s) => s.teamId)).toContain(first.teamA);
    expect(view.bracket!.rounds[0]!.matches.every((m) => m.a.teamId && m.b.teamId)).toBe(true);
    expect(() => applyCommand(state, { type: 'setResult', matchId: 'ko-0-0', scoreA: 1, scoreB: 0 })).toThrow(/Gruppenspiele/);
  });

  it('plays a complete tournament', () => {
    let state = playGroupStage(drawnTournament(20, 5, 8, 3));
    let view = deriveView(state);
    expect(view.phase).toBe('knockout');
    expect(view.seedsProvisional).toBe(false);
    // five group winners plus the three best runners-up
    expect(view.seeds.map((s) => s.groupRank)).toEqual([1, 1, 1, 1, 1, 2, 2, 2]);
    const bubble = view.groups.flatMap((g) => g.rows).filter((r) => r.status === 'bubble');
    expect(bubble).toHaveLength(2);
    expect(bubble.every((r) => r.rank === 2)).toBe(true);
    // no first-round rematch of a group
    for (const match of view.bracket!.rounds[0]!.matches) {
      const group = (id: string | null) => view.seeds.find((s) => s.teamId === id)?.groupId;
      expect(group(match.a.teamId)).not.toBe(group(match.b.teamId));
    }

    for (let guard = 0; guard < 20 && deriveView(state).phase !== 'finished'; guard++) {
      const open = deriveView(state).schedule.find((m) => m.playable && !m.result)!;
      state = applyCommand(state, { type: 'setResult', matchId: open.id, scoreA: 2, scoreB: 0 });
    }
    view = deriveView(state);
    expect(view.phase).toBe('finished');
    expect(view.progress).toEqual({ played: 38, total: 38 });
    expect(new Set([view.bracket!.championId, view.bracket!.runnerUpId, view.bracket!.thirdId]).size).toBe(3);
    expect(view.tables.every((t) => t.current === null && t.next === null)).toBe(true);
  });

  it('invalidates later knockout results when a winner changes', () => {
    let state = playGroupStage(drawnTournament(8, 2, 4));
    state = run(
      state,
      { type: 'setResult', matchId: 'ko-0-0', scoreA: 2, scoreB: 0 },
      { type: 'setResult', matchId: 'ko-0-1', scoreA: 2, scoreB: 0 },
      { type: 'setResult', matchId: 'ko-1-0', scoreA: 2, scoreB: 0 },
      { type: 'setResult', matchId: 'ko-third', scoreA: 2, scoreB: 0 },
    );
    expect(deriveView(state).phase).toBe('finished');
    // same winner, different cups: everything stays
    state = applyCommand(state, { type: 'setResult', matchId: 'ko-0-0', scoreA: 5, scoreB: 0 });
    expect(deriveView(state).phase).toBe('finished');
    // other winner: final and third-place match are reset
    state = applyCommand(state, { type: 'setResult', matchId: 'ko-0-0', scoreA: 0, scoreB: 1 });
    expect(Object.keys(state.results).filter((id) => id.startsWith('ko-')).sort()).toEqual(['ko-0-0', 'ko-0-1']);
  });

  it('protects knockout results against group corrections that change the qualifiers', () => {
    let state = playGroupStage(drawnTournament(8, 2, 4));
    state = applyCommand(state, { type: 'setResult', matchId: 'ko-0-0', scoreA: 2, scoreB: 0 });
    const match = state.draw!.matches[0]!;
    expect(() => applyCommand(state, { type: 'clearResult', matchId: match.id })).toThrow(/KO-Phase zurücksetzen/);
    expect(() => applyCommand(state, { type: 'updateSettings', patch: { koSize: 2 } })).toThrow(DomainError);
    state = run(state, { type: 'resetKnockout' }, { type: 'clearResult', matchId: match.id });
    expect(deriveView(state).phase).toBe('group');
  });

  it('locks the structure after the draw but allows cosmetic changes', () => {
    const state = drawnTournament(8, 2, 4);
    expect(() => applyCommand(state, { type: 'updateSettings', patch: { groupCount: 4 } })).toThrow(DomainError);
    expect(() => applyCommand(state, { type: 'updateSettings', patch: { tableNames: ['A'] } })).toThrow(DomainError);
    expect(() => applyCommand(state, { type: 'addTeams', names: ['Neu'] })).toThrow(DomainError);
    const renamed = run(state, { type: 'updateSettings', patch: { tableNames: ['Keller', 'Garten'], koSize: 2 } });
    expect(deriveView(renamed).tables.map((t) => t.name)).toEqual(['Keller', 'Garten']);
    expect(deriveView(renamed).seeds).toHaveLength(2);
    expect(run(state, { type: 'discardDraw' }).draw).toBeNull();
  });

  it('rejects draws and too many cups', () => {
    const state = drawnTournament(8, 2, 4);
    const id = state.draw!.matches[0]!.id;
    expect(() => applyCommand(state, { type: 'setResult', matchId: id, scoreA: 1, scoreB: 1 })).toThrow(DomainError);
    expect(() => applyCommand(state, { type: 'setResult', matchId: id, scoreA: 11, scoreB: 0 })).toThrow(DomainError);
  });
});
