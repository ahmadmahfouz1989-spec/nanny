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

// ─── Chat: phone numbers only ────────────────────────────────────────────
//
// In a private chat, "do you have WhatsApp?" or an email is fine; a phone
// number isn't (people agree on the work here, and the app is how they
// reach each other). On top of the digit-run rule above, the ways people
// in Lebanon slip a number past a filter:
//
// - spelled out, in English, Arabic or Arabizi: "zero three six one...",
//   "صفر تلاتة ستة", "sefer tlete set";
// - a letter O standing in for a zero: "O3 612 985", "7O 123 456";
// - split over two messages: "03 612" then "985".

const SPELLED: Record<string, string> = {
  zero: "0", oh: "0", one: "1", two: "2", three: "3", four: "4", five: "5", six: "6", seven: "7", eight: "8", nine: "9",
  "صفر": "0", "واحد": "1", "اتنين": "2", "اثنين": "2", "إثنين": "2", "تنين": "2", "ثلاثة": "3", "تلاتة": "3", "تلاته": "3", "ثلاثه": "3",
  "اربعة": "4", "أربعة": "4", "اربعه": "4", "خمسة": "5", "خمسه": "5", "ستة": "6", "سته": "6", "ست": "6", "سبعة": "7", "سبعه": "7",
  "ثمانية": "8", "تمانية": "8", "تمنية": "8", "ثمانيه": "8", "تسعة": "9", "تسعه": "9",
  sefer: "0", sifir: "0", sfr: "0", wa7ad: "1", wahad: "1", w7ad: "1", tnen: "2", tnein: "2", tnin: "2", tlete: "3", tleta: "3", tlateh: "3",
  arb3a: "4", arba3a: "4", arb3: "4", "5amse": "5", khamse: "5", khamseh: "5", set: "6", sitte: "6", sab3a: "7", sab3: "7", saba3a: "7",
  tmene: "8", tmeni: "8", tamene: "8", tes3a: "9", tis3a: "9", tes3: "9",
};
const SPELLED_RE = new RegExp(
  `(?<![\\p{L}\\p{N}])(${Object.keys(SPELLED).sort((a, b) => b.length - a.length).join("|")})(?![\\p{L}\\p{N}])`,
  "giu",
);

function chatDigits(text: string): string {
  return asciiDigits(text)
    // Spelled numbers become digits ("zero three" -> "0 3").
    .replace(SPELLED_RE, (w) => SPELLED[w.toLowerCase()] ?? SPELLED[w] ?? w)
    // A letter O touching a digit is a zero ("O3", "7O", "1o2").
    .replace(/(?<=\d)[oO]|[oO](?=\d)/g, "0");
}

// A Lebanese number once separators are gone: optional 961 / 00961 and a
// leading 0, then a mobile (3, 70-79, 81) or landline (1-9) number.
const LEBANESE_RE = /^(?:00961|961)?0?(?:3\d{6}|7\d{7}|81\d{6}|[1-9]\d{6})$/;

/** Only digits and the symbols people put between them ("03 612", "985"). */
const numberOnly = (text: string) => /^[\d\s.\-/()+*&_,|]+$/.test(text.trim()) && /\d/.test(text);

/**
 * A phone number in a chat message. `previous` is the same person's last
 * message in this conversation, when it was sent a moment ago: a number
 * split across the two counts too (only when both are just digits, and
 * together they make a Lebanese number, so "1500" then "2000" is fine).
 */
export function containsPhoneNumber(text: string, previous?: string | null): boolean {
  const here = chatDigits(text);
  if (PHONE_RE.test(withoutNonPhones(here))) return true;
  if (previous) {
    const before = chatDigits(previous);
    if (numberOnly(before) && numberOnly(here) && LEBANESE_RE.test((before + here).replace(/\D/g, ""))) return true;
  }
  return false;
}
