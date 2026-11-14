import type { GroupView } from '../../shared/view';

interface Props {
  group: GroupView;
  teamNames: Record<string, string>;
  /** Team to emphasise (the viewer's own team on the phone). */
  highlight?: string | null;
}

/** Standings of one group. Sizes are in `em`, so the parent controls the scale. */
export function GroupTable({ group, teamNames, highlight = null }: Props) {
  return (
    <section className="group-table">
      <header>
        <h3>Gruppe {group.id}</h3>
        <span className="muted">
          {group.complete ? 'abgeschlossen' : `${group.played}/${group.total} Spiele`}
          {group.pending > 0 && <em className="pending"> · {group.pending} unbestätigt</em>}
        </span>
      </header>
      <table>
        <thead>
          <tr>
            <th />
            <th className="left">Team</th>
            <th title="Spiele">Sp</th>
            <th title="Siege">S</th>
            <th title="Niederlagen">N</th>
            <th title="Eigene Restbecher : Restbecher der Gegner">Becher</th>
            <th title="Becherdifferenz">Diff</th>
            <th title="Punkte">Pkt</th>
          </tr>
        </thead>
        <tbody>
          {group.rows.map((row) => (
            <tr key={row.teamId} className={`status-${row.status}${row.teamId === highlight ? ' own' : ''}`}>
              <td className="rank">{row.rank}</td>
              <td className="left name">
                <span>{teamNames[row.teamId] ?? '?'}</span>
                {row.decidedByLot && group.complete && (
                  <span className="lot" title="Platzierung per Los entschieden">
                    Los
                  </span>
                )}
              </td>
              <td>{row.played}</td>
              <td>{row.wins}</td>
              <td>{row.losses}</td>
              <td>
                {row.cupsFor}:{row.cupsAgainst}
              </td>
              <td>{row.cupDiff > 0 ? `+${row.cupDiff}` : row.cupDiff}</td>
              <td className="points">{row.points}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
