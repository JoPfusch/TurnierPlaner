import { useEffect, useMemo, useState } from 'react';
import type { TournamentState } from '../shared/types';
import { deriveView, type TournamentView } from '../shared/view';

export interface LiveTournament {
  /** `null` until the first state has arrived. */
  state: TournamentState | null;
  view: TournamentView | null;
  connected: boolean;
}

/**
 * Subscribes to the server's event stream. The server pushes the complete
 * state after every change; the read model is derived locally. The browser's
 * `EventSource` reconnects on its own, which makes the display robust
 * against Wi-Fi hiccups and server restarts.
 */
export function useTournament(): LiveTournament {
  const [state, setState] = useState<TournamentState | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const source = new EventSource('/api/events');
    source.onopen = () => setConnected(true);
    source.onerror = () => setConnected(false);
    source.onmessage = (event: MessageEvent<string>) => {
      setState(JSON.parse(event.data) as TournamentState);
      setConnected(true);
    };
    return () => source.close();
  }, []);

  const view = useMemo(() => (state ? deriveView(state) : null), [state]);
  return { state, view, connected };
}
