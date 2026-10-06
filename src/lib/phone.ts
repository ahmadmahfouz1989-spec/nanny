/**
 * The full international number for what was typed: digits only, with a
 * local trunk 0 dropped (Lebanese "03 123 456" -> 9613123456). Null when it
 * can't be a real number.
 */
export function internationalNumber(countryCode: string, typed: string): string | null {
  const local = typed.replace(/\D/g, "").replace(/^0+/, "");
  const full = countryCode + local;
  return local.length >= 6 && full.length <= 15 ? full : null;
}
