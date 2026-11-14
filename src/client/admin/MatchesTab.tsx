import { useState } from 'react';
import type { MatchView } from '../../shared/view';
import { clockTime } from '../time';
import type { TabProps } from './common';

type Filter = 'open' | 'pending' | 'all' | number;

/**
 * Result entry, optimised for a phone next to the table: tap the winner,
 * then tap the number of cups the winner had left.
 */
export function MatchesTab({ state, view, run }: TabProps) {
  const [filter, setFilter] = useState<Filter>('open');
  /** Match and side for which the cup picker is open. */
  const [picking, setPicking] = useState<{ matchId: string; side: 'A' | 'B' } | null>(null);
  const { settings } = state;

  if (view.phase === 'setup') {
    return <p className="muted">Der Spielplan entsteht mit der Auslosung (Reiter „Format“).</p>;
  }

  const visible = view.schedule.filter((match) => {
    if (filter === 'open') return !match.result;
    if (filter === 'pending') return match.proposal !== null;
    if (filter === 'all') return true;
    return match.table === filter;
  });
  const bySlot = new Map<number, MatchView[]>();
  for (const match of visible) bySlot.set(match.slot, [...(bySlot.get(match.slot) ?? []), match]);

  const name = (teamId: string | null, placeholder: string): string =>
    teamId ? (view.teamNames[teamId] ?? '?') : placeholder;

  const submit = async (match: MatchView, side: 'A' | 'B', cups: number): Promise<void> => {
    const ok = await run({
      type: 'setResult',
      matchId: match.id,
      scoreA: side === 'A' ? cups : 0,
      scoreB: side === 'B' ? cups : 0,
    });
    if (ok) setPicking(null);
  };

  const chip = (value: Filter, label: string) => (
    <button
      type="button"
      key={String(value)}
      className={filter === value ? 'chip active' : 'chip'}
      onClick={() => setFilter(value)}
    >
      {label}
    </button>
  );

  return (
    <div className="a-stack">
      <div className="chips">
        {chip('open', `Offen (${view.progress.total - view.progress.played})`)}
        {view.pendingProposals > 0 && chip('pending', `Zu bestätigen (${view.pendingProposals})`)}
        {chip('all', `Alle (${view.progress.total})`)}
        {settings.tableNames.map((table, index) => chip(index, table))}
      </div>

      {view.phase === 'finished' && filter === 'open' && (
        <p className="note">Alle Spiele sind gespielt – das Turnier ist beendet. 🏆</p>
      )}

      {[...bySlot.entries()].map(([slot, matches]) => {
        const first = matches[0] as MatchView;
        const time = clockTime(settings.startTime, first.minutesFromStart);
        return (
          <section key={slot}>
            <h3 className="slot-title">
              Runde {slot + 1}
              {time && <span> · {time} Uhr</span>}
              {first.kind === 'knockout' && <span className="tag">KO</span>}
            </h3>
            <div className="match-grid">
              {matches.map((match) => {
                const open = picking?.matchId === match.id ? picking.side : null;
                const teamButton = (side: 'A' | 'B') => {
                  const teamId = side === 'A' ? match.teamA : match.teamB;
                  const won = match.winnerId !== null && match.winnerId === teamId;
                  const score = side === 'A' ? match.result?.scoreA : match.result?.scoreB;
                  return (
                    <button
                      type="button"
                      className={`team-button${won ? ' won' : ''}${open === side ? ' picking' : ''}`}
                      disabled={!match.playable}
                      onClick={() => setPicking(open === side ? null : { matchId: match.id, side })}
                    >
                      <span>{name(teamId, side === 'A' ? match.placeholderA : match.placeholderB)}</span>
                      {match.result && <b>{score}</b>}
                    </button>
                  );
                };
                return (
                  <article className={`match-card${match.result ? ' done' : ''}`} key={match.id}>
                    <header>
                      <span>{match.label}</span>
                      <span>{settings.tableNames[match.table]}</span>
                    </header>
                    <div className="match-teams">
                      {teamButton('A')}
                      {teamButton('B')}
                    </div>
                    {open && (
                      <div className="cup-picker">
                        <p>
                          <strong>{name(open === 'A' ? match.teamA : match.teamB, '')}</strong> gewinnt –
                          wie viele Becher sind übrig?
                        </p>
                        <div>
                          {Array.from({ length: settings.maxCups }, (_, i) => i + 1).map((cups) => (
                            <button type="button" key={cups} onClick={() => void submit(match, open, cups)}>
                              {cups}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    {match.proposal && (
                      <div className={`proposal${match.proposal.disputed ? ' disputed' : ''}`}>
                        <p>
                          {match.proposal.disputed ? '⚠ Strittig – ' : 'Gemeldet von '}
                          <strong>{name(match.proposal.byTeamId, '')}</strong>
                          {match.proposal.disputed ? ' meldet' : ':'}{' '}
                          <b>
                            {match.proposal.scoreA} : {match.proposal.scoreB}
                          </b>
                          <span className="muted"> · {reportedAt(match.proposal.at)}</span>
                        </p>
                        <div className="row">
                          <button
                            type="button"
                            className="primary"
                            onClick={() => void run({ type: 'acceptProposal', matchId: match.id })}
                          >
                            Übernehmen
                          </button>
                          <button type="button" onClick={() => void run({ type: 'rejectProposal', matchId: match.id })}>
                            Verwerfen
                          </button>
                        </div>
                      </div>
                    )}
                    {!match.playable && <p className="muted small">Teilnehmer stehen noch nicht fest.</p>}
                    {match.result && !open && (
                      <button
                        type="button"
                        className="ghost small"
                        onClick={() => void run({ type: 'clearResult', matchId: match.id })}
                      >
                        Ergebnis löschen
                      </button>
                    )}
                  </article>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function reportedAt(at: number): string {
  return `${new Date(at).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} Uhr`;
}
