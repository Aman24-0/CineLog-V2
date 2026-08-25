/**
 * Runtime formatting used by the compact profile stats card.
 *
 * Watchlist runtimes are stored in minutes, while the interactive display
 * cycles through values expressed in seconds, minutes, or hours. Keeping this
 * helper pure makes the format cycle easy to test independently of SolidJS.
 */

export const RUNTIME_FORMAT_COUNT = 4;

export function formatRuntime(seconds: number, formatState: number): string {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(safeSeconds / 3600);
  const displaySeconds = safeSeconds % 60;

  switch (formatState) {
    case 0:
      return `${hours.toLocaleString()}:${displaySeconds
        .toString()
        .padStart(2, "0")}`;
    case 1:
      return `${safeSeconds.toLocaleString()}s`;
    case 2:
      return `${Math.floor(safeSeconds / 60).toLocaleString()}m`;
    case 3:
      return `${hours.toLocaleString()}h`;
    default:
      return `${hours.toLocaleString()}h`;
  }
}

export function getNextFormat(current: number): number {
  return (Math.max(0, Math.floor(current)) + 1) % RUNTIME_FORMAT_COUNT;
}

export const RUNTIME_FORMAT_LABELS = [
  "hours and seconds",
  "seconds",
  "minutes",
  "hours"
] as const;
