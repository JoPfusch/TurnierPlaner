import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { bracketSize } from '../../shared/knockout';
import type { Settings } from '../../shared/types';
import type { GroupView, MatchView, TournamentView } from '../../shared/view';
import { BracketView } from '../components/BracketView';
import { GroupTable } from '../components/GroupTable';
import { clockTime } from '../time';
import { useTournament } from '../useTournament';
import '../styles/display.css';

/**
 * Full-screen view for the projector. Read-only and self-updating.
 *
 * URL parameters:
 *   ?view=groups|bracket   show only one view instead of rotating
 *   ?rotate=20             seconds per page (default 15)
 *
 * Keys: F = full screen, arrow keys = switch page, space = pause rotation.
 */

const GROUPS_PER_PAGE = 8;

type Page =
  | { kind: 'groups'; groups: GroupView[] }
  | { kind: 'bracket' }
  | { kind: 'podium' }
  | { kind: 'welcome' };

function buildPages(view: TournamentView, forced: string | null): Page[] {
  if (view.phase === 'setup') return [{ kind: 'welcome' }];
  const groupPages: Page[] = [];
  for (let i = 0; i < view.groups.length; i += GROUPS_PER_PAGE) {
    groupPages.push({ kind: 'groups', groups: view.groups.slice(i, i + GROUPS_PER_PAGE) });
  }
  if (forced === 'groups') return groupPages;
  if (forced === 'bracket') return [{ kind: 'bracket' }];
  switch (view.phase) {
    case 'group':
      return [...groupPages, { kind: 'bracket' }];
    case 'knockout':
      return [{ kind: 'bracket' }];
    case 'finished':
      return [{ kind: 'podium' }, { kind: 'bracket' }];
  }
}

export function DisplayApp() {
  const { state, view, connected } = useTournament();
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const rotateSeconds = Math.max(3, Number(params.get('rotate')) || 15);
  const [pageIndex, setPageIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const now = useClock();

  const pages = useMemo(() => (view ? buildPages(view, params.get('view')) : []), [view, params]);
  const pageCount = pages.length;

  useEffect(() => {
    if (paused || pageCount < 2) return;
    const timer = setInterval(() => setPageIndex((i) => i + 1), rotateSeconds * 1000);
    return () => clearInterval(timer);
  }, [paused, pageCount, rotateSeconds]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'f' || event.key === 'F') toggleFullscreen();
      else if (event.key === 'ArrowRight') setPageIndex((i) => i + 1);
      else if (event.key === 'ArrowLeft') setPageIndex((i) => i + Math.max(pageCount, 1) - 1);
      else if (event.key === ' ') setPaused((p) => !p);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pageCount]);

  useEffect(() => {
    if (state) document.title = state.settings.name;
  }, [state]);

  if (!state || !view) {
    return <div className="display display-loading">Verbinde …</div>;
  }
  const page = pages[pageIndex % Math.max(pageCount, 1)] ?? { kind: 'welcome' as const };
  const { settings } = state;

  return (
    <div className="display">
      <header className="d-header">
        <h1>{settings.name}</h1>
        <div className="d-phase">
          <span className="d-badge">{phaseLabel(view)}</span>
          {view.progress.total > 0 && (
            <span className="d-progress">
              {view.progress.played} / {view.progress.total} Spiele
            </span>
          )}
        </div>
        <div className="d-clock">
          {!connected && <span className="d-offline">Verbindung unterbrochen</span>}
          {now.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}
        </div>
      </header>

      <main className="d-main" key={`${page.kind}-${pageIndex % Math.max(pageCount, 1)}`}>
        {page.kind === 'welcome' && <Welcome view={view} />}
        {page.kind === 'groups' && <GroupsPage groups={page.groups} view={view} />}
        {page.kind === 'bracket' && view.bracket && (
          <div className="d-bracket" style={bracketScale(settings, view)}>
            <BracketView
              bracket={view.bracket}
              teamNames={view.teamNames}
              settings={settings}
              provisional={view.seedsProvisional}
              proposals={state.proposals}
            />
            {view.seedsProvisional && (
              <p className="d-hint">
                Prognose nach aktuellem Tabellenstand – die KO-Runde steht fest, sobald alle
                Gruppenspiele gespielt sind.
              </p>
            )}
          </div>
        )}
        {page.kind === 'podium' && <Podium view={view} />}
      </main>

      {view.phase !== 'setup' && view.phase !== 'finished' && (
        <footer className="d-tables">
          {view.tables.map((table) => (
            <div className={`d-table${table.current ? ' live' : ''}`} key={table.index}>
              <div className="d-table-name">{table.name}</div>
              {table.current ? (
                <MatchLine match={table.current} view={view} settings={settings} big />
              ) : (
                <div className="d-table-idle">{table.next ? 'gleich geht es weiter' : 'frei'}</div>
              )}
              {table.next && (
                <div className="d-table-next">
                  <span>Danach</span>
                  <MatchLine match={table.next} view={view} settings={settings} />
                </div>
              )}
            </div>
          ))}
        </footer>
      )}

      <div className="d-controls">
        {pageCount > 1 && (
          <span>
            {paused ? 'pausiert' : ''} {(pageIndex % pageCount) + 1}/{pageCount}
          </span>
        )}
        <button type="button" onClick={toggleFullscreen} title="Vollbild (Taste F)">
          ⛶
        </button>
      </div>
    </div>
  );
}

