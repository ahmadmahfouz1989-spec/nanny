/**
 * Heuristic contact-info detector for free text that lands in public view
 * (post captions, replies). Phone numbers are only ever shared person to
 * person, in a private conversation -- an open feed is exactly where that
 * discipline erodes first if it isn't held at write time, so this rejects
 * rather than silently strips.
 *
 * This is deliberately best-effort, not airtight -- a determined user can
 * still evade a regex. It's paired with reporting + admin review, the same
 * way every other layer of moderation in this app works.
 */

// A phone number: 7+ digits with nothing but symbols or spaces between
// them -- "03 123456", "+961 3 123456", "71-234-567", and the evasions
// people try once that's blocked: "03&612&985", "03*612*985",
// "0 3 6 1 2 9 8 5", "03 / 612 / 985". Any letter breaks the run, so
// ordinary text with numbers in it ("mn 8 lsoboh lal 10", "2 kids") is
// fine. 7, not 8: a mobile number without its leading 0 ("3 612 985") is
// still enough to reach someone.
const PHONE_RE = /\d(?:[^\p{L}\p{N}]{0,4}\d){6,}/u;

// Arabic-Indic and Persian digits count as digits: "٠٣٦١٢٩٨٥".
function asciiDigits(text: string): string {
  return text.replace(/[\u0660-\u0669\u06F0-\u06F9]/g, (d) => String((d.charCodeAt(0) - 0x0660) % 0x90 % 10));
}

// Things that are digit runs but not phone numbers, masked before the
// phone check. Each is replaced with a letter, so the digits on either
// side of it can't merge into one phone-looking run.
//
// Full dates with a 2020-2039 year and a valid day/month ("starting
// 2026-10-01", "on 01.10.2026", "10/01/2026").
const DAY = "(?:0?[1-9]|[12]\\d|3[01])";
const MONTH = "(?:0?[1-9]|1[0-2])";
// Grouped: a backreference `\1` followed by a bare "20" parses as `\120`.
const YEAR = "(?:20[23]\\d)";
const NOT_PHONE_RES = [
  new RegExp(`(?<![\\d])${YEAR}([-./])${MONTH}\\1${DAY}(?![\\d])`, "g"), // 2026-10-01
  new RegExp(`(?<![\\d])${DAY}([-./])${DAY}\\1${YEAR}(?![\\d])`, "g"), // 01.10.2026, 10/01/2026
  // Times: "8:00-22:00", "8h30".
  /(?<!\d)(?:[01]?\d|2[0-3])[:h][0-5]\d(?!\d)/g,
  // Prices: Lebanese pound amounts run to 7+ digits ("1,500,000 LBP"), so
  // a thousands-grouped number right next to a currency ("LBP", "L.L.",
  // "LL", "$", "usd", "ل.ل", "ليرة", "دولار") isn't a phone number. Only
  // with the currency: a bare "71,234,567" is a phone number with commas.
  /\$\s?\d{1,3}(?:[,.\s]\d{3})+(?!\d)|(?<!\d)\d{1,3}(?:[,.\s]\d{3})+\s?(?:lbp|l\.?l\b\.?|usd|\$|ل\.?\s?ل|ليرة|دولار)/giu,
];

function withoutNonPhones(text: string): string {
  return NOT_PHONE_RES.reduce((t, re) => t.replace(re, " x "), text);
}

const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;

// Common off-platform handoffs: a link to a messaging app, an @handle, or
// the phrase itself ("whatsapp me", "dm me on instagram").
const HANDOFF_RE = /(wa\.me\/|whatsapp|instagram\.com|t\.me\/|telegram|@[a-z0-9_]{3,}|\bdm me\b)/i;

export function containsContactInfo(text: string): boolean {
  return PHONE_RE.test(withoutNonPhones(asciiDigits(text))) || EMAIL_RE.test(text) || HANDOFF_RE.test(text);
}
