import { after, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/admin/auth";
import { createBroadcast, deliverBroadcast, resolveRecipients, type Audience } from "@/lib/broadcast";
import { pushEnabled } from "@/lib/push";
import { apnsEnabled, fcmEnabled } from "@/lib/native-push";

const audienceSchema = z.discriminatedUnion("audience", [
  z.object({ audience: z.literal("all_providers") }),
  z.object({ audience: z.literal("category"), categoryId: z.string().uuid() }),
  z.object({ audience: z.literal("selected"), userIds: z.array(z.string().uuid()).min(1).max(500) }),
]);

const sendSchema = z.object({
  requestId: z.string().uuid(),
  title: z.string().trim().min(2).max(80),
  body: z.string().trim().min(2).max(2000),
  target: audienceSchema,
});

/** Past messages with their delivery totals, plus what the send form needs. */
export async function GET() {
  const supabase = await createClient();
  const admin = await requireAdmin(supabase);
  if (!admin) return NextResponse.json({ error: "Admin access required" }, { status: 403 });

  const db = createAdminClient();
  const [{ data: broadcasts }, { data: categories }] = await Promise.all([
    db.from("broadcasts").select("id, title, body, audience, status, created_at, finished_at, categories(name_en, name_ar)").order("created_at", { ascending: false }).limit(30),
    db.from("categories").select("id, name_en, name_ar").eq("status", "live").order("sort_order"),
  ]);

  const ids = (broadcasts ?? []).map((b) => b.id);
  const totals = new Map<string, Record<string, number>>();
  for (let from = 0; ids.length > 0; from += 1000) {
    const { data: rows } = await db.from("broadcast_recipients").select("broadcast_id, push_status, read_at").in("broadcast_id", ids).order("broadcast_id").order("user_id").range(from, from + 999);
    for (const r of rows ?? []) {
      const t = totals.get(r.broadcast_id) ?? { total: 0, pending: 0, sent: 0, no_device: 0, failed: 0, opened: 0 };
      t.total++;
      t[r.push_status === "sending" ? "pending" : r.push_status]++;
      if (r.read_at) t.opened++;
      totals.set(r.broadcast_id, t);
    }
    if ((rows?.length ?? 0) < 1000) break;
  }

  return NextResponse.json({
    broadcasts: (broadcasts ?? []).map((b) => ({
      ...b,
      // Still "sending" after this long: a restart may have cut it off.
      stale: b.status === "sending" && Date.now() - new Date(b.created_at).getTime() > 5 * 60 * 1000,
      totals: totals.get(b.id) ?? { total: 0, pending: 0, sent: 0, no_device: 0, failed: 0, opened: 0 },
    })),
    categories: categories ?? [],
    channels: { ios: apnsEnabled(), android: fcmEnabled(), web: pushEnabled() },
  });
}

/** With `preview`, only says how many people the audience reaches. */
export async function POST(request: Request) {
  const supabase = await createClient();
  const admin = await requireAdmin(supabase);
  if (!admin) return NextResponse.json({ error: "Admin access required" }, { status: 403 });

  const raw = await request.json().catch(() => null);
  const db = createAdminClient();

  if (raw?.preview) {
    const target = audienceSchema.safeParse(raw.target);
    if (!target.success) return NextResponse.json({ error: "invalid" }, { status: 400 });
    const recipients = await resolveRecipients(db, target.data as Audience);
    return NextResponse.json({ recipients: recipients.length });
  }

  const parsed = sendSchema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: "invalid" }, { status: 400 });

  const { requestId, title, body, target } = parsed.data;
  const saved = await createBroadcast(db, { requestId, createdBy: admin.userId, title, body, target: target as Audience });
  if (!saved.id) return NextResponse.json({ error: "no_recipients" }, { status: 422 });

  if (saved.created) after(() => deliverBroadcast(createAdminClient(), saved.id));
  return NextResponse.json({ id: saved.id, recipients: saved.recipients }, { status: saved.created ? 201 : 200 });
}
