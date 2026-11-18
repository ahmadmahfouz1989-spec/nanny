/**
 * Provider types that go by a business name instead of the person's
 * (cleaning, beauty, car). Matches is_business_profile() in the database.
 */
export const BUSINESS_PROVIDER_TYPES = ["team", "company", "salon", "garage"] as const;

export function isBusinessType(providerType: unknown): boolean {
  return (BUSINESS_PROVIDER_TYPES as readonly string[]).includes(String(providerType ?? ""));
}
