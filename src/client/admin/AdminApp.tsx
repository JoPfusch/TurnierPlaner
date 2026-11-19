import { useCallback, useEffect, useState } from 'react';
import type { Command } from '../../shared/commands';
import { sendCommand } from '../api';
import { useTournament } from '../useTournament';
import type { TabProps } from './common';
import { FormatTab } from './FormatTab';
import { InfoTab } from './InfoTab';
import { MatchesTab } from './MatchesTab';
import { OverviewTab } from './OverviewTab';
import { PinGate } from './PinGate';
import { SystemTab } from './SystemTab';
import { TeamsTab } from './TeamsTab';
import '../styles/admin.css';

const TABS = [
  { id: 'teams', label: 'Teams', component: TeamsTab },
  { id: 'format', label: 'Format', component: FormatTab },
  { id: 'matches', label: 'Spiele', component: MatchesTab },
  { id: 'overview', label: 'Tabellen', component: OverviewTab },
  { id: 'info', label: 'Infos', component: InfoTab },
  { id: 'system', label: 'System', component: SystemTab },
] as const;
type TabId = (typeof TABS)[number]['id'];

const PHASE_LABELS = {
  setup: 'Vorbereitung',
  group: 'Gruppenphase',
  knockout: 'KO-Phase',
  finished: 'Beendet',
} as const;

function tabFromHash(): TabId {
  const id = window.location.hash.slice(1);
  return TABS.some((tab) => tab.id === id) ? (id as TabId) : 'teams';
}

/** Administration for laptop and phone; asks for the PIN first if one is configured. */
export function AdminApp() {
  return (
    <PinGate>
      <Administration />
    </PinGate>
  );
}

/** All changes go through `run`. */
function Administration() {
  const { state, view, connected } = useTournament();
  const [tab, setTab] = useState<TabId>(tabFromHash);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onHash = (): void => setTab(tabFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  useEffect(() => {
    if (!error) return;
    const timer = setTimeout(() => setError(null), 7000);
    return () => clearTimeout(timer);
  }, [error]);

  const run = useCallback(async (command: Command): Promise<boolean> => {
    try {
      await sendCommand(command);
      setError(null);
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unbekannter Fehler');
      return false;
    }
  }, []);

  if (!state || !view) return <div className="admin admin-loading">Verbinde …</div>;

  const props: TabProps = { state, view, run };
  const Active = TABS.find((entry) => entry.id === tab)?.component ?? TeamsTab;

  return (
    <div className="admin">
      <header className="a-header">
        <div className="a-title">
          <strong>{state.settings.name}</strong>
          <span className={`a-phase phase-${view.phase}`}>{PHASE_LABELS[view.phase]}</span>
          {!connected && <span className="a-offline">offline</span>}
          <a href="/" target="_blank" rel="noreferrer">
            Beamer-Ansicht ↗
          </a>
        </div>
        <nav>
          {TABS.map((entry) => (
            <a key={entry.id} href={`#${entry.id}`} className={entry.id === tab ? 'active' : ''}>
              {entry.label}
              {entry.id === 'matches' && view.pendingProposals > 0 && (
                <span className="badge" title="Meldungen warten auf Bestätigung">
                  {view.pendingProposals}
                </span>
              )}
            </a>
          ))}
        </nav>
      </header>
      <main className="a-main">
        <Active {...props} />
      </main>
      {error && (
        <div className="a-toast" role="alert" onClick={() => setError(null)}>
          {error}
        </div>
      )}
    </div>
  );
}
