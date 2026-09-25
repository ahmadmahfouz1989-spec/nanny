/**
 * Heuristic contact-info detector for free text that lands in public view
 * before a mutual match exists (post captions, replies). The app's whole
 * trust model is "contact details only after a mutual match" -- an open
 * feed is exactly where that discipline erodes first if it isn't held at
 * write time, so this rejects rather than silently strips.
 *
 * This is deliberately best-effort, not airtight -- a determined user can
 * still evade a regex. It's paired with reporting + admin review, the same
 * way every other layer of moderation in this app works.
 */

// A run of 8+ digit-ish characters -- covers "03 123456", "+961 3 123456",
// "71-234-567", etc. without flagging ordinary short numbers like "2 kids"
// or "21 days".
const PHONE_RE = /\d[\d\s().-]{6,}\d/;

// Scheduling dates ("starting 2026-10-01", "on 01.10.2026", "10/01/2026")
// are also 8+ digit-ish runs and would trip PHONE_RE. They're masked out
// before the phone check -- only full dates with a 2020-2039 year and a
// valid day/month, so an actual phone number still has to look like one.
const DAY = "(?:0?[1-9]|[12]\\d|3[01])";
const MONTH = "(?:0?[1-9]|1[0-2])";
// Grouped: a backreference `\1` followed by a bare "20" parses as `\120`.
const YEAR = "(?:20[23]\\d)";
const DATE_RES = [
  new RegExp(`(?<![\\d])${YEAR}([-./])${MONTH}\\1${DAY}(?![\\d])`, "g"), // 2026-10-01
  new RegExp(`(?<![\\d])${DAY}([-./])${DAY}\\1${YEAR}(?![\\d])`, "g"), // 01.10.2026, 10/01/2026
];

function withoutDates(text: string): string {
  // Replaced with a non-digit separator so the digits on either side of a
  // date can't merge into one phone-looking run.
  return DATE_RES.reduce((t, re) => t.replace(re, " | "), text);
}

const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;

// Common off-platform handoffs: a link to a messaging app, an @handle, or
// the phrase itself ("whatsapp me", "dm me on instagram").
const HANDOFF_RE = /(wa\.me\/|whatsapp|instagram\.com|t\.me\/|telegram|@[a-z0-9_]{3,}|\bdm me\b)/i;

export function containsContactInfo(text: string): boolean {
  return PHONE_RE.test(withoutDates(text)) || EMAIL_RE.test(text) || HANDOFF_RE.test(text);
}
