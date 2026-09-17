import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { genericEffectiveStatus, resolveGenericMatchAccess } from "@/lib/matching/generic-access";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const access = await resolveGenericMatchAccess(supabase, id, user.id);
  if (!access) {
    return NextResponse.json({ error: "Match not found" }, { status: 404 });
  }

  const status = genericEffectiveStatus(access);
  if (status === "mutual" || status.startsWith("declined_by_")) {
    return NextResponse.json({ error: "This match can no longer be declined" }, { status: 409 });
  }

  const admin = createAdminClient();
  const { data: updated, error } = await admin
    .from("generic_matches")
    .update({ status: `declined_by_${access.side}`, responded_at: new Date().toISOString() })
    .eq("id", id)
    .select("id, status")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ match: updated });
}
