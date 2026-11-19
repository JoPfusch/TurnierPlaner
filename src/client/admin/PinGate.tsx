import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { checkPin, fetchInfo, storedPin, storePin } from '../api';

type Status = 'checking' | 'locked' | 'open';

/**
 * Asks for the admin PIN before the administration is shown – but only if the
 * server is started with ADMIN_PIN. A PIN that worked once is remembered on
 * this device.
 *
 * This only protects the user interface; the actual protection is the server
 * checking the PIN on every change.
 */
export function PinGate({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>('checking');
  const [pin, setPin] = useState('');
  const [wrong, setWrong] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      const info = await fetchInfo();
      const ok = !info.pinRequired || (await checkPin(storedPin()));
      if (active) setStatus(ok ? 'open' : 'locked');
    })().catch(() => {
      // Server not reachable: show the UI, it reconnects and writes are protected anyway.
      if (active) setStatus('open');
    });
    return () => {
      active = false;
    };
  }, []);

  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    const value = pin.trim();
    if (await checkPin(value)) {
      storePin(value);
      setStatus('open');
    } else {
      setWrong(true);
      setPin('');
    }
  };

  if (status === 'open') return <>{children}</>;
  if (status === 'checking') return <div className="admin admin-loading">Verbinde …</div>;
  return (
    <div className="admin pin-gate">
      <form className="card" onSubmit={(event) => void submit(event)}>
        <h2>Turnierverwaltung</h2>
        <label>
          Admin-PIN
          <input
            type="password"
            inputMode="numeric"
            autoComplete="current-password"
            autoFocus
            value={pin}
            onChange={(event) => {
              setPin(event.target.value);
              setWrong(false);
            }}
          />
        </label>
        {wrong && <p className="note warn">PIN falsch.</p>}
        <button type="submit" className="primary" disabled={!pin.trim()}>
          Anmelden
        </button>
        <p className="muted small">
          Für Spieler: Die Übersicht gibt es ohne PIN unter <a href="/team">/team</a>.
        </p>
      </form>
    </div>
  );
}
