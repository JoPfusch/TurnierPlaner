import { describe, expect, it } from 'vitest';
import { applyCommand, deriveView, DomainError, hasDueProposals, initialState, parseState } from '../src/shared';
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

describe('results reported by teams', () => {
  const setup = (patch = {}) => {
    const state = run(drawnTournament(8, 2, 4), { type: 'updateSettings', patch });
    const match = state.draw!.matches[0]!;
    const report = { type: 'proposeResult', matchId: match.id, teamId: match.teamA, scoreA: 3, scoreB: 0, at: 1000 } as const;
    return { state, match, report };
  };

  it('counts only after the opponent confirmed', () => {
    const { state, match, report } = setup();
    let next = applyCommand(state, report);
    let view = deriveView(next);
    expect(next.results[match.id]).toBeUndefined();
    expect(view.pendingProposals).toBe(1);
    expect(view.groups.flatMap((g) => g.rows).every((r) => r.played === 0)).toBe(true);
    // the table moves on to its next match while the confirmation is pending
    expect(view.tables[match.table]!.current!.id).not.toBe(match.id);

    expect(() => applyCommand(next, { type: 'confirmProposal', matchId: match.id, teamId: match.teamA })).toThrow(DomainError);
    expect(() => applyCommand(next, { type: 'confirmProposal', matchId: match.id, teamId: 'nobody' })).toThrow(DomainError);
    next = applyCommand(next, { type: 'confirmProposal', matchId: match.id, teamId: match.teamB });
    expect(next.results[match.id]).toEqual({ scoreA: 3, scoreB: 0 });
    expect(next.proposals).toEqual({});
  });

  it('treats an identical report of the opponent as confirmation and a different one as dispute', () => {
    const { state, match, report } = setup();
    const agreed = run(state, report, { ...report, teamId: match.teamB });
    expect(agreed.results[match.id]).toEqual({ scoreA: 3, scoreB: 0 });

    const disputed = run(state, report, { ...report, teamId: match.teamB, scoreA: 0, scoreB: 2 });
    expect(disputed.results[match.id]).toBeUndefined();
    expect(disputed.proposals[match.id]).toMatchObject({ byTeamId: match.teamA, disputed: true });
    expect(run(disputed, { type: 'acceptProposal', matchId: match.id }).results[match.id]).toEqual({ scoreA: 3, scoreB: 0 });
    expect(run(disputed, { type: 'rejectProposal', matchId: match.id }).proposals).toEqual({});
  });

  it('lets the reporting team correct or withdraw and only participants report', () => {
    const { state, match, report } = setup();
    const corrected = run(state, report, { ...report, scoreA: 5 });
    expect(corrected.proposals[match.id]!.scoreA).toBe(5);
    expect(run(corrected, { type: 'withdrawProposal', matchId: match.id, teamId: match.teamA }).proposals).toEqual({});
    expect(() => applyCommand(state, { ...report, teamId: 'other' })).toThrow(/spielt in diesem Spiel nicht/);
    expect(() => applyCommand(state, { ...report, matchId: 'ko-0-0' })).toThrow(DomainError);
    const off = run(state, { type: 'updateSettings', patch: { teamReporting: false } });
    expect(() => applyCommand(off, report)).toThrow(/ausgeschaltet/);
  });

  it('accepts unanswered reports after the configured time, but not disputed ones', () => {
    const { state, match, report } = setup({ confirmation: 'timeout', autoConfirmMinutes: 5 });
    const reported = applyCommand(state, report);
    expect(hasDueProposals(reported, 1000 + 4 * 60_000)).toBe(false);
    expect(hasDueProposals(reported, 1000 + 5 * 60_000)).toBe(true);
    const expired = applyCommand(reported, { type: 'expireProposals', now: 1000 + 5 * 60_000 });
    expect(expired.results[match.id]).toEqual({ scoreA: 3, scoreB: 0 });

    const disputed = applyCommand(reported, { type: 'disputeProposal', matchId: match.id, teamId: match.teamB });
    expect(hasDueProposals(disputed, 1e12)).toBe(false);
    expect(hasDueProposals(applyCommand(setup().state, report), 1e12)).toBe(false); // mode "opponent"
  });

  it('requires the organiser in admin mode', () => {
    const { state, match, report } = setup({ confirmation: 'admin' });
    const reported = run(state, report, { ...report, teamId: match.teamB });
    expect(reported.results[match.id]).toBeUndefined();
    expect(() => applyCommand(reported, { type: 'confirmProposal', matchId: match.id, teamId: match.teamB })).toThrow(/Turnierleitung/);
    expect(run(reported, { type: 'acceptProposal', matchId: match.id }).results[match.id]).toBeDefined();
  });

  it('drops a report when the organiser enters the result or the pairing changes', () => {
    const { state, match, report } = setup();
    const entered = run(state, report, { type: 'setResult', matchId: match.id, scoreA: 0, scoreB: 1 });
    expect(entered.proposals).toEqual({});

    let ko = playGroupStage(drawnTournament(8, 2, 4));
    ko = run(ko, { type: 'setResult', matchId: 'ko-0-0', scoreA: 2, scoreB: 0 }, { type: 'setResult', matchId: 'ko-0-1', scoreA: 2, scoreB: 0 });
    const finalist = deriveView(ko).bracket!.rounds[1]!.matches[0]!.a.teamId!;
    ko = applyCommand(ko, { type: 'proposeResult', matchId: 'ko-1-0', teamId: finalist, scoreA: 1, scoreB: 0, at: 1 });
    expect(ko.proposals['ko-1-0']).toBeDefined();
    ko = applyCommand(ko, { type: 'setResult', matchId: 'ko-0-0', scoreA: 0, scoreB: 2 }); // other finalist
    expect(ko.proposals).toEqual({});
  });

  it('loads data files written before team reporting existed', () => {
    const { proposals: _p, settings, ...rest } = drawnTournament(8, 2, 4);
    const { teamReporting: _t, confirmation: _c, autoConfirmMinutes: _a, ...oldSettings } = settings;
    const loaded = parseState({ ...rest, settings: oldSettings });
    expect(loaded.proposals).toEqual({});
    expect(loaded.settings).toMatchObject({ teamReporting: true, confirmation: 'opponent', groupCount: 2 });
  });
});

