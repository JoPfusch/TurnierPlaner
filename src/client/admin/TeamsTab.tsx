import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { Command } from '../../shared/commands';
import { LIMITS } from '../../shared/defaults';
import { parseTeamList } from '../../shared/teamList';
import type { Team } from '../../shared/types';
import { fetchInfo, fetchTeamDevices, fetchTeamLinks, shareOrigins } from '../api';
import { QrCode } from '../components/QrCode';
import { TextField, type TabProps } from './common';

type DeviceStats = Record<string, { devices: number; lastSeen: number | null }>;

/** Team registration: single entry, bulk paste, rename, players, paired phones. */
export function TeamsTab({ state, view, run }: TabProps) {
  const [name, setName] = useState('');
  const [bulk, setBulk] = useState('');
  const [bulkErrors, setBulkErrors] = useState<string[]>([]);
  const locked = view.phase !== 'setup';
  const devices = useDeviceStats(state.settings.teamReporting);

  const add = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    if (!name.trim()) return;
    if (await run({ type: 'addTeams', names: [name] })) setName('');
  };
  const addBulk = async (): Promise<void> => {
    const { teams, errors } = parseTeamList(bulk);
    setBulkErrors(errors);
    if (errors.length > 0 || teams.length === 0) return;
    if (await run({ type: 'addTeams', names: teams })) setBulk('');
  };

  return (
    <div className="a-stack">
      <div className="a-columns">
        <section className="card">
          <h2>Teams ({state.teams.length})</h2>
          {locked && (
            <p className="note">
              Die Gruppen sind ausgelost. Teams und Spieler können noch umbenannt, aber keine Teams
              mehr hinzugefügt oder entfernt werden.
            </p>
          )}
          {state.teams.length === 0 && <p className="muted">Noch keine Teams eingetragen.</p>}
          <ol className="team-list">
            {state.teams.map((team) => (
              <li key={team.id} className="team-row">
                <div className="row">
                  <TextField
                    value={team.name}
                    maxLength={LIMITS.maxTeamNameLength}
                    ariaLabel="Teamname"
                    onCommit={(value) => {
                      if (value.trim()) void run({ type: 'renameTeam', teamId: team.id, name: value });
                    }}
                  />
                  {devices && <DeviceBadge stats={devices[team.id]} />}
                  {!locked && (
                    <button
                      type="button"
                      className="ghost danger"
                      title="Team entfernen"
                      onClick={() => void run({ type: 'removeTeam', teamId: team.id })}
                    >
                      ✕
                    </button>
                  )}
                </div>
                <PlayerFields team={team} run={run} />
              </li>
            ))}
          </ol>
          {devices && (
            <p className="muted small">
              📱 = Handys, die den QR-Code des Teams geöffnet haben, mit letzter Aktivität. Ein auf dem
              Startbildschirm abgelegtes iPhone-App-Symbol zählt als eigenes Gerät.
            </p>
          )}
        </section>

        {!locked && (
          <section className="card">
            <h2>Team hinzufügen</h2>
            <form className="row" onSubmit={(event) => void add(event)}>
              <input
                value={name}
                placeholder="Teamname"
                maxLength={LIMITS.maxTeamNameLength}
                onChange={(event) => setName(event.target.value)}
                autoFocus
              />
              <button type="submit" className="primary" disabled={!name.trim()}>
                Hinzufügen
              </button>
            </form>
            <h3>Mehrere auf einmal</h3>
            <textarea
              rows={8}
              value={bulk}
              placeholder={'Ein Team pro Zeile, Spieler optional mit ; getrennt:\nDie Becherstürmer; Anna; Ben\nPong Pirates'}
              onChange={(event) => {
                setBulk(event.target.value);
                setBulkErrors([]);
              }}
            />
            {bulkErrors.map((error) => (
              <p className="note warn" key={error}>
                {error}
              </p>
            ))}
            <button type="button" disabled={!bulk.trim()} onClick={() => void addBulk()}>
              Liste übernehmen
            </button>
            <p className="muted small">
              Aus Excel kopierte Spalten (Team, Spieler 1, Spieler 2) gehen auch; eine Nummernspalte
              davor wird ignoriert. Doppelte Namen werden übersprungen.
            </p>
          </section>
        )}
      </div>
      {state.settings.teamReporting && state.teams.length > 0 && <TeamCodes teams={state.teams} />}
    </div>
  );
}

const padPlayers = (players: readonly string[]): string[] =>
  Array.from({ length: LIMITS.maxPlayers }, (_, index) => players[index] ?? '');

/**
 * The player names of one team. Both fields share one draft and are always
 * saved together, so jumping from one field to the next cannot overwrite the
 * first name with an outdated value.
 */
