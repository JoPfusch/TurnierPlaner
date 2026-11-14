import { useEffect, useState, type FormEvent } from 'react';
import { LIMITS } from '../../shared/defaults';
import type { Team } from '../../shared/types';
import { fetchInfo, fetchTeamLinks, shareOrigins } from '../api';
import { QrCode } from '../components/QrCode';
import { TextField, type TabProps } from './common';

/** Team registration: single entry, bulk paste (one name per line), rename, remove. */
export function TeamsTab({ state, view, run }: TabProps) {
  const [name, setName] = useState('');
  const [bulk, setBulk] = useState('');
  const locked = view.phase !== 'setup';

  const add = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    if (!name.trim()) return;
    if (await run({ type: 'addTeams', names: [name] })) setName('');
  };
  const addBulk = async (): Promise<void> => {
    const names = bulk
      .split(/[\n;]/)
      .map((entry) => entry.trim())
      .filter(Boolean);
    if (names.length > 0 && (await run({ type: 'addTeams', names }))) setBulk('');
  };

  return (
    <div className="a-stack">
      <div className="a-columns">
        <section className="card">
          <h2>Teams ({state.teams.length})</h2>
          {locked && (
            <p className="note">
              Die Gruppen sind ausgelost. Teams können noch umbenannt, aber nicht mehr hinzugefügt oder
              entfernt werden.
            </p>
          )}
          {state.teams.length === 0 && <p className="muted">Noch keine Teams eingetragen.</p>}
          <ol className="team-list">
            {state.teams.map((team) => (
              <li key={team.id}>
                <TextField
                  value={team.name}
                  maxLength={LIMITS.maxTeamNameLength}
                  ariaLabel="Teamname"
                  onCommit={(value) => {
                    if (value.trim()) void run({ type: 'renameTeam', teamId: team.id, name: value });
                  }}
                />
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
              </li>
            ))}
          </ol>
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
              placeholder={'Ein Team pro Zeile, z. B.\nDie Becherstürmer\nPong Pirates'}
              onChange={(event) => setBulk(event.target.value)}
            />
            <button type="button" disabled={!bulk.trim()} onClick={() => void addBulk()}>
              Liste übernehmen
            </button>
            <p className="muted small">Doppelte Namen werden übersprungen.</p>
          </section>
        )}
      </div>
      {state.settings.teamReporting && state.teams.length > 0 && <TeamCodes teams={state.teams} />}
    </div>
  );
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