describe('information for the teams', () => {
  it('keeps one table description per table', () => {
    let state = run(initialState(), { type: 'updateSettings', patch: { tableNames: ['A', 'B', 'C'], tableDescriptions: ['Garage'] } });
    expect(state.settings.tableDescriptions).toEqual(['Garage', '', '']);
    state = run(state, { type: 'updateSettings', patch: { tableNames: ['A'] } });
    expect(state.settings.tableDescriptions).toEqual(['Garage']);
  });

  it('can change rules and descriptions after the draw', () => {
    const state = run(drawnTournament(8, 2, 4), {
      type: 'updateSettings',
      patch: { rules: 'Ellbogen hinter die Kante', tableDescriptions: ['Keller', 'Garten'] },
    });
    expect(state.settings).toMatchObject({ rules: 'Ellbogen hinter die Kante', tableDescriptions: ['Keller', 'Garten'] });
  });

  it('loads data files without the new fields', () => {
    const { rules: _r, tableDescriptions: _t, venueMapVersion: _v, ...oldSettings } = initialState().settings;
    expect(parseState({ ...initialState(), settings: oldSettings }).settings).toMatchObject({ rules: '', tableDescriptions: [], venueMapVersion: null });
  });
});

describe('players', () => {
  it('stores up to two players per team, also after the draw', () => {
    let state = run(initialState(), {
      type: 'addTeams',
      names: ['Ohne Spieler', { name: 'Mit Spielern', players: ['Anna', ' ', 'Ben'] }],
    });
    expect(state.teams.map((t) => t.players)).toEqual([[], ['Anna', 'Ben']]);
    state = run(drawnTournament(8, 2, 4), { type: 'setPlayers', teamId: 't1', players: ['Chris', 'Dana'] });
    expect(state.teams[0]!.players).toEqual(['Chris', 'Dana']);
    expect(() => applyCommand(state, { type: 'setPlayers', teamId: 't1', players: ['a', 'b', 'c'] } as never)).toThrow();
  });
});