function useClock(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 10_000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

function toggleFullscreen(): void {
  if (document.fullscreenElement) void document.exitFullscreen();
  else void document.documentElement.requestFullscreen().catch(() => undefined);
}

function phaseLabel(view: TournamentView): string {
  switch (view.phase) {
    case 'setup':
      return 'Anmeldung';
    case 'group':
      return 'Gruppenphase';
    case 'knockout':
      return 'KO-Phase';
    case 'finished':
      return 'Turnier beendet';
  }
}

interface MatchLineProps {
  match: MatchView;
  view: TournamentView;
  settings: Settings;
  big?: boolean;
}

function MatchLine({ match, view, settings, big = false }: MatchLineProps) {
  const name = (teamId: string | null, placeholder: string): string =>
    teamId ? (view.teamNames[teamId] ?? '?') : placeholder;
  const time = clockTime(settings.startTime, match.minutesFromStart);
  return (
    <div className={big ? 'd-match big' : 'd-match'}>
      <span className="d-match-teams">
        <span>{name(match.teamA, match.placeholderA)}</span>
        <i>vs</i>
        <span>{name(match.teamB, match.placeholderB)}</span>
      </span>
      <span className="d-match-meta">
        {match.label}
        {time ? ` · ${time}` : ''}
      </span>
    </div>
  );
}

function Welcome({ view }: { view: TournamentView }) {
  const names = Object.values(view.teamNames);
  return (
    <div className="d-welcome">
      <h2>{names.length} Teams am Start</h2>
      <div className="d-chips">
        {names.map((name) => (
          <span key={name}>{name}</span>
        ))}
      </div>
      <p>Die Auslosung der Gruppen folgt in Kürze.</p>
    </div>
  );
}

function GroupsPage({ groups, view }: { groups: GroupView[]; view: TournamentView }) {
  const count = groups.length;
  const columns = count <= 3 ? count : count <= 4 ? 2 : count <= 6 ? 3 : 4;
  const rows = Math.ceil(count / columns);
  const lines = Math.max(...groups.map((group) => group.rows.length)) + 2.6;
  // Largest font size that fits both the height and the width of the page.
  const style: CSSProperties = {
    gridTemplateColumns: `repeat(${columns}, 1fr)`,
    fontSize: `min(${(62 / (rows * lines * 1.9)).toFixed(2)}vh, ${(92 / columns / 29).toFixed(2)}vw)`,
  };
  const hasBubble = view.groups.some((group) => group.rows.some((row) => row.status === 'bubble'));
  return (
    <div className="d-groups-page">
      <div className="d-groups" style={style}>
        {groups.map((group) => (
          <GroupTable key={group.id} group={group} teamNames={view.teamNames} />
        ))}
      </div>
      <p className="d-hint">
        <span className="legend in" /> aktuell in der KO-Runde
        {hasBubble && (
          <>
            <span className="legend bubble" /> im Vergleich über alle Gruppen aktuell knapp draußen
          </>
        )}
      </p>
    </div>
  );
}

function bracketScale(settings: Settings, view: TournamentView): CSSProperties {
  const firstRound = bracketSize(settings.koSize) / 2;
  const rounds = view.bracket?.rounds.length ?? 1;
  return {
    fontSize: `min(${(56 / (firstRound * 4.9)).toFixed(2)}vh, ${(94 / rounds / 15).toFixed(2)}vw, 3.2vh)`,
  };
}

function Podium({ view }: { view: TournamentView }) {
  const bracket = view.bracket;
  if (!bracket) return null;
  const name = (teamId: string | null): string => (teamId ? (view.teamNames[teamId] ?? '?') : '');
  return (
    <div className="d-podium">
      <div className="d-trophy">🏆</div>
      <p className="d-podium-label">Turniersieger</p>
      <h2>{name(bracket.championId)}</h2>
      <div className="d-podium-rest">
        <div>
          <span>2. Platz</span>
          {name(bracket.runnerUpId)}
        </div>
        {bracket.thirdId && (
          <div>
            <span>3. Platz</span>
            {name(bracket.thirdId)}
          </div>
        )}
      </div>
    </div>
  );
}
