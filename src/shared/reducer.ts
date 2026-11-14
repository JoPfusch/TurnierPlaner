import type { Command } from './commands';
import { initialState, LIMITS } from './defaults';
import { DomainError } from './errors';
import { validateFormat } from './format';
import { dependentMatchIds } from './knockout';
import { createDraw } from './schedule';
import type { MatchId, Result, Settings, TournamentState } from './types';
import { deriveView } from './view';

/**
 * Applies a command to the state and returns the new state. Pure: the input
 * is never mutated, and all randomness comes from the seed in the command.
 * Throws a `DomainError` if the command breaks a tournament rule.
 */
export function applyCommand(state: TournamentState, command: Command): TournamentState {
  const next = reduce(state, command);
  return { ...next, revision: state.revision + 1 };
}

function reduce(state: TournamentState, command: Command): TournamentState {
  switch (command.type) {
    case 'addTeams': {
      requireSetup(state, 'Teams können nach der Auslosung nicht mehr hinzugefügt werden.');
      const taken = new Set(state.teams.map((team) => normalize(team.name)));
      const teams = [...state.teams];
      let nextTeamNumber = state.nextTeamNumber;
      for (const raw of command.names) {
        const name = raw.trim();
        if (taken.has(normalize(name))) continue; // silently skip duplicates of a bulk import
        taken.add(normalize(name));
        teams.push({ id: `t${nextTeamNumber++}`, name });
      }
      if (teams.length > LIMITS.maxTeams) {
        throw new DomainError(`Es sind höchstens ${LIMITS.maxTeams} Teams möglich.`);
      }
      return { ...state, teams, nextTeamNumber };
    }

    case 'renameTeam': {
      const name = command.name.trim();
      if (!state.teams.some((team) => team.id === command.teamId)) {
        throw new DomainError('Team nicht gefunden.');
      }
      if (state.teams.some((t) => t.id !== command.teamId && normalize(t.name) === normalize(name))) {
        throw new DomainError(`Es gibt bereits ein Team mit dem Namen „${name}“.`);
      }
      return {
        ...state,
        teams: state.teams.map((team) => (team.id === command.teamId ? { ...team, name } : team)),
      };
    }

    case 'removeTeam':
      requireSetup(state, 'Teams können nach der Auslosung nicht mehr entfernt werden.');
      return { ...state, teams: state.teams.filter((team) => team.id !== command.teamId) };

    case 'updateSettings':
      return updateSettings(state, command.patch);

    case 'draw': {
      requireSetup(state, 'Die Gruppen sind bereits ausgelost.');
      const { groupCount, koSize, tableNames } = state.settings;
      const issues = validateFormat(state.teams.length, groupCount, koSize);
      if (issues.length > 0) throw new DomainError(issues.join(' '));
      const draw = createDraw(
        state.teams.map((team) => team.id),
        groupCount,
        tableNames.length,
        command.seed ?? 1,
      );
      return { ...state, draw, results: {} };
    }

    case 'discardDraw':
      return { ...state, draw: null, results: {} };

    case 'setResult':
      return setResult(state, command.matchId, { scoreA: command.scoreA, scoreB: command.scoreB });

    case 'clearResult':
      return setResult(state, command.matchId, null);

    case 'resetKnockout':
      return { ...state, results: withoutKnockout(state.results) };

    case 'resetTournament':
      return { ...initialState(), revision: state.revision };
  }
}

function normalize(name: string): string {
  return name.trim().toLocaleLowerCase('de');
}

function requireSetup(state: TournamentState, message: string): void {
  if (state.draw) throw new DomainError(message);
}

function isKnockoutId(matchId: MatchId): boolean {
  return matchId.startsWith('ko-');
}

function withoutKnockout(results: Readonly<Record<MatchId, Result>>): Record<MatchId, Result> {
  return Object.fromEntries(Object.entries(results).filter(([id]) => !isKnockoutId(id)));
}

function hasKnockoutResults(state: TournamentState): boolean {
  return Object.keys(state.results).some(isKnockoutId);
}

