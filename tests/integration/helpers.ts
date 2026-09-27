import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/supabase/database.types";
import { deleteUserAccount } from "@/lib/account-deletion";

// Runs against local Supabase only (see vitest.config.ts). Every test makes
// its own throwaway users and profiles, so tests don't depend on each
// other or on whatever else is in the local database.

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const PASSWORD = "Test-Password-123!";

export type Db = SupabaseClient<Database>;

export const admin: Db = createClient<Database>(URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });

export type TestUser = { id: string; email: string; client: Db };

const created: string[] = [];

/** A confirmed user plus a client signed in as them (RLS applies to it). */
export async function createUser(tag: string): Promise<TestUser> {
  const email = `${tag}-${randomUUID().slice(0, 8)}@test.local`;
  const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
  if (error || !data.user) throw new Error(`createUser: ${error?.message}`);
  created.push(data.user.id);

  const client = createClient<Database>(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error: signInError } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (signInError) throw new Error(`signIn: ${signInError.message}`);
  return { id: data.user.id, email, client };
}

/** Deletes every user this test file created (and everything under them). */
export async function cleanupUsers() {
  for (const id of created.splice(0)) await deleteUserAccount(id);
}

export async function categoryId(slug: string): Promise<string> {
  const { data } = await admin.from("categories").select("id").eq("slug", slug).single();
  return data!.id;
}

export async function governorateId(): Promise<string> {
  const { data } = await admin.from("locations").select("id").eq("level", "governorate").limit(1).single();
  return data!.id;
}

/** An active profile, approved unless told otherwise (service role, so the moderation guard allows it). */
export async function createProfile(
  user: TestUser,
  slug: string,
  role: "seeker" | "provider",
  attributes: Record<string, Json>,
  { approved = true, fullName = `${slug} ${role}` } = {},
) {
  const { data, error } = await admin
    .from("generic_profiles")
    .insert({
      user_id: user.id,
      category_id: await categoryId(slug),
      role,
      full_name: fullName,
      location_id: await governorateId(),
      attributes,
      status: "active",
      moderation_status: approved ? "approved" : "pending",
    })
    .select("id")
    .single();
  if (error) throw new Error(`createProfile: ${error.message}`);
  return data.id;
}

export const NANNY_SEEKER = {
  neededDays: ["mon"],
  scheduleType: "full_time",
  liveArrangement: "live_out",
  transportationRequired: false,
  childrenAgeRanges: ["toddler"],
  languageIds: [],
};

export const NANNY_PROVIDER = {
  employmentType: "full_time",
  liveArrangementPref: "live_out",
  availability: { days: ["mon", "tue"] },
  hasTransportation: true,
  languageIds: [],
  experience: [{ ageGroup: "toddler", yearsExperience: 2 }],
};

/** The scored match between two profiles (the pair is unique). */
export async function matchBetween(seekerProfileId: string, providerProfileId: string): Promise<string> {
  const { data, error } = await admin
    .from("generic_matches")
    .select("id")
    .eq("seeker_profile_id", seekerProfileId)
    .eq("provider_profile_id", providerProfileId)
    .single();
  if (error) throw new Error(`matchBetween: ${error.message}`);
  return data.id;
}

/** A throwaway Request for code that only reads its URL (email links). */
export const request = () => new Request("http://localhost:3000/api/test");
