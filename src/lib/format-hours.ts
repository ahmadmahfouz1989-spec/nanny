const HH_MM = /^(\d{2}):(\d{2})$/;

/**
 * "07:30" + "12:30" -> "7:30 AM – 12:30 PM" (or the locale's own
 * convention), for showing an availability window next to its days.
 * Null when either end is missing or malformed, so callers can simply
 * skip the line.
 */
export function formatHoursRange(start: unknown, end: unknown, locale: string): string | null {
  if (typeof start !== "string" || typeof end !== "string") return null;
  const s = HH_MM.exec(start);
  const e = HH_MM.exec(end);
  if (!s || !e) return null;
  const fmt = new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit" });
  const at = (m: RegExpExecArray) => fmt.format(new Date(2000, 0, 1, Number(m[1]), Number(m[2])));
  return `${at(s)} – ${at(e)}`;
}
