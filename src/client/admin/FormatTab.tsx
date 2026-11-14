import { CRITERION_LABELS, defaultTableNames, LIMITS } from '../../shared/defaults';
import {
  analyzeFormat,
  formatSizes,
  listFormatOptions,
  suggestedKoSizes,
  type FormatAnalysis,
} from '../../shared/format';
import {
  CRITERION_KEYS,
  type ConfirmationMode,
  type CriterionKey,
  type Settings,
} from '../../shared/types';
import { formatDuration } from '../time';
import { NumberField, TextField, type TabProps } from './common';

/**
 * Tournament format: venues, knockout size, group count, scoring and the draw.
 * The planner table shows what is possible with the current number of teams.
 */
export function FormatTab({ state, view, run }: TabProps) {
  const { settings } = state;
  const teamCount = state.teams.length;
  const drawn = view.phase !== 'setup';
  const update = (patch: Partial<Settings>): void => {
    void run({ type: 'updateSettings', patch });
  };

  const input = {
    teamCount,
    koSize: settings.koSize,
    tableCount: settings.tableNames.length,
    thirdPlaceMatch: settings.thirdPlaceMatch,
    matchMinutes: settings.matchMinutes,
    koBreakMinutes: settings.koBreakMinutes,
  };
  const options = listFormatOptions(input);
  const current = analyzeFormat({ ...input, groupCount: settings.groupCount });
  const missing = current.recommendedCriteria.filter((key) => !settings.criteria.includes(key));

  return (
    <div className="a-stack">
      <section className="card">
        <h2>Allgemein</h2>
        <div className="form-grid">
          <label>
            Turniername
            <TextField value={settings.name} maxLength={60} onCommit={(name) => name.trim() && update({ name })} />
          </label>
          <label>
            Beginn (optional)
            <span className="row">
              <TextField
                type="datetime-local"
                value={settings.startTime ?? ''}
                onCommit={(value) => update({ startTime: value ? value.slice(0, 16) : null })}
              />
              {settings.startTime && (
                <button type="button" className="ghost" onClick={() => update({ startTime: null })}>
                  ✕
                </button>
              )}
            </span>
          </label>
          <label>
            Minuten pro Spiel
            <NumberField value={settings.matchMinutes} min={1} max={240} onCommit={(matchMinutes) => update({ matchMinutes })} />
          </label>
          <label>
            Pause vor der KO-Runde (min)
            <NumberField value={settings.koBreakMinutes} min={0} max={240} onCommit={(koBreakMinutes) => update({ koBreakMinutes })} />
          </label>
        </div>
        <p className="muted small">
          Ohne Beginn werden keine Uhrzeiten angezeigt – die Spielreihenfolge und die geschätzte Dauer
          gibt es trotzdem.
        </p>
      </section>

      <section className="card">
        <h2>Spielorte</h2>
        <div className="form-grid">
          <label>
            Anzahl Tische
            <NumberField
              value={settings.tableNames.length}
              min={1}
              max={LIMITS.maxTables}
              disabled={drawn}
              onCommit={(count) => update({ tableNames: defaultTableNames(count, settings.tableNames) })}
            />
          </label>
        </div>
        <div className="table-names">
          {settings.tableNames.map((table, index) => (
            <TextField
              key={index}
              value={table}
              maxLength={30}
              ariaLabel={`Name von Tisch ${index + 1}`}
              onCommit={(value) => {
                if (!value.trim()) return;
                update({ tableNames: settings.tableNames.map((old, i) => (i === index ? value : old)) });
              }}
            />
          ))}
        </div>
      </section>

      <section className="card">
        <h2>Gruppen und KO-Runde</h2>
        <div className="form-grid">
          <div className="field">
            <span>Teams in der KO-Runde</span>
            <span className="row wrap">
              {suggestedKoSizes(teamCount).map((size) => (
                <button
                  type="button"
                  key={size}
                  className={settings.koSize === size ? 'chip active' : 'chip'}
                  onClick={() => update({ koSize: size })}
                >
                  {koLabel(size)}
                </button>
              ))}
              <NumberField
                value={settings.koSize}
                min={2}
                max={LIMITS.maxKoSize}
                ariaLabel="Teams in der KO-Runde"
                onCommit={(koSize) => update({ koSize })}
              />
            </span>
          </div>
          <label className="check">
            <input
              type="checkbox"
              checked={settings.thirdPlaceMatch}
              onChange={(event) => update({ thirdPlaceMatch: event.target.checked })}
            />
            Spiel um Platz 3
          </label>
        </div>

        <h3>
          Möglichkeiten mit {teamCount} Teams und {settings.koSize} KO-Plätzen
        </h3>
        {teamCount < 2 ? (
          <p className="muted">Zuerst im Reiter „Teams“ mindestens zwei Teams eintragen.</p>
        ) : (
          <div className="table-scroll">
            <table className="options">
              <thead>
                <tr>
                  <th>Gruppen</th>
                  <th>Größe</th>
                  <th>Wer kommt weiter</th>
                  <th title="Gruppenspiele + KO-Spiele">Spiele</th>
                  <th title="Spielrunden bei der aktuellen Tischanzahl">Runden</th>
                  <th>Dauer</th>
                  <th title="Empfohlene Kriterien zusätzlich zu Punkten und Becherdifferenz">Zusatzkriterien</th>
                </tr>
              </thead>
              <tbody>
                {options.map((option) => (
                  <OptionRow
                    key={option.groupCount}
                    option={option}
                    selected={option.groupCount === settings.groupCount}
                    disabled={drawn}
                    onSelect={() => update({ groupCount: option.groupCount })}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="muted small">
          ★ = glattes Format: gleich große Gruppen, kein Vergleich über Gruppen hinweg, keine Freilose.
          {drawn ? ' Die Gruppenanzahl steht nach der Auslosung fest.' : ' Zeile antippen, um die Gruppenanzahl zu wählen.'}
        </p>

        {teamCount >= 2 && <Summary analysis={current} tables={settings.tableNames.length} />}
      </section>

      <section className="card">
        <h2>Wertung</h2>
        <div className="form-grid">
          <label>
            Punkte pro Sieg
            <NumberField value={settings.pointsWin} min={0} max={99} onCommit={(pointsWin) => update({ pointsWin })} />
          </label>
          <label>
            Punkte pro Niederlage
            <NumberField value={settings.pointsLoss} min={0} max={99} onCommit={(pointsLoss) => update({ pointsLoss })} />
          </label>
          <label>
            Becher pro Team
            <NumberField value={settings.maxCups} min={1} max={99} onCommit={(maxCups) => update({ maxCups })} />
          </label>
        </div>
        <h3>Reihenfolge der Kriterien</h3>
        <p className="muted small">
          Das oberste Kriterium entscheidet zuerst, das nächste nur bei Gleichstand. Sind alle
          ausgeschöpft, entscheidet das bei der Auslosung gezogene Los.
        </p>
        <CriteriaEditor criteria={settings.criteria} onChange={(criteria) => update({ criteria })} />
        {missing.length > 0 && current.issues.length === 0 && (
          <p className="note warn">
            Für dieses Format empfohlen, aber nicht aktiv:{' '}
            {missing.map((key) => CRITERION_LABELS[key]).join(', ')}. Ohne diese Kriterien entscheidet
            häufiger das Los.
          </p>
        )}
      </section>

      <section className="card">
        <h2>Ergebnismeldung durch die Teams</h2>
        <label className="check-line">
          <input
            type="checkbox"
            checked={settings.teamReporting}
            onChange={(event) => update({ teamReporting: event.target.checked })}
          />
          Teams dürfen ihre Ergebnisse am eigenen Handy melden
        </label>
        {settings.teamReporting && (
          <>
            <h3>Wann gilt ein gemeldetes Ergebnis?</h3>
            <div className="radio-list">
              {CONFIRMATION_OPTIONS.map((option) => (
                <label key={option.mode}>
                  <input
                    type="radio"
                    name="confirmation"
                    checked={settings.confirmation === option.mode}
                    onChange={() => update({ confirmation: option.mode })}
                  />
                  <span>
                    <strong>{option.title}</strong>
                    <small>{option.text}</small>
                  </span>
                </label>
              ))}
            </div>
            {settings.confirmation === 'timeout' && (
              <div className="form-grid">
                <label>
                  Automatisch übernehmen nach (Minuten)
                  <NumberField
                    value={settings.autoConfirmMinutes}
                    min={1}
                    max={240}
                    onCommit={(autoConfirmMinutes) => update({ autoConfirmMinutes })}
                  />
                </label>
              </div>
            )}
            <p className="muted small">
              Gemeldete Ergebnisse erscheinen sofort als „unbestätigt“ in der Übersicht, zählen aber erst
              nach der Bestätigung für Tabelle und KO-Runde. Die Turnierleitung kann jede Meldung im Reiter
              „Spiele“ übernehmen oder verwerfen; strittige Meldungen entscheidet immer sie. Die QR-Codes
              für die Teams stehen im Reiter „Teams“.
            </p>
          </>
        )}
      </section>

      <section className="card">
        <h2>Auslosung</h2>
        {drawn ? (
          <>
            <p>
              Die Gruppen sind ausgelost ({formatSizes(current.groupSizes)} Teams).{' '}
              {view.progress.played} von {view.progress.total} Spielen sind eingetragen.
            </p>
            <button
              type="button"
              className="danger"
              onClick={() => {
                if (window.confirm('Auslosung verwerfen? Der Spielplan und ALLE Ergebnisse werden gelöscht.')) {
                  void run({ type: 'discardDraw' });
                }
              }}
            >
              Auslosung verwerfen
            </button>
          </>
        ) : (
          <>
            {current.issues.map((issue) => (
              <p className="note warn" key={issue}>
                {issue}
              </p>
            ))}
            <button
              type="button"
              className="primary big"
              disabled={current.issues.length > 0}
              onClick={() => void run({ type: 'draw' })}
            >
              Gruppen und Spielplan auslosen
            </button>
          </>
        )}
      </section>
    </div>
  );
}

const CONFIRMATION_OPTIONS: Array<{ mode: ConfirmationMode; title: string; text: string }> = [
  {
    mode: 'opponent',
    title: 'Gegner bestätigt',
    text: 'Reagiert der Gegner nicht, bleibt die Meldung offen, bis die Turnierleitung sie übernimmt.',
  },
  {
    mode: 'timeout',
    title: 'Gegner bestätigt, sonst automatisch',
    text: 'Reagiert der Gegner nicht innerhalb der eingestellten Zeit, gilt die Meldung von selbst.',
  },
  {
    mode: 'admin',
    title: 'Turnierleitung bestätigt immer',
    text: 'Teams melden nur; jedes Ergebnis muss von der Turnierleitung übernommen werden.',
  },
];

function koLabel(size: number): string {
  switch (size) {
    case 2:
      return 'Finale (2)';
    case 4:
      return 'Halbfinale (4)';
    case 8:
      return 'Viertelfinale (8)';
    case 16:
      return 'Achtelfinale (16)';
    default:
      return `${size} Teams`;
  }
}

function ruleText(option: FormatAnalysis): string {
  const { directPerGroup, bestOfNext } = option.rule;
  const parts: string[] = [];
  if (directPerGroup === 1) parts.push('Gruppensieger');
  else if (directPerGroup > 1) parts.push(`Platz 1–${directPerGroup}`);
  if (bestOfNext > 0) {
    const who = directPerGroup === 0 ? 'Gruppensieger' : `Gruppen-${directPerGroup + 1}.`;
    parts.push(`${bestOfNext} beste${bestOfNext > 1 ? '' : 'r'} ${who}`);
  }
  return parts.join(' + ');
}

interface OptionRowProps {
  option: FormatAnalysis;
  selected: boolean;
  disabled: boolean;
  onSelect: () => void;
}

function OptionRow({ option, selected, disabled, onSelect }: OptionRowProps) {
  const valid = option.issues.length === 0;
  const className = [selected ? 'selected' : '', valid ? '' : 'invalid', disabled ? '' : 'clickable']
    .filter(Boolean)
    .join(' ');
  return (
    <tr className={className} onClick={disabled ? undefined : onSelect}>
      <td>
        <strong>{option.groupCount}</strong> {option.clean && <span title="glattes Format">★</span>}
      </td>
      <td>{formatSizes(option.groupSizes)}</td>
      {valid ? (
        <>
          <td>{ruleText(option)}</td>
          <td>
            <strong>{option.totalMatches}</strong>{' '}
            <span className="muted">
              ({option.groupMatches} + {option.koMatches})
            </span>
          </td>
          <td>{option.totalSlots}</td>
          <td>{formatDuration(option.durationMinutes)}</td>
          <td>
            {option.additionalCriteria}{' '}
            <span className="muted">
              ({option.recommendedCriteria
                .slice(2)
                .map((key) => CRITERION_LABELS[key])
                .join(', ')})
            </span>
          </td>
        </>
      ) : (
        <td colSpan={5} className="muted">
          {option.issues.join(' ')}
        </td>
      )}
    </tr>
  );
}

function Summary({ analysis, tables }: { analysis: FormatAnalysis; tables: number }) {
  if (analysis.issues.length > 0) {
    return (
      <div className="summary invalid">
        <strong>Aktuelle Auswahl ist nicht spielbar:</strong> {analysis.issues.join(' ')}
      </div>
    );
  }
  const games =
    analysis.gamesPerTeam.min === analysis.gamesPerTeam.max
      ? `${analysis.gamesPerTeam.min}`
      : `${analysis.gamesPerTeam.min}–${analysis.gamesPerTeam.max}`;
  return (
    <div className="summary">
      <div className="facts">
        <div>
          <b>{analysis.totalMatches}</b>
          <span>Spiele gesamt</span>
        </div>
        <div>
          <b>{analysis.groupMatches}</b>
          <span>Gruppenspiele</span>
        </div>
        <div>
          <b>{analysis.koMatches}</b>
          <span>KO-Spiele</span>
        </div>
        <div>
          <b>{games}</b>
          <span>Gruppenspiele je Team</span>
        </div>
        <div>
          <b>{formatDuration(analysis.durationMinutes)}</b>
          <span>
            Dauer an {tables} {tables === 1 ? 'Tisch' : 'Tischen'}
          </span>
        </div>
      </div>
      <ul>
        <li>Weiter kommen: {ruleText(analysis).replace(/\.$/, '')}.</li>
        {analysis.notes.map((note) => (
          <li key={note}>{note}</li>
        ))}
        <li>
          Empfohlene Kriterien: {analysis.recommendedCriteria.map((key) => CRITERION_LABELS[key]).join(' → ')} –
          also {analysis.additionalCriteria} zusätzlich zu Punkten und Becherdifferenz.
        </li>
      </ul>
    </div>
  );
}

interface CriteriaEditorProps {
  criteria: CriterionKey[];
  onChange: (criteria: CriterionKey[]) => void;
}

/** Enabled criteria first (in priority order), disabled ones below. */
function CriteriaEditor({ criteria, onChange }: CriteriaEditorProps) {
  const disabled = CRITERION_KEYS.filter((key) => !criteria.includes(key));
  const move = (index: number, delta: number): void => {
    const next = [...criteria];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target] as CriterionKey, next[index] as CriterionKey];
    onChange(next);
  };
  return (
    <ol className="criteria">
      {criteria.map((key, index) => (
        <li key={key}>
          <span className="position">{index + 1}.</span>
          <span className="grow">{CRITERION_LABELS[key]}</span>
          <button type="button" className="ghost" disabled={index === 0} onClick={() => move(index, -1)} title="höher gewichten">
            ▲
          </button>
          <button type="button" className="ghost" disabled={index === criteria.length - 1} onClick={() => move(index, 1)} title="niedriger gewichten">
            ▼
          </button>
          <button
            type="button"
            className="ghost danger"
            disabled={criteria.length === 1}
            onClick={() => onChange(criteria.filter((entry) => entry !== key))}
            title="deaktivieren"
          >
            ✕
          </button>
        </li>
      ))}
      <li className="fixed">
        <span className="position">{criteria.length + 1}.</span>
        <span className="grow">Los (immer zuletzt)</span>
      </li>
      {disabled.map((key) => (
        <li key={key} className="off">
          <span className="position">–</span>
          <span className="grow">{CRITERION_LABELS[key]}</span>
          <button type="button" className="ghost" onClick={() => onChange([...criteria, key])}>
            aktivieren
          </button>
        </li>
      ))}
    </ol>
  );
}
