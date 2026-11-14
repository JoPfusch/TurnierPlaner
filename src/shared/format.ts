import { LIMITS } from './defaults';
import { bracketSize, buildBracket, hasThirdPlaceMatch } from './knockout';
import { qualificationRule, type QualificationRule, type Seed } from './qualification';
import { buildGroupSchedule, groupId, groupSizes, groupSlotCount } from './schedule';
import type { CriterionKey, Group } from './types';

/**
 * Format planning: answers "what is possible with N teams?" before the draw.
 * For a combination of group count and knockout size it reports the number
 * of matches, the time needed and which ranking criteria the format requires.
 */

export interface FormatInput {
  teamCount: number;
  groupCount: number;
  koSize: number;
  tableCount: number;
  thirdPlaceMatch: boolean;
  matchMinutes: number;
  koBreakMinutes: number;
}

export interface FormatAnalysis {
  groupCount: number;
  koSize: number;
  groupSizes: number[];
  rule: QualificationRule;
  /** Free passes in the first knockout round (knockout size is not a power of two). */
  byes: number;
  groupMatches: number;
  koMatches: number;
  totalMatches: number;
  groupSlots: number;
  koSlots: number;
  totalSlots: number;
  durationMinutes: number;
  /** Group games per team (min/max differ for unequal group sizes). */
  gamesPerTeam: { min: number; max: number };
  /** Reasons why this format cannot be played. Empty = valid. */
  issues: string[];
  /** Things the organiser should know about this format. */
  notes: string[];
  /** Criteria this format should have enabled, in a sensible order. */
  recommendedCriteria: CriterionKey[];
  /** How many of those go beyond win points and cup difference. */
  additionalCriteria: number;
  /** Equal group sizes, no cross-group comparison needed, no byes. */
  clean: boolean;
}

/** Rule violations of a format; shared by the planner and the command validation. */
export function validateFormat(teamCount: number, groupCount: number, koSize: number): string[] {
  const issues: string[] = [];
  if (teamCount < 2) {
    issues.push('Es werden mindestens 2 Teams benötigt.');
    return issues;
  }
  if (groupCount < 1 || groupCount > LIMITS.maxGroups) {
    issues.push(`Die Gruppenanzahl muss zwischen 1 und ${LIMITS.maxGroups} liegen.`);
    return issues;
  }
  if (groupCount > Math.floor(teamCount / 2)) {
    issues.push(`Zu viele Gruppen: ${teamCount} Teams reichen für höchstens ${Math.floor(teamCount / 2)} Gruppen.`);
    return issues;
  }
  if (koSize < 2) issues.push('Die KO-Runde braucht mindestens 2 Teams.');
  if (koSize > teamCount) {
    issues.push(`KO-Runde mit ${koSize} Teams nicht möglich – es gibt nur ${teamCount} Teams.`);
  }
  const rule = qualificationRule(groupCount, koSize);
  const smallest = Math.min(...groupSizes(teamCount, groupCount));
  const deepestRank = rule.directPerGroup + (rule.bestOfNext > 0 ? 1 : 0);
  if (koSize <= teamCount && deepestRank > smallest) {
    issues.push(
      `Aus jeder Gruppe müssten bis zu ${deepestRank} Teams weiterkommen, die kleinste Gruppe hat aber nur ${smallest}.`,
    );
  }
  return issues;
}

