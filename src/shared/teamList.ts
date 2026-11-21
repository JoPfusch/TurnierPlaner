import { LIMITS } from './defaults';

export interface ParsedTeam {
  name: string;
  players: string[];
}

export interface ParsedTeamList {
  teams: ParsedTeam[];
  /** Problems with line numbers (1-based); empty = everything can be imported. */
  errors: string[];
}

/**
 * Reads a pasted team list. One team per line; optionally the players follow,
 * separated by `;` or a tab (as pasted from a spreadsheet):
 *
 *   Pong Pirates
 *   Cup Killers; Anna; Ben
 *   3 ⇥ Hopfen & Malz ⇥ Chris ⇥ Dana     (a leading number column is ignored)
 */
export function parseTeamList(text: string): ParsedTeamList {
  const teams: ParsedTeam[] = [];
  const errors: string[] = [];
  text.split(/\r?\n/).forEach((line, index) => {
    let cells = line
      .split(/[;\t]/)
      .map((cell) => cell.trim())
      .filter((cell) => cell !== '');
    if (cells.length === 0) return;
    if (cells.length > 1 && /^\d+\.?$/.test(cells[0] as string)) cells = cells.slice(1);
    const [name, ...players] = cells as [string, ...string[]];
    const lineNo = index + 1;
    if (name.length > LIMITS.maxTeamNameLength) {
      errors.push(
        `Zeile ${lineNo}: Teamname hat ${name.length} Zeichen, erlaubt sind ${LIMITS.maxTeamNameLength}.`,
      );
    }
    if (players.length > LIMITS.maxPlayers) {
      errors.push(`Zeile ${lineNo}: ${players.length} Spieler, erlaubt sind ${LIMITS.maxPlayers}.`);
    }
    const tooLong = players.find((player) => player.length > LIMITS.maxPlayerNameLength);
    if (tooLong) {
      errors.push(`Zeile ${lineNo}: Spielername „${tooLong.slice(0, 20)}…“ ist zu lang.`);
    }
    teams.push({ name, players });
  });
  if (teams.length > LIMITS.maxTeams) {
    errors.push(`Es sind höchstens ${LIMITS.maxTeams} Teams möglich (Liste: ${teams.length}).`);
  }
  return { teams, errors };
}
