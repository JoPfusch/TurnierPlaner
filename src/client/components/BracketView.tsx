import type { Bracket, BracketMatch, BracketSlot } from '../../shared/knockout';
import type { Proposal, Settings } from '../../shared/types';
import { clockTime } from '../time';

interface Props {
  bracket: Bracket;
  teamNames: Record<string, string>;
  settings: Settings;
  /** Group stage still running: participants are a projection. */
  provisional: boolean;
  /** Reported but unconfirmed results; shown as pending scores. */
  proposals?: Readonly<Record<string, Proposal>>;
}

/**
 * Knockout tree. Pure CSS layout: every round is a flex column whose cells
 * share the height equally, so a match is always centred between its two
 * feeder matches. Sizes are in `em`; the parent sets the font size.
 */
export function BracketView({ bracket, teamNames, settings, provisional, proposals = {} }: Props) {
  const meta = (match: BracketMatch): string => {
    const parts = [match.label];
    if (match.table !== null) parts.push(settings.tableNames[match.table] ?? '');
    const time = clockTime(
      settings.startTime,
      (match.slot ?? 0) * settings.matchMinutes + settings.koBreakMinutes,
    );
    if (time) parts.push(time);
    if (!match.result && proposals[match.id]) parts.push('unbestätigt');
    return parts.filter(Boolean).join(' · ');
  };

  const side = (match: BracketMatch, slot: BracketSlot, score: number | undefined) => {
    const decided = match.winnerId !== null;
    const won = decided && match.winnerId === slot.teamId;
    return (
      <div className={`bk-side${won ? ' won' : ''}${decided && !won ? ' lost' : ''}${slot.teamId ? '' : ' open'}`}>
        <span className="bk-seed">{slot.seed ?? ''}</span>
        <span className="bk-name">{slot.teamId ? (teamNames[slot.teamId] ?? '?') : slot.placeholder}</span>
        <span className="bk-score">{score ?? ''}</span>
      </div>
    );
  };

  const box = (match: BracketMatch) => {
    const shown = match.result ?? proposals[match.id];
    const pending = !match.result && shown !== undefined;
    return (
      <div className={`bk-match${provisional ? ' provisional' : ''}${pending ? ' pending' : ''}`}>
        <div className="bk-meta">{meta(match)}</div>
        {side(match, match.a, shown?.scoreA)}
        {side(match, match.b, shown?.scoreB)}
      </div>
    );
  };

  return (
    <div className="bracket">
      {bracket.rounds.map((round, index) => (
        <div className="bk-round" key={round.name}>
          <h3>{round.name}</h3>
          <div className="bk-cells">
            {round.matches.map((match) => (
              <div className={`bk-cell${match.isBye ? ' bye' : ''}`} key={match.id}>
                {!match.isBye && box(match)}
              </div>
            ))}
          </div>
          {index === bracket.rounds.length - 1 && bracket.thirdPlace && (
            <div className="bk-third">{box(bracket.thirdPlace)}</div>
          )}
        </div>
      ))}
    </div>
  );
}
