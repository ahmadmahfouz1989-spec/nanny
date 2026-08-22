import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/admin/auth";

export async function GET(request: Request) {
  const supabase = await createClient();
  const admin = await requireAdmin(supabase);
  if (!admin) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const moderationStatus = searchParams.get("moderationStatus") ?? "pending";
  const type = searchParams.get("type"); // 'parent' | 'nanny' | null (both)

  const db = createAdminClient();

  const [parents, nannies] = await Promise.all([
    type === "nanny"
      ? Promise.resolve({ data: [] })
      : db
          .from("parent_profiles")
          .select(
            "id, full_name, status, moderation_status, created_at, updated_at, locations(name_en, name_ar, name_fr)",
          )
          .eq("moderation_status", moderationStatus)
          .order("created_at", { ascending: true }),
    type === "parent"
      ? Promise.resolve({ data: [] })
      : db
          .from("nanny_profiles")
          .select(
            "id, full_name, profile_photo_url, status, moderation_status, created_at, updated_at, locations(name_en, name_ar, name_fr)",
          )
          .eq("moderation_status", moderationStatus)
          .order("created_at", { ascending: true }),
  ]);

  const results = [
    ...(parents.data ?? []).map((p) => ({ ...p, profileType: "parent" as const })),
    ...(nannies.data ?? []).map((n) => ({ ...n, profileType: "nanny" as const })),
  ].sort((a, b) => a.created_at.localeCompare(b.created_at));

  return NextResponse.json({ profiles: results });
}
