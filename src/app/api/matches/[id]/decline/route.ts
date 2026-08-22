import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveMatchAccess, effectiveStatus } from "@/lib/matching/access";

const DECLINABLE = new Set(["suggested", "expired", "parent_interested", "nanny_interested"]);

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const access = await resolveMatchAccess(supabase, id, user.id);
  if (!access) {
    return NextResponse.json({ error: "Match not found" }, { status: 404 });
  }

  const status = effectiveStatus(access);
  if (!DECLINABLE.has(status)) {
    return NextResponse.json({ error: "This match can no longer be declined" }, { status: 409 });
  }

  const admin = createAdminClient();
  const { data: updated, error } = await admin
    .from("matches")
    .update({ status: `declined_by_${access.side}` })
    .eq("id", id)
    .select("id, status")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ match: updated });
}
