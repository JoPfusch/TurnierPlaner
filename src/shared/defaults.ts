import type { CriterionKey, Settings, TournamentState } from './types';

/** Hard limits, shared by validation and UI. */
export const LIMITS = {
  maxTeams: 128,
  maxGroups: 16,
  maxTables: 32,
  maxKoSize: 64,
  maxTeamNameLength: 70,
  maxRulesLength: 5000,
  maxTableDescriptionLength: 80,
} as const;

export const CRITERION_LABELS: Record<CriterionKey, string> = {
  points: 'Punkte',
  cupDiff: 'Becherdifferenz',
  headToHead: 'Direkter Vergleich',
  cupsFor: 'Becher (eigene Restbecher)',
  wins: 'Anzahl Siege',
  cupsAgainst: 'Wenigste Gegenbecher',
};

export function defaultTableNames(count: number, existing: readonly string[] = []): string[] {
  return Array.from({ length: count }, (_, i) => existing[i] ?? `Tisch ${i + 1}`);
}

export function defaultSettings(): Settings {
  return {
    name: 'Beerpong Turnier',
    groupCount: 4,
    tableNames: defaultTableNames(2),
    koSize: 8,
    thirdPlaceMatch: true,
    pointsWin: 3,
    pointsLoss: 0,
    maxCups: 10,
    criteria: ['points', 'cupDiff', 'headToHead', 'cupsFor'],
    startTime: null,
    matchMinutes: 15,
    koBreakMinutes: 0,
    teamReporting: true,
    confirmation: 'opponent',
    autoConfirmMinutes: 5,
    rules: '',
    tableDescriptions: [],
    venueMapVersion: null,
  };
}

export function initialState(): TournamentState {
  return {
    schemaVersion: 1,
    revision: 0,
    settings: defaultSettings(),
    teams: [],
    nextTeamNumber: 1,
    draw: null,
    results: {},
    proposals: {},
  };
}
