// Structural shape of a next-intl translator, with the message-key param
// widened to `never` so any string value can be probed at runtime (the
// real type narrows keys to a literal union).
type Translator = {
  (key: never): string;
  has: (key: never) => boolean;
};

/**
 * Translate `value` with `t`, or fall back to a readable de-slugged form
 * of the raw value when the catalog has no matching message — guards
 * against legacy / imported enum values that don't line up with the keys
 * (otherwise next-intl renders the literal "Namespace.value" path).
 */
export function labelOr(t: Translator, value: string): string {
  const key = value as never;
  return t.has(key) ? t(key) : value.replace(/[_-]+/g, " ");
}
