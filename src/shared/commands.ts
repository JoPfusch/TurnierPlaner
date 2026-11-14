import { z } from 'zod';
import { LIMITS } from './defaults';
import { CRITERION_KEYS } from './types';

/**
 * Commands are the only way to change the tournament. They are validated
 * with these schemas at the API boundary and then applied by the reducer.
 * The schemas are also the source of the TypeScript command types.
 */

const teamName = z.string().trim().min(1).max(LIMITS.maxTeamNameLength);
const score = z.number().int().min(0).max(99);

export const settingsSchema = z.object({
  name: z.string().trim().min(1).max(60),
  groupCount: z.number().int().min(1).max(LIMITS.maxGroups),
  tableNames: z.array(z.string().trim().min(1).max(30)).min(1).max(LIMITS.maxTables),
  koSize: z.number().int().min(2).max(LIMITS.maxKoSize),
  thirdPlaceMatch: z.boolean(),
  pointsWin: z.number().int().min(0).max(99),
  pointsLoss: z.number().int().min(0).max(99),
  maxCups: z.number().int().min(1).max(99),
  criteria: z.array(z.enum(CRITERION_KEYS)).min(1),
  startTime: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)
    .nullable(),
  matchMinutes: z.number().int().min(1).max(240),
  koBreakMinutes: z.number().int().min(0).max(240),
});

export const commandSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('addTeams'), names: z.array(teamName).min(1).max(LIMITS.maxTeams) }),
  z.object({ type: z.literal('renameTeam'), teamId: z.string(), name: teamName }),
  z.object({ type: z.literal('removeTeam'), teamId: z.string() }),
  z.object({ type: z.literal('updateSettings'), patch: settingsSchema.partial() }),
  /** Draws groups and schedule. The server supplies the seed if it is missing. */
  z.object({ type: z.literal('draw'), seed: z.number().int().optional() }),
  /** Back to the setup phase; deletes the draw and all results. */
  z.object({ type: z.literal('discardDraw') }),
  z.object({ type: z.literal('setResult'), matchId: z.string(), scoreA: score, scoreB: score }),
  z.object({ type: z.literal('clearResult'), matchId: z.string() }),
  /** Deletes all knockout results (needed before correcting group results that change the qualifiers). */
  z.object({ type: z.literal('resetKnockout') }),
  /** Deletes everything including teams and settings. */
  z.object({ type: z.literal('resetTournament') }),
]);

export type Command = z.infer<typeof commandSchema>;

const resultSchema = z.object({ scoreA: score, scoreB: score });

/** Schema of the persisted state; used for the data file and for imports. */
export const stateSchema = z.object({
  schemaVersion: z.literal(1),
  revision: z.number().int().min(0),
  settings: settingsSchema,
  teams: z.array(z.object({ id: z.string(), name: teamName })).max(LIMITS.maxTeams),
  nextTeamNumber: z.number().int().min(1),
  draw: z
    .object({
      seed: z.number().int(),
      groups: z.array(z.object({ id: z.string(), teamIds: z.array(z.string()) })),
      matches: z.array(
        z.object({
          id: z.string(),
          groupId: z.string(),
          round: z.number().int(),
          slot: z.number().int(),
          table: z.number().int(),
          teamA: z.string(),
          teamB: z.string(),
        }),
      ),
      lots: z.record(z.string(), z.number()),
    })
    .nullable(),
  results: z.record(z.string(), resultSchema),
});
