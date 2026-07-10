export const formatRuntime = (
  mins: number | undefined | null
): string | null => {
  if (!mins || mins <= 0) return null;

  const h = Math.floor(mins / 60);
  const m = mins % 60;

  return h > 0
    ? `${h}h${m > 0 ? ` ${m}m` : ""}`
    : `${m}m`;
};
