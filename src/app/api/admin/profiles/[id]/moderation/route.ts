import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/admin/auth";
import { recomputeMatchesForParent, recomputeMatchesForNanny } from "@/lib/matching/recompute";

const bodySchema = z.object({
  profileType: z.enum(["parent", "nanny"]),
  status: z.enum(["approved", "rejected"]),
  notes: z.string().max(1000).optional(),
});

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const admin = await requireAdmin(supabase);
  if (!admin) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { profileType, status, notes } = parsed.data;

  const db = createAdminClient();
  const table = profileType === "parent" ? "parent_profiles" : "nanny_profiles";

  const { data: updated, error } = await db
    .from(table)
    .update({ moderation_status: status })
    .eq("id", id)
    .select("id, user_id, full_name")
    .single();

  if (error || !updated) {
    return NextResponse.json({ error: error?.message ?? "Profile not found" }, { status: 404 });
  }

  await db.from("notifications").insert({
    user_id: updated.user_id,
    type: status === "approved" ? "profile_approved" : "profile_rejected",
    payload: { profile_type: profileType, notes: notes ?? null },
  });

  // Approval makes this profile visible to counterparts for the first time —
  // recompute now so it's matched against everyone already approved on the
  // other side (spec appendix: this was the known gap left after R4/R5).
  if (status === "approved") {
    if (profileType === "parent") {
      await recomputeMatchesForParent(id);
    } else {
      await recomputeMatchesForNanny(id);
    }
  }

  return NextResponse.json({ profile: updated });
}
