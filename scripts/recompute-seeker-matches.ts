// One-off, safe to repeat: scores every live customer request against the
// current providers. Requests released from review by migration
// 20261106000002 may have missed providers approved while they waited.
//   railway run npx tsx scripts/recompute-seeker-matches.ts
import { createAdminClient } from "@/lib/supabase/admin";
import { recomputeGenericMatchesForProfile } from "@/lib/matching/generic-recompute";

async function main() {
  const { data, error } = await createAdminClient()
    .from("generic_profiles")
    .select("id")
    .eq("role", "seeker")
    .eq("status", "active")
    .eq("moderation_status", "approved");
  if (error) throw error;
  for (const { id } of data ?? []) await recomputeGenericMatchesForProfile(id);
  console.log(`Scored ${data?.length ?? 0} requests`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
