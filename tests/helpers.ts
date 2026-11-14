import { applyCommand, initialState, type Command, type TournamentState } from '../src/shared';

export function run(state: TournamentState, ...commands: Command[]): TournamentState {
  return commands.reduce(applyCommand, state);
}

/** A drawn tournament with `teamCount` teams named `Team 1..n`. */
export function drawnTournament(
  teamCount: number,
  groupCount: number,
  koSize: number,
  tables = 2,
): TournamentState {
  return run(
    initialState(),
    { type: 'addTeams', names: Array.from({ length: teamCount }, (_, i) => `Team ${i + 1}`) },
    {
      type: 'updateSettings',
      patch: { groupCount, koSize, tableNames: Array.from({ length: tables }, (_, i) => `Tisch ${i + 1}`) },
    },
    { type: 'draw', seed: 42 },
  );
}

/** Enters a result for every open group match; the team with the lower number wins. */
export function playGroupStage(state: TournamentState): TournamentState {
  const number = (teamId: string): number => Number(teamId.slice(1));
  let next = state;
  for (const match of state.draw?.matches ?? []) {
    if (next.results[match.id]) continue;
    const aWins = number(match.teamA) < number(match.teamB);
    const cups = 1 + (Math.abs(number(match.teamA) - number(match.teamB)) % 6);
    next = applyCommand(next, {
      type: 'setResult',
      matchId: match.id,
      scoreA: aWins ? cups : 0,
      scoreB: aWins ? 0 : cups,
    });
  }
  return next;
}
