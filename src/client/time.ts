/** Clock time `HH:MM` of a match, or `null` if the tournament has no start time. */
export function clockTime(startTime: string | null, minutesFromStart: number): string | null {
  if (!startTime) return null;
  const start = new Date(startTime);
  if (Number.isNaN(start.getTime())) return null;
  const date = new Date(start.getTime() + minutesFromStart * 60_000);
  return date.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
}

/** `95` -> `1 h 35 min` */
export function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest} min`;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}
