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
  const status = searchParams.get("status") ?? "open";

  const db = createAdminClient();
  const { data, error } = await db
    .from("reports")
    .select(
      "id, reason, details, status, created_at, resolution_notes, reporter:reporter_user_id(id, email, role), reported:reported_user_id(id, email, role), post:post_id(id, kind, caption)",
    )
    .eq("status", status)
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  // reports only carries user ids -- resolve a display name and category
  // (the account's oldest profile) so the queue shows more than a bare
  // email. A user without any of these rows (e.g. signed up, never finished
  // onboarding) just falls back to the email in the UI.
  const userIds = [
    ...new Set(
      (data ?? []).flatMap((r) => {
        const reporter = r.reporter as unknown as { id: string } | null;
        const reported = r.reported as unknown as { id: string } | null;
        return [reporter?.id, reported?.id].filter((id): id is string => !!id);
      }),
    ),
  ];

  const identityByUserId = new Map<string, { name: string; category: string | null }>();
  if (userIds.length > 0) {
    const { data: profiles } = await db
      .from("generic_profiles")
      .select("user_id, full_name, categories(name_en)")
      .in("user_id", userIds)
      .order("created_at", { ascending: true });
    for (const g of profiles ?? []) {
      if (identityByUserId.has(g.user_id)) continue;
      const categoryName = (g.categories as unknown as { name_en: string } | null)?.name_en ?? null;
      identityByUserId.set(g.user_id, { name: g.full_name, category: categoryName });
    }
  }

  const withIdentity = (data ?? []).map((r) => {
    const reporter = r.reporter as unknown as { id: string; email: string; role: string | null } | null;
    const reported = r.reported as unknown as { id: string; email: string; role: string | null } | null;
    return {
      ...r,
      reporter: reporter ? { ...reporter, ...identityByUserId.get(reporter.id) } : reporter,
      reported: reported ? { ...reported, ...identityByUserId.get(reported.id) } : reported,
    };
  });

  return NextResponse.json({ reports: withIdentity });
}
