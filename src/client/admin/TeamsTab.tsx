import { useState, type FormEvent } from 'react';
import { LIMITS } from '../../shared/defaults';
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
  );
}
