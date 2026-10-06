/**
 * The full international number (digits only) for what was typed next to
 * the selected country code, or null when it can't be a real number.
 *
 * People type numbers every way: local with a trunk 0 ("03 123 456"), or
 * already international ("+961 3 123 456", "00961 3 123 456", "961 3 123
 * 456"). An explicit + or 00 always means the number is already complete,
 * whatever country is selected. A bare leading country code is only taken
 * as such when enough digits follow it to be a whole number on its own
 * (7+) -- so a short local number that happens to start with the same
 * digits (Lebanon's 09 612 345 -> 9612345) isn't mistaken for one.
 */
export function internationalNumber(countryCode: string, typed: string): string | null {
  const trimmed = typed.trim();
  let digits = trimmed.replace(/\D/g, "");

  if (trimmed.startsWith("+")) return valid(withoutTrunkZero(digits, countryCode));
  if (digits.startsWith("00")) return valid(withoutTrunkZero(digits.slice(2), countryCode));

  if (digits.startsWith(countryCode) && digits.length - countryCode.length >= 7) {
    digits = digits.slice(countryCode.length);
  }
  const local = digits.replace(/^0+/, "");
  return local.length >= 6 ? valid(countryCode + local) : null;
}

// "+961 03 123 456": the local 0 kept after the code. No international
// number has a 0 straight after its country code, so it can only be that.
function withoutTrunkZero(full: string, countryCode: string): string {
  return full.startsWith(countryCode + "0") ? countryCode + full.slice(countryCode.length).replace(/^0+/, "") : full;
}

// E.164 allows at most 15 digits; nothing real is shorter than 8.
function valid(full: string): string | null {
  return full.length >= 8 && full.length <= 15 ? full : null;
}
