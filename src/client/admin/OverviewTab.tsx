import { BracketView } from '../components/BracketView';
import { GroupTable } from '../components/GroupTable';
import type { TabProps } from './common';

/** Same content as the projector, for checking tables and bracket on the laptop. */
export function OverviewTab({ state, view }: TabProps) {
  if (view.phase === 'setup' || !view.bracket) {
    return <p className="muted">Tabellen und KO-Baum erscheinen nach der Auslosung.</p>;
  }
  const rounds = view.bracket.rounds.length;
  const firstRound = view.bracket.rounds[0]?.matches.length ?? 1;
  return (
    <div className="a-stack">
      <section>
        <h2>Gruppen</h2>
        <div className="a-groups">
          {view.groups.map((group) => (
            <GroupTable key={group.id} group={group} teamNames={view.teamNames} />
          ))}
        </div>
      </section>
      <section>
        <h2>
          KO-Runde {view.seedsProvisional && <span className="tag">Prognose nach aktuellem Stand</span>}
        </h2>
        <div className="a-bracket-scroll">
          <div
            className="a-bracket"
            style={{ minWidth: `${rounds * 15}em`, height: `${Math.max(firstRound * 5.4, 14)}em` }}
          >
            <BracketView
              bracket={view.bracket}
              teamNames={view.teamNames}
              settings={state.settings}
              provisional={view.seedsProvisional}
            />
          </div>
        </div>
      </section>
      <section className="card">
        <h2>Setzliste</h2>
        <ol className="seed-list">
          {view.seeds.map((seed) => (
            <li key={seed.teamId}>
              {view.teamNames[seed.teamId]}{' '}
              <span className="muted">
                – {seed.groupRank}. Gruppe {seed.groupId}
              </span>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
