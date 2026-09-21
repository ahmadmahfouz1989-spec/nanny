import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveGenericMatchAccess } from "@/lib/matching/generic-access";

// The generic-category equivalent of /api/matches/[id]/contact -- same
// mutual-only gate, same shape of response.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
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

  if (access.status !== "mutual") {
    return NextResponse.json({ error: "Contact details unlock once both sides say yes" }, { status: 403 });
  }

  const counterpartUserId = access.side === "seeker" ? access.providerUserId : access.seekerUserId;

  // users RLS only allows self-reads -- the mutual-status check above is the
  // authorization for this cross-user read, so it goes through the service role.
  const admin = createAdminClient();
  const { data: counterpart } = await admin
    .from("users")
    .select("contact_phone, email")
    .eq("id", counterpartUserId)
    .single();

  const phone = counterpart?.contact_phone ?? null;
  const whatsappUrl = phone ? `https://wa.me/${phone.replace(/\D/g, "")}` : null;

  return NextResponse.json({ phone, email: counterpart?.email ?? null, whatsappUrl });
}
