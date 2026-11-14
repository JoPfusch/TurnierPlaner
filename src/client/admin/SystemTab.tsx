import { useEffect, useRef, useState } from 'react';
import { fetchInfo, importState, shareOrigins, type ServerInfo } from '../api';
import { QrCode } from '../components/QrCode';
import type { TabProps } from './common';

/** Links for other devices, backup/restore and the destructive actions. */
export function SystemTab({ state, view, run }: TabProps) {
  const [info, setInfo] = useState<ServerInfo | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchInfo()
      .then(setInfo)
      .catch(() => setInfo(null));
  }, []);

  const origins = shareOrigins(info);

  const exportBackup = (): void => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `turnier-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.json`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const importBackup = async (file: File): Promise<void> => {
    try {
      const data: unknown = JSON.parse(await file.text());
      if (!window.confirm('Sicherung einspielen? Der aktuelle Stand wird vollständig ersetzt.')) return;
      await importState(data);
      setMessage('Sicherung eingespielt.');
    } catch (error) {
      setMessage(`Import fehlgeschlagen: ${error instanceof Error ? error.message : 'unbekannter Fehler'}`);
    }
  };

  const knockoutStarted = Object.keys(state.results).some((id) => id.startsWith('ko-'));

  return (
    <div className="a-stack">
      <section className="card">
        <h2>Geräte verbinden</h2>
        <p className="muted small">
          Alle Geräte müssen im selben Netzwerk (WLAN) sein wie der Rechner, auf dem der Turnierplaner
          läuft.
        </p>
        <div className="links">
          {origins.map((origin) => (
            <div className="link-card" key={origin}>
              <QrCode text={`${origin}/admin`} />
              <div>
                <strong>Verwaltung (Handy)</strong>
                <a href={`${origin}/admin`}>{origin}/admin</a>
                <strong>Übersicht für alle (Handy)</strong>
                <a href={`${origin}/team`}>{origin}/team</a>
                <strong>Beamer</strong>
                <a href={`${origin}/`} target="_blank" rel="noreferrer">
                  {origin}/
                </a>
              </div>
            </div>
          ))}
        </div>
        <p className="muted small">
          Beamer-Ansicht: Taste F für Vollbild, Pfeiltasten zum Blättern, Leertaste pausiert den
          Wechsel. Mit <code>?view=groups</code> oder <code>?view=bracket</code> bleibt eine Ansicht
          fest, <code>?rotate=20</code> stellt die Sekunden pro Seite ein.
        </p>
        <p className="muted small">
          Die QR-Codes, mit denen sich die Teams ihrem Handy zuordnen, stehen im Reiter „Teams“.
        </p>
        <p className="small">
          Schreibschutz:{' '}
          {info?.pinRequired
            ? 'aktiv – Änderungen nur mit Admin-PIN.'
            : 'aus – jeder im Netzwerk mit dem Link kann Änderungen vornehmen (Server mit ADMIN_PIN starten, um das zu verhindern).'}
        </p>
      </section>

      <section className="card">
        <h2>Sicherung</h2>
        <p className="muted small">
          Der Stand wird nach jeder Änderung automatisch auf dem Server gespeichert. Zusätzlich kann er
          als Datei gesichert und wieder eingespielt werden.
        </p>
        <div className="row wrap">
          <button type="button" onClick={exportBackup}>
            Sicherung herunterladen
          </button>
          <button type="button" onClick={() => fileInput.current?.click()}>
            Sicherung einspielen …
          </button>
          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void importBackup(file);
              event.target.value = '';
            }}
          />
        </div>
        {message && <p className="note">{message}</p>}
      </section>

      <section className="card">
        <h2>Zurücksetzen</h2>
        <div className="row wrap">
          <button
            type="button"
            className="danger"
            disabled={!knockoutStarted}
            onClick={() => {
              if (window.confirm('Alle Ergebnisse der KO-Phase löschen?')) void run({ type: 'resetKnockout' });
            }}
          >
            KO-Phase zurücksetzen
          </button>
          <button
            type="button"
            className="danger"
            disabled={view.phase === 'setup'}
            onClick={() => {
              if (window.confirm('Auslosung verwerfen? Spielplan und ALLE Ergebnisse werden gelöscht, die Teams bleiben.')) {
                void run({ type: 'discardDraw' });
              }
            }}
          >
            Auslosung verwerfen
          </button>
          <button
            type="button"
            className="danger"
            onClick={() => {
              if (window.confirm('Wirklich ALLES löschen – Teams, Einstellungen und Ergebnisse?')) {
                void run({ type: 'resetTournament' });
              }
            }}
          >
            Neues Turnier (alles löschen)
          </button>
        </div>
      </section>
    </div>
  );
}
