import { after, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/admin/auth";
import { claimFlashNewsPush, sendFlashNewsPush } from "@/lib/flash-news";
import { anyPushEnabled } from "@/lib/push";

type Ctx = { params: Promise<{ id: string }> };

const schema = z.object({ action: z.enum(["end", "push"]) });

/**
 * "end": takes it down (the banner goes at everyone's next check).
 * "push": sends it to everyone's phones -- once; the sending runs after the response.
 */
export async function PATCH(request: Request, { params }: Ctx) {
  const supabase = await createClient();
  if (!(await requireAdmin(supabase))) return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  const { id } = await params;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || !z.uuid().safeParse(id).success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const db = createAdminClient();

  if (parsed.data.action === "end") {
    await db.from("flash_news").update({ ended_at: new Date().toISOString() }).eq("id", id).is("ended_at", null);
    return NextResponse.json({ ok: true });
  }

  if (!anyPushEnabled()) return NextResponse.json({ error: "Notifications aren't set up" }, { status: 503 });
  const news = await claimFlashNewsPush(db, id);
  if (!news) return NextResponse.json({ error: "Already sent, or taken down" }, { status: 409 });
  after(() => sendFlashNewsPush(db, news));
  return NextResponse.json({ ok: true });
}
