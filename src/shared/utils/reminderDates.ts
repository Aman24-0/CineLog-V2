export type ReminderDateStatus = "upcoming" | "due" | "expired";

/** Compare canonical YYYY-MM-DD values without timezone conversion. */
export function reminderDateStatus(
  releaseDate: string,
  today: string
): ReminderDateStatus {
  if (releaseDate < today) return "expired";
  if (releaseDate === today) return "due";
  return "upcoming";
}

export function localCalendarDate(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}