describe('moving group matches', () => {
  const slotOf = (state: ReturnType<typeof drawnTournament>, id: string) => state.draw!.matches.find((m) => m.id === id)!;

  it('exchanges round and table and keeps everything else', () => {
    let state = drawnTournament(12, 3, 4, 3);
    const first = state.draw!.matches.find((m) => m.slot === 0)!;
    state = applyCommand(state, { type: 'setResult', matchId: state.draw!.matches.find((m) => m.slot === 0 && m.id !== first.id)!.id, scoreA: 1, scoreB: 0 });
    const before = deriveView(state);
    // a later match that does not clash with round 0
    const busy = new Set(state.draw!.matches.filter((m) => m.slot === 0 && m.id !== first.id).flatMap((m) => [m.teamA, m.teamB]));
    const later = state.draw!.matches.find(
      (m) => m.slot > 0 && !busy.has(m.teamA) && !busy.has(m.teamB) &&
        !state.draw!.matches.some((o) => o.slot === m.slot && o.id !== m.id && [o.teamA, o.teamB].some((t) => t === first.teamA || t === first.teamB)),
    )!;
    const swapped = applyCommand(state, { type: 'swapMatches', matchA: first.id, matchB: later.id });
    expect(slotOf(swapped, first.id)).toMatchObject({ slot: later.slot, table: later.table });
    expect(slotOf(swapped, later.id)).toMatchObject({ slot: first.slot, table: first.table });
    // draw, pairings, results and standings are unchanged
    expect(swapped.draw!.groups).toEqual(state.draw!.groups);
    expect(swapped.results).toEqual(state.results);
    expect(swapped.draw!.matches.map((m) => [m.id, m.teamA, m.teamB])).toEqual(state.draw!.matches.map((m) => [m.id, m.teamA, m.teamB]));
    const after = deriveView(swapped);
    expect(after.groups).toEqual(before.groups);
    expect(after.bracket!.endSlot).toBe(before.bracket!.endSlot);
    // the table now plays the other match first
    expect(after.tables[first.table]!.current!.id).toBe(later.id);
    // swapping back restores the plan
    expect(applyCommand(swapped, { type: 'swapMatches', matchA: first.id, matchB: later.id }).draw).toEqual(state.draw);
  });

  it('refuses swaps that would let a team play twice in one round', () => {
    const state = drawnTournament(8, 2, 2);
    const a = state.draw!.matches.find((m) => m.slot === 0)!;
    // a match of the same team in another round, whose round also contains a match of a's opponent group
    const clash = state.draw!.matches.find(
      (m) => m.slot !== a.slot && state.draw!.matches.some((o) => o.slot === m.slot && o.id !== m.id && [o.teamA, o.teamB].some((t) => t === a.teamA || t === a.teamB)),
    )!;
    expect(() => applyCommand(state, { type: 'swapMatches', matchA: a.id, matchB: clash.id })).toThrow(/zweimal/);
  });

  it('refuses played matches and knockout matches', () => {
    let state = drawnTournament(8, 2, 4);
    const [a, b] = state.draw!.matches.filter((m) => m.slot === 0);
    state = applyCommand(state, { type: 'setResult', matchId: a!.id, scoreA: 1, scoreB: 0 });
    expect(() => applyCommand(state, { type: 'swapMatches', matchA: a!.id, matchB: b!.id })).toThrow(/Gespielte/);
    expect(() => applyCommand(state, { type: 'swapMatches', matchA: b!.id, matchB: 'ko-0-0' })).toThrow(/Gruppenspiele/);
  });

  it('loads data files of a running tournament written before players existed', () => {
    const running = playGroupStage(drawnTournament(8, 2, 4));
    const old = JSON.parse(JSON.stringify(running)) as { teams: Array<{ players?: string[] }> };
    for (const team of old.teams) delete team.players;
    const loaded = parseState(old);
    expect(loaded.teams.every((t) => Array.isArray(t.players) && t.players.length === 0)).toBe(true);
    expect(loaded.draw).toEqual(running.draw);
    expect(loaded.results).toEqual(running.results);
  });
});
