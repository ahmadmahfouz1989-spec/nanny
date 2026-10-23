import { z } from "zod";

// Where in Lebanon, beyond the governorate: the district (qada) is what
// matching uses, so it's required; the exact area is optional because the
// official list doesn't have every everyday name. The server sets the
// governorate from the district, so the two can't disagree.
export const areaFields = {
  districtId: z.string({ message: "Choose your district" }).uuid("Choose your district"),
  areaId: z.string().uuid().nullable().optional(),
};

// Providers tick the other districts they also work in, besides their own.
export const coverageFields = {
  coverDistrictIds: z.array(z.string().uuid()).max(30).default([]),
};