export function analyzeFormat(input: FormatInput): FormatAnalysis {
  const { teamCount, groupCount, koSize, tableCount } = input;
  const issues = validateFormat(teamCount, groupCount, koSize);
  const sizes = groupCount >= 1 && teamCount >= groupCount ? groupSizes(teamCount, groupCount) : [];
  const rule = qualificationRule(Math.max(groupCount, 1), koSize);
  const thirdPlace = hasThirdPlaceMatch(koSize, input.thirdPlaceMatch);
  const byes = bracketSize(koSize) - koSize;
  const groupMatches = sizes.reduce((sum, size) => sum + (size * (size - 1)) / 2, 0);
  const koMatches = koSize - 1 + (thirdPlace ? 1 : 0);

  let groupSlots = 0;
  let koSlots = 0;
  if (issues.length === 0) {
    // Run the real scheduler on placeholder teams – exact instead of estimated.
    let counter = 0;
    const groups: Group[] = sizes.map((size, index) => ({
      id: groupId(index),
      teamIds: Array.from({ length: size }, () => `team-${counter++}`),
    }));
    groupSlots = groupSlotCount(buildGroupSchedule(groups, tableCount));
    const seeds: Seed[] = Array.from({ length: koSize }, (_, index) => ({
      seed: index + 1,
      teamId: `team-${index}`,
      groupId: `seed-${index}`,
      groupRank: 1,
    }));
    const bracket = buildBracket({
      seeds,
      koSize,
      results: {},
      resolveTeams: false,
      honourResults: false,
      thirdPlaceMatch: input.thirdPlaceMatch,
      tableCount,
      firstSlot: 0,
    });
    koSlots = bracket.endSlot;
  }

  const unequal = new Set(sizes).size > 1;
  const crossGroup = rule.bestOfNext > 0;
  const notes: string[] = [];
  if (rule.directPerGroup === 0) {
    notes.push(`Nur die ${rule.bestOfNext} besten Gruppensieger kommen weiter – nicht jeder Gruppensieger erreicht die KO-Runde.`);
  } else if (crossGroup) {
    notes.push(
      `Die ${rule.bestOfNext} besten Gruppen-${rule.directPerGroup + 1}. kommen zusätzlich weiter – dafür ist ein Vergleich über Gruppen hinweg nötig (direkter Vergleich greift dort nicht).`,
    );
  }
  if (unequal) {
    notes.push(
      crossGroup
        ? `Ungleiche Gruppengrößen (${formatSizes(sizes)}): Der gruppenübergreifende Vergleich wertet pro Spiel (Quotient), sonst wären größere Gruppen im Vorteil.`
        : `Ungleiche Gruppengrößen (${formatSizes(sizes)}): betrifft nur die Setzliste der KO-Runde, sie wird pro Spiel (Quotient) berechnet.`,
    );
  }
  if (byes > 0) {
    notes.push(`${byes} Freilos${byes > 1 ? 'e' : ''} in der ersten KO-Runde für die bestplatzierten Teams.`);
  }
  if (koSize === teamCount) {
    notes.push('Alle Teams erreichen die KO-Runde – die Gruppenphase entscheidet nur über die Setzliste.');
  }

  const recommendedCriteria: CriterionKey[] = ['points', 'cupDiff', 'headToHead'];
  if (crossGroup) recommendedCriteria.push('cupsFor');

  const totalSlots = groupSlots + koSlots;
  return {
    groupCount,
    koSize,
    groupSizes: sizes,
    rule,
    byes,
    groupMatches,
    koMatches,
    totalMatches: groupMatches + koMatches,
    groupSlots,
    koSlots,
    totalSlots,
    durationMinutes: totalSlots * input.matchMinutes + (totalSlots > 0 ? input.koBreakMinutes : 0),
    gamesPerTeam: {
      min: sizes.length ? Math.min(...sizes) - 1 : 0,
      max: sizes.length ? Math.max(...sizes) - 1 : 0,
    },
    issues,
    notes,
    recommendedCriteria,
    additionalCriteria: recommendedCriteria.length - 2,
    clean: issues.length === 0 && !unequal && !crossGroup && byes === 0 && rule.directPerGroup > 0,
  };
}

/** All group counts that are worth showing for the given team count and knockout size. */
export function listFormatOptions(input: Omit<FormatInput, 'groupCount'>): FormatAnalysis[] {
  const maxGroups = Math.min(LIMITS.maxGroups, Math.floor(input.teamCount / 2));
  const options: FormatAnalysis[] = [];
  for (let groupCount = 1; groupCount <= maxGroups; groupCount++) {
    options.push(analyzeFormat({ ...input, groupCount }));
  }
  return options;
}

/** Knockout sizes offered as quick choices: all powers of two that fit. */
export function suggestedKoSizes(teamCount: number): number[] {
  const sizes: number[] = [];
  for (let size = 2; size <= Math.min(teamCount, LIMITS.maxKoSize); size *= 2) sizes.push(size);
  return sizes;
}

/** `[5, 5, 4, 4]` -> `2×5, 2×4` */
export function formatSizes(sizes: readonly number[]): string {
  const counts = new Map<number, number>();
  for (const size of sizes) counts.set(size, (counts.get(size) ?? 0) + 1);
  return [...counts.entries()]
    .sort((x, y) => y[0] - x[0])
    .map(([size, count]) => `${count}×${size}`)
    .join(', ');
}
