/** Arabic-Indic and Persian digits typed on an Arabic keyboard, as 0-9. */
export const westernDigits = (v: string) => v.replace(/[٠-٩۰-۹]/g, (d) => String((d.charCodeAt(0) & 0xf) % 10));

/**
 * A phone number as people write them in Lebanon: "03/123456", "03 123 456",
 * "+961 3-123.456", "٠٣١٢٣٤٥٦". Separators are fine; 6 to 15 digits.
 */
export function isPhoneNumber(value: string): boolean {
  const v = westernDigits(value.trim());
  return /^\+?[0-9 ()./-]+$/.test(v) && /^(\D*\d){6,15}\D*$/.test(v);
}
