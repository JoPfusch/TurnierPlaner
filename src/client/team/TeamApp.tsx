import { useEffect, useState } from 'react';
import type { TeamAction } from '../../shared/commands';
import type { Settings, TournamentState } from '../../shared/types';
import type { MatchView, TournamentView } from '../../shared/view';
import { fetchTeamId, sendTeamAction } from '../api';
import { BracketView } from '../components/BracketView';
import { GroupTable } from '../components/GroupTable';
import { clockTime } from '../time';
import { useTournament } from '../useTournament';
import '../styles/admin.css';
import '../styles/team.css';

/**
 * Phone view for players.
 *
 *   /team            read-only overview for everybody
 *   /team/<token>    additionally bound to one team: next match, reporting and
 *                    confirming results. The token comes from the team's QR code.
 */

type Tab = 'me' | 'groups' | 'bracket' | 'schedule';

const TOKEN_KEY = 'turnierplaner.teamToken';

/** Token from the URL; falls back to the one remembered from an earlier scan. */
function resolveToken(): string | null {
  const fromPath = window.location.pathname.split('/')[2] ?? '';
  try {
    if (fromPath) {
      localStorage.setItem(TOKEN_KEY, fromPath);
      return fromPath;
    }
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return fromPath || null;
  }
}

export function TeamApp() {
  const { state, view, connected } = useTournament();
  const [token] = useState(resolveToken);
  const [teamId, setTeamId] = useState<string | null>(null);
  const [linkInvalid, setLinkInvalid] = useState(false);
  const [tab, setTab] = useState<Tab | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    // Installing to the home screen must start at the team link (see /api/manifest).
    document
      .querySelector('link[rel="manifest"]')
      ?.setAttribute('href', `/api/manifest?start=/team/${encodeURIComponent(token)}`);
    if (!window.location.pathname.includes(token)) {
      window.history.replaceState(null, '', `/team/${token}`);
    }
    fetchTeamId(token)
      .then((id) => {
        setTeamId(id);
        setLinkInvalid(id === null);
      })
      .catch(() => undefined);
  }, [token]);

  useEffect(() => {
    if (!error) return;
    const timer = setTimeout(() => setError(null), 7000);
    return () => clearTimeout(timer);
  }, [error]);

  if (!state || !view) return <div className="admin admin-loading">Verbinde …</div>;

  // The team may have been removed, or a new tournament started.
  const myTeamId = teamId && view.teamNames[teamId] ? teamId : null;
  const active: Tab = tab ?? (myTeamId ? 'me' : 'groups');
  const act = async (action: TeamAction): Promise<boolean> => {
    if (!token) return false;
    try {
      await sendTeamAction(token, action);
      setError(null);
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unbekannter Fehler');
      return false;
    }
  };

  const tabs: Array<[Tab, string]> = [
    ...(myTeamId ? ([['me', 'Mein Team']] as Array<[Tab, string]>) : []),
    ['groups', 'Tabellen'],
    ['bracket', 'KO-Runde'],
    ['schedule', 'Spielplan'],
  ];

  return (
    <div className="admin team">
      <header className="a-header">
        <div className="a-title">
          <strong>{myTeamId ? view.teamNames[myTeamId] : state.settings.name}</strong>
          {myTeamId && <span className="muted small">{state.settings.name}</span>}
          {!connected && <span className="a-offline">offline</span>}
        </div>
        <nav>
          {tabs.map(([id, label]) => (
            <a
              key={id}
              href={`#${id}`}
              className={id === active ? 'active' : ''}
              onClick={(event) => {
                event.preventDefault();
                setTab(id);
              }}
            >
              {label}
            </a>
          ))}
        </nav>
      </header>

      <main className="a-main">
        {!myTeamId && (
          <p className="note warn">
            {linkInvalid
              ? 'Dieser Team-Link ist nicht mehr gültig. Bitte den QR-Code eures Teams bei der Turnierleitung neu scannen.'
              : 'Nur-Lese-Ansicht. Um Ergebnisse zu melden, den QR-Code eures Teams bei der Turnierleitung scannen.'}
          </p>
        )}
        {active === 'me' && myTeamId && (
          <MyTeam teamId={myTeamId} state={state} view={view} act={act} />
        )}
        {active === 'groups' && <Groups view={view} />}
        {active === 'bracket' && <Bracket state={state} view={view} />}
        {active === 'schedule' && <Schedule state={state} view={view} highlight={myTeamId} />}
        <InstallHint />
      </main>

      {error && (
        <div className="a-toast" role="alert" onClick={() => setError(null)}>
          {error}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

interface MyTeamProps {
  teamId: string;
  state: TournamentState;
  view: TournamentView;
  act: (action: TeamAction) => Promise<boolean>;
}

function MyTeam({ teamId, state, view, act }: MyTeamProps) {
  if (view.phase === 'setup') {
    return (
      <section className="card">
        <h2>Ihr seid dabei 🎉</h2>
        <p>Dieses Handy gehört jetzt zu eurem Team. Sobald die Gruppen ausgelost sind, seht ihr hier eure Spiele.</p>
      </section>
    );
  }
  const mine = view.schedule.filter((match) => match.teamA === teamId || match.teamB === teamId);
  const toConfirm = mine.filter((match) => match.proposal && match.proposal.byTeamId !== teamId);
  const reported = mine.filter((match) => match.proposal?.byTeamId === teamId);
  const upcoming = mine.filter((match) => !match.result && !match.proposal);
  const done = mine.filter((match) => match.result);
  const group = view.groups.find((entry) => entry.rows.some((row) => row.teamId === teamId));
  const out = view.groupStageComplete && upcoming.length === 0 && toConfirm.length + reported.length === 0;
  const card = (match: MatchView, next = false) => (
    <TeamMatchCard key={match.id} match={match} teamId={teamId} state={state} view={view} act={act} next={next} />
  );

  return (
    <div className="a-stack">
      {toConfirm.length > 0 && (
        <section>
          <h3 className="slot-title">Bitte bestätigen</h3>
          <div className="match-grid">{toConfirm.map((match) => card(match))}</div>
        </section>
      )}
      {upcoming.length > 0 && (
        <section>
          <h3 className="slot-title">Euer nächstes Spiel</h3>
          <div className="match-grid">{card(upcoming[0] as MatchView, true)}</div>
        </section>
      )}
      {out && view.phase !== 'finished' && (
        <p className="note">Für euch stehen aktuell keine weiteren Spiele an.</p>
      )}
      {reported.length > 0 && (
        <section>
          <h3 className="slot-title">Von euch gemeldet</h3>
          <div className="match-grid">{reported.map((match) => card(match))}</div>
        </section>
      )}
      {upcoming.length > 1 && (
        <section>
          <h3 className="slot-title">Danach</h3>
          <div className="match-grid">{upcoming.slice(1).map((match) => card(match))}</div>
        </section>
      )}
      {group && (
        <section>
          <h3 className="slot-title">Eure Gruppe</h3>
          <GroupTable group={group} teamNames={view.teamNames} highlight={teamId} />
        </section>
      )}
      {done.length > 0 && (
        <section>
          <h3 className="slot-title">Gespielt</h3>
          <div className="match-grid">{done.map((match) => card(match))}</div>
        </section>
      )}
    </div>
  );
}

interface TeamMatchCardProps extends MyTeamProps {
  match: MatchView;
  next: boolean;
}

/** One match from the point of view of a team, including report and confirmation controls. */
function TeamMatchCard({ match, teamId, state, view, act, next }: TeamMatchCardProps) {
  const [step, setStep] = useState<'idle' | 'winner' | 'cups'>('idle');
  const [winner, setWinner] = useState<'A' | 'B'>('A');
  const { settings } = state;
  const mySide: 'A' | 'B' = match.teamA === teamId ? 'A' : 'B';
  const opponentId = mySide === 'A' ? match.teamB : match.teamA;
  const opponent = opponentId
    ? (view.teamNames[opponentId] ?? '?')
    : mySide === 'A'
      ? match.placeholderB
      : match.placeholderA;
  const time = clockTime(settings.startTime, match.minutesFromStart);
  const proposal = match.proposal;
  const shown = match.result ?? proposal;
  const myScore = shown ? (mySide === 'A' ? shown.scoreA : shown.scoreB) : null;
  const theirScore = shown ? (mySide === 'A' ? shown.scoreB : shown.scoreA) : null;
  const won = myScore !== null && theirScore !== null && myScore > theirScore;
  const canReport = settings.teamReporting && match.playable && !match.result && !proposal;

  const report = async (cups: number): Promise<void> => {
    const ok = await act({
      action: 'propose',
      matchId: match.id,
      scoreA: winner === 'A' ? cups : 0,
      scoreB: winner === 'B' ? cups : 0,
    });
    if (ok) setStep('idle');
  };

  return (
    <article className={`match-card t-match${next ? ' next' : ''}${match.result ? ' done' : ''}`}>
      <header>
        <span>
          {match.label}
          {time ? ` · ${time} Uhr` : ` · Runde ${match.slot + 1}`}
        </span>
        <span>{settings.tableNames[match.table]}</span>
      </header>
      <div className="t-versus">
        <span className="muted">gegen</span> <strong>{opponent}</strong>
        {shown && (
          <b className={`t-score${match.result ? (won ? ' won' : ' lost') : ' pending'}`}>
            {myScore} : {theirScore}
          </b>
        )}
      </div>

      {match.result && <p className="muted small">{won ? 'Sieg' : 'Niederlage'}</p>}

      {proposal && proposal.byTeamId === teamId && (
        <>
          <p className="note warn">{pendingText(proposal.disputed, settings, proposal.at)}</p>
          <button type="button" className="ghost small" onClick={() => void act({ action: 'withdraw', matchId: match.id })}>
            Meldung zurückziehen
          </button>
        </>
      )}

      {proposal && proposal.byTeamId !== teamId && (
        <>
          <p className="note warn">
            <strong>{opponent}</strong> meldet: {won ? 'ihr gewinnt' : `${opponent} gewinnt`} mit{' '}
            {Math.max(proposal.scoreA, proposal.scoreB)} Restbechern.
            {proposal.disputed && ' Ihr habt widersprochen – die Turnierleitung entscheidet.'}
            {!proposal.disputed && settings.confirmation === 'admin' && ' Die Turnierleitung bestätigt das Ergebnis.'}
          </p>
          {!proposal.disputed && (
            <div className="row">
              {settings.confirmation !== 'admin' && (
                <button type="button" className="primary grow" onClick={() => void act({ action: 'confirm', matchId: match.id })}>
                  Stimmt ✓
                </button>
              )}
              <button type="button" className="danger grow" onClick={() => void act({ action: 'dispute', matchId: match.id })}>
                Stimmt nicht
              </button>
            </div>
          )}
        </>
      )}

      {canReport && step === 'idle' && (
        <button type="button" className={next ? 'primary wide' : 'wide'} onClick={() => setStep('winner')}>
          Ergebnis melden
        </button>
      )}
      {canReport && step === 'winner' && (
        <div className="cup-picker">
          <p>Wer hat gewonnen?</p>
          <div className="row">
            {(['A', 'B'] as const).map((side) => (
              <button
                type="button"
                key={side}
                className="grow"
                onClick={() => {
                  setWinner(side);
                  setStep('cups');
                }}
              >
                {side === mySide ? 'Wir' : opponent}
              </button>
            ))}
          </div>
        </div>
      )}
      {canReport && step === 'cups' && (
        <div className="cup-picker">
          <p>
            <strong>{winner === mySide ? 'Wir gewinnen' : `${opponent} gewinnt`}</strong> – wie viele Becher
            hatte der Sieger noch?
          </p>
          <div className="cups">
            {Array.from({ length: settings.maxCups }, (_, i) => i + 1).map((cups) => (
              <button type="button" key={cups} onClick={() => void report(cups)}>
                {cups}
              </button>
            ))}
          </div>
        </div>
      )}
      {step !== 'idle' && canReport && (
        <button type="button" className="ghost small" onClick={() => setStep('idle')}>
          Abbrechen
        </button>
      )}
      {!match.playable && <p className="muted small">Gegner steht noch nicht fest.</p>}
    </article>
  );
}

function pendingText(disputed: boolean, settings: Settings, at: number): string {
  if (disputed) return 'Der Gegner hat widersprochen – die Turnierleitung entscheidet.';
  switch (settings.confirmation) {
    case 'admin':
      return 'Gemeldet – wartet auf Bestätigung durch die Turnierleitung.';
    case 'timeout': {
      const due = new Date(at + settings.autoConfirmMinutes * 60_000);
      const time = due.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
      return `Gemeldet – wartet auf Bestätigung durch den Gegner, sonst automatisch gültig um ${time} Uhr.`;
    }
    case 'opponent':
      return 'Gemeldet – wartet auf Bestätigung durch den Gegner.';
  }
}

// ---------------------------------------------------------------------------

function Groups({ view }: { view: TournamentView }) {
  if (view.groups.length === 0) return <p className="muted">Die Gruppen werden noch ausgelost.</p>;
  return (
    <div className="a-groups">
      {view.groups.map((group) => (
        <GroupTable key={group.id} group={group} teamNames={view.teamNames} />
      ))}
    </div>
  );
}

function Bracket({ state, view }: { state: TournamentState; view: TournamentView }) {
  if (!view.bracket) return <p className="muted">Die KO-Runde erscheint nach der Auslosung.</p>;
  const rounds = view.bracket.rounds.length;
  const firstRound = view.bracket.rounds[0]?.matches.length ?? 1;
  return (
    <>
      {view.seedsProvisional && (
        <p className="note">Prognose nach aktuellem Tabellenstand – fest, sobald alle Gruppenspiele gespielt sind.</p>
      )}
      <div className="a-bracket-scroll">
        <div className="a-bracket" style={{ minWidth: `${rounds * 14}em`, height: `${Math.max(firstRound * 5.4, 14)}em` }}>
          <BracketView
            bracket={view.bracket}
            teamNames={view.teamNames}
            settings={state.settings}
            provisional={view.seedsProvisional}
            proposals={state.proposals}
          />
        </div>
      </div>
    </>
  );
}

interface ScheduleProps {
  state: TournamentState;
  view: TournamentView;
  highlight: string | null;
}

/** All matches in playing order, compact. */
function Schedule({ state, view, highlight }: ScheduleProps) {
  if (view.schedule.length === 0) return <p className="muted">Der Spielplan entsteht mit der Auslosung.</p>;
  const name = (teamId: string | null, placeholder: string): string =>
    teamId ? (view.teamNames[teamId] ?? '?') : placeholder;
  return (
    <table className="t-schedule">
      <tbody>
        {view.schedule.map((match, index) => {
          const previous = view.schedule[index - 1];
          const time = clockTime(state.settings.startTime, match.minutesFromStart);
          const shown = match.result ?? match.proposal;
          const mine = highlight !== null && (match.teamA === highlight || match.teamB === highlight);
          return [
            previous?.slot !== match.slot && (
              <tr className="t-round" key={`slot-${match.slot}`}>
                <th colSpan={3}>
                  Runde {match.slot + 1}
                  {time ? ` · ${time} Uhr` : ''}
                </th>
              </tr>
            ),
            <tr key={match.id} className={mine ? 'mine' : ''}>
              <td className="muted">
                {state.settings.tableNames[match.table]}
                <br />
                {match.label}
              </td>
              <td>
                <span className={match.winnerId !== null && match.winnerId === match.teamA ? 'w' : ''}>
                  {name(match.teamA, match.placeholderA)}
                </span>
                <br />
                <span className={match.winnerId !== null && match.winnerId === match.teamB ? 'w' : ''}>
                  {name(match.teamB, match.placeholderB)}
                </span>
              </td>
              <td className={match.result ? 'score' : 'score pending'} title={match.result ? '' : 'noch nicht bestätigt'}>
                {shown ? (
                  <>
                    {shown.scoreA}
                    <br />
                    {shown.scoreB}
                  </>
                ) : (
                  ''
                )}
              </td>
            </tr>,
          ];
        })}
      </tbody>
    </table>
  );
}

function InstallHint() {
  return (
    <details className="t-install">
      <summary>Als App auf dem Startbildschirm ablegen</summary>
      <p>
        <strong>Android (Chrome):</strong> Menü ⋮ → „Zum Startbildschirm hinzufügen“ bzw. „App installieren“.
      </p>
      <p>
        <strong>iPhone (Safari):</strong> Teilen-Symbol → „Zum Home-Bildschirm“.
      </p>
      <p className="muted">Die Zuordnung zu eurem Team bleibt dabei erhalten.</p>
    </details>
  );
}
