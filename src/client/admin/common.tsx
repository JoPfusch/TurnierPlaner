import { useEffect, useState } from 'react';
import type { Command } from '../../shared/commands';
import type { TournamentState } from '../../shared/types';
import type { TournamentView } from '../../shared/view';

/** Props every admin tab receives. */
export interface TabProps {
  state: TournamentState;
  view: TournamentView;
  /** Sends a command; resolves to `false` (after showing the error) if it was rejected. */
  run: (command: Command) => Promise<boolean>;
}

interface TextFieldProps {
  value: string;
  onCommit: (value: string) => void;
  placeholder?: string;
  maxLength?: number;
  type?: 'text' | 'datetime-local';
  disabled?: boolean;
  ariaLabel?: string;
}

/**
 * Text input that keeps a local draft and commits on blur or Enter, so that
 * not every keystroke becomes a command (and a live update on the projector).
 */
export function TextField({ value, onCommit, type = 'text', ariaLabel, ...rest }: TextFieldProps) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const commit = (): void => {
    if (draft !== value) onCommit(draft);
  };
  return (
    <input
      {...rest}
      type={type}
      aria-label={ariaLabel}
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur();
      }}
    />
  );
}

interface NumberFieldProps {
  value: number;
  min: number;
  max: number;
  onCommit: (value: number) => void;
  disabled?: boolean;
  ariaLabel?: string;
}

/** Number input with large −/+ buttons that also work well on a phone. */
export function NumberField({ value, min, max, onCommit, disabled, ariaLabel }: NumberFieldProps) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  const commit = (next: number): void => {
    const clamped = Math.min(max, Math.max(min, Math.round(next)));
    setDraft(String(clamped));
    if (clamped !== value) onCommit(clamped);
  };
  return (
    <span className="number-field">
      <button type="button" disabled={disabled || value <= min} onClick={() => commit(value - 1)}>
        −
      </button>
      <input
        inputMode="numeric"
        aria-label={ariaLabel}
        value={draft}
        disabled={disabled}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => commit(Number(draft) || value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur();
        }}
      />
      <button type="button" disabled={disabled || value >= max} onClick={() => commit(value + 1)}>
        +
      </button>
    </span>
  );
}