/** Settings that define the structure of the group stage; frozen by the draw. */
const STRUCTURE_KEYS = ['groupCount'] as const;
/** Settings that influence who qualifies; frozen once knockout results exist. */
const RANKING_KEYS = ['koSize', 'thirdPlaceMatch', 'pointsWin', 'pointsLoss', 'criteria'] as const;

function updateSettings(state: TournamentState, patch: Partial<Settings>): TournamentState {
  const settings: Settings = { ...state.settings, ...patch };
  settings.criteria = [...new Set(settings.criteria)];
  const changed = (key: keyof Settings): boolean =>
    JSON.stringify(settings[key]) !== JSON.stringify(state.settings[key]);

  if (state.draw) {
    if (STRUCTURE_KEYS.some(changed) || settings.tableNames.length !== state.settings.tableNames.length) {
      throw new DomainError(
        'Gruppen- und Tischanzahl stehen nach der Auslosung fest. Dafür zuerst die Auslosung verwerfen.',
      );
    }
    if (RANKING_KEYS.some(changed) && hasKnockoutResults(state)) {
      throw new DomainError(
        'Wertung und KO-Größe können nicht mehr geändert werden, sobald KO-Ergebnisse eingetragen sind. Dafür zuerst die KO-Phase zurücksetzen.',
      );
    }
    const issues = validateFormat(state.teams.length, settings.groupCount, settings.koSize);
    if (issues.length > 0) throw new DomainError(issues.join(' '));
  }
  return { ...state, settings };
}

function setResult(state: TournamentState, matchId: MatchId, result: Result | null): TournamentState {
  if (!state.draw) throw new DomainError('Die Gruppen wurden noch nicht ausgelost.');
  if (result) {
    if (result.scoreA === result.scoreB) {
      throw new DomainError('Ein Spiel braucht einen Sieger – Unentschieden gibt es nicht.');
    }
    if (Math.max(result.scoreA, result.scoreB) > state.settings.maxCups) {
      throw new DomainError(`Es sind höchstens ${state.settings.maxCups} Becher möglich.`);
    }
  }
  const apply = (results: Readonly<Record<MatchId, Result>>): Record<MatchId, Result> => {
    const copy = { ...results };
    if (result) copy[matchId] = result;
    else delete copy[matchId];
    return copy;
  };

  if (!isKnockoutId(matchId)) {
    if (!state.draw.matches.some((match) => match.id === matchId)) {
      throw new DomainError('Spiel nicht gefunden.');
    }
    const next = { ...state, results: apply(state.results) };
    if (hasKnockoutResults(state)) {
      // A correction is fine as long as it does not change who plays whom in the knockout stage.
      const before = deriveView(state);
      const after = deriveView(next);
      const signature = (view: typeof before): string =>
        `${view.groupStageComplete}:${view.seeds.map((seed) => seed.teamId).join(',')}`;
      if (signature(before) !== signature(after)) {
        throw new DomainError(
          'Diese Änderung würde die Teilnehmer der KO-Phase verändern, dort sind aber schon Ergebnisse eingetragen. Dafür zuerst die KO-Phase zurücksetzen.',
        );
      }
    }
    return next;
  }

  const view = deriveView(state);
  const match = view.schedule.find((entry) => entry.id === matchId);
  if (!match || !view.bracket) throw new DomainError('Spiel nicht gefunden.');
  if (!view.groupStageComplete) {
    throw new DomainError('Die KO-Phase beginnt erst, wenn alle Gruppenspiele eingetragen sind.');
  }
  if (!match.playable) {
    throw new DomainError('Die Teilnehmer dieses Spiels stehen noch nicht fest.');
  }
  const results = apply(state.results);
  const newWinner = result ? (result.scoreA > result.scoreB ? match.teamA : match.teamB) : null;
  if (newWinner !== match.winnerId) {
    // Later matches were played by teams that may no longer be there.
    for (const dependent of dependentMatchIds(view.bracket, matchId)) delete results[dependent];
  }
  return { ...state, results };
}