function PlayerFields({ team, run }: { team: Team; run: (command: Command) => Promise<boolean> }) {
  const [drafts, setDrafts] = useState(() => padPlayers(team.players));
  const editing = useRef(false);
  const saved = team.players.join('\n');

  useEffect(() => {
    // Take over changes from other devices, but never while someone is typing here.
    if (!editing.current) setDrafts(padPlayers(team.players));
  }, [saved]);

  const commit = (): void => {
    editing.current = false;
    const cleaned = drafts.map((draft) => draft.trim()).filter(Boolean);
    if (cleaned.join('\n') !== saved) void run({ type: 'setPlayers', teamId: team.id, players: drafts });
  };

  return (
    <div className="players">
      {drafts.map((draft, index) => (
        <input
          key={index}
          value={draft}
          maxLength={LIMITS.maxPlayerNameLength}
          placeholder={`Spieler ${index + 1}`}
          aria-label={`Spieler ${index + 1} von ${team.name}`}
          onFocus={() => {
            editing.current = true;
          }}
          onChange={(event) => {
            const value = event.target.value;
            setDrafts((current) => current.map((old, i) => (i === index ? value : old)));
          }}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur();
          }}
        />
      ))}
    </div>
  );
}

/** Polls the paired phones per team while the tab is open; `null` if reporting is off. */
function useDeviceStats(enabled: boolean): DeviceStats | null {
  const [stats, setStats] = useState<DeviceStats | null>(null);
  useEffect(() => {
    if (!enabled) {
      setStats(null);
      return;
    }
    let active = true;
    const load = (): void => {
      fetchTeamDevices()
        .then((data) => {
          if (active) setStats(data);
        })
        .catch(() => undefined);
    };
    load();
    const timer = setInterval(load, 15_000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [enabled]);
  return stats;
}

function DeviceBadge({ stats }: { stats: DeviceStats[string] | undefined }) {
  const count = stats?.devices ?? 0;
  const ago = stats?.lastSeen ? minutesAgo(stats.lastSeen) : null;
  return (
    <span
      className={`device-badge${count > 0 ? ' paired' : ''}`}
      title={count > 0 ? `${count} Handy(s), zuletzt aktiv ${ago}` : 'Noch kein Handy gekoppelt'}
    >
      📱 {count}
      {count > 0 && <small>{ago}</small>}
    </span>
  );
}

function minutesAgo(time: number): string {
  const minutes = Math.floor((Date.now() - time) / 60_000);
  if (minutes < 2) return 'gerade';
  if (minutes < 60) return `vor ${minutes} min`;
  return `vor ${Math.floor(minutes / 60)} h`;
}

/**
 * QR codes that bind a phone to a team. Shown one at a time at the
 * registration desk, or printed as a sheet.
 */
function TeamCodes({ teams }: { teams: Team[] }) {
  const [open, setOpen] = useState(false);
  const [links, setLinks] = useState<Record<string, string> | null>(null);
  const [origin, setOrigin] = useState('');
  const [single, setSingle] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const teamKey = teams.map((team) => team.id).join(',');

  useEffect(() => {
    if (!open) return;
    fetchTeamLinks()
      .then(setLinks)
      .catch(() => setFailed(true));
    fetchInfo()
      .then((info) => setOrigin(shareOrigins(info)[0] ?? window.location.origin))
      .catch(() => setOrigin(window.location.origin));
  }, [open, teamKey]);

  const url = (team: Team): string => `${origin}/team/${links?.[team.id] ?? ''}`;
  const shown = single ? teams.filter((team) => team.id === single) : teams;

  return (
    <section className="card team-codes">
      <h2>QR-Codes für die Teams</h2>
      <p className="muted small no-print">
        Eine Person pro Team scannt den Code ihres Teams – danach sieht dieses Handy die eigenen Spiele
        und kann Ergebnisse melden und bestätigen. Mehrere Handys pro Team sind möglich. Wer den Code
        hat, kann für das Team melden: also nur dem jeweiligen Team zeigen.
      </p>
      {!open ? (
        <button type="button" onClick={() => setOpen(true)}>
          QR-Codes anzeigen
        </button>
      ) : failed ? (
        <p className="note warn">Die Team-Links konnten nicht geladen werden (Admin-PIN?).</p>
      ) : !links || !origin ? (
        <p className="muted">Lade …</p>
      ) : (
        <>
          <div className="row wrap no-print">
            <button type="button" onClick={() => window.print()}>
              Alle drucken
            </button>
            {single && (
              <button type="button" onClick={() => setSingle(null)}>
                ← Alle Teams
              </button>
            )}
            <button type="button" className="ghost" onClick={() => setOpen(false)}>
              Ausblenden
            </button>
          </div>
          <div className={single ? 'code-grid single' : 'code-grid'}>
            {shown.map((team) => (
              <button
                type="button"
                className="code-card"
                key={team.id}
                title="Groß anzeigen"
                onClick={() => setSingle(single ? null : team.id)}
              >
                <strong>{team.name}</strong>
                <QrCode text={url(team)} size={single ? 480 : 220} />
                <small>{url(team)}</small>
              </button>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
