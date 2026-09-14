import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/admin/auth";

// Bounded window rather than a true all-time aggregate -- fine while this
// table is new and low-volume; revisit with a real group-by query if it
// ever needs to summarize deeper history than the most recent 1000 logins.
const WINDOW = 1000;

export async function GET() {
  const supabase = await createClient();
  const admin = await requireAdmin(supabase);
  if (!admin) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const db = createAdminClient();
  const { data, error } = await db
    .from("login_events")
    .select("id, ip, country, country_code, city, created_at, users(email, role)")
    .order("created_at", { ascending: false })
    .limit(WINDOW);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const events = data ?? [];

  const byCountry = new Map<string, number>();
  for (const e of events) {
    const key = e.country ?? "Unknown";
    byCountry.set(key, (byCountry.get(key) ?? 0) + 1);
  }
  const countrySummary = [...byCountry.entries()]
    .map(([country, count]) => ({ country, count }))
    .sort((a, b) => b.count - a.count);

  return NextResponse.json({ events: events.slice(0, 100), countrySummary, windowSize: events.length });
}
