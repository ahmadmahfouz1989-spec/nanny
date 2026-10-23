// Where a profile is, as matching sees it, and the one rule every
// category's location score uses. Profiles saved since districts came in
// (20261023000002) have a district and, for providers, the other districts
// they cover; older ones only a governorate, and are matched the old way
// until they're edited.

export type Place = {
  governorateId: string | null;
  districtId?: string | null;
  /** Provider only: other districts they also work in. */
  coverDistrictIds?: string[];
  /** Provider only, older profiles: other governorates they also work in. */
  serviceAreaIds?: string[];
};

/**
 * 1 when the provider works in the seeker's district (their own or one they
 * cover); 0.5 when it's elsewhere in the same governorate -- nearby, so
 * still listed, just lower; 0 otherwise. Without a district on both sides,
 * the governorate decides, as it always did.
 */
export function placeScore(seeker: Place, provider: Place): number {
  if (!seeker.governorateId) return 0;
  const coversGovernorate =
    seeker.governorateId === provider.governorateId || (provider.serviceAreaIds ?? []).includes(seeker.governorateId);
  if (seeker.districtId && provider.districtId) {
    if (seeker.districtId === provider.districtId || (provider.coverDistrictIds ?? []).includes(seeker.districtId)) return 1;
    return coversGovernorate ? 0.5 : 0;
  }
  return coversGovernorate ? 1 : 0;
}

/** A profile row's place, from its governorate column and attributes. */
export function placeOf(profile: { location_id: string | null; attributes?: Record<string, unknown> | null }): Place {
  const a = profile.attributes ?? {};
  const ids = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
  return {
    governorateId: profile.location_id,
    districtId: typeof a.districtId === "string" ? a.districtId : null,
    coverDistrictIds: ids(a.coverDistrictIds),
    serviceAreaIds: ids(a.serviceAreaIds),
  };
}
