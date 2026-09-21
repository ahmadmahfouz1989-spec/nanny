import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveGenericMatchAccess } from "@/lib/matching/generic-access";
import { applyGenericInterest } from "@/lib/matching/generic-apply-interest";

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

  const admin = createAdminClient();
  const { data: match } = await admin
    .from("generic_matches")
    .select("categories(slug)")
    .eq("id", id)
    .single();
  const categorySlug = (match?.categories as unknown as { slug: string } | null)?.slug ?? "";

  return applyGenericInterest(request, access, categorySlug);
}
