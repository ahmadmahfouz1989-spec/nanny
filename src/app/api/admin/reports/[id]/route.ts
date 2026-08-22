import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/admin/auth";

const bodySchema = z.object({
  status: z.enum(["reviewing", "resolved", "dismissed"]),
  resolutionNotes: z.string().max(1000).optional(),
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

  const db = createAdminClient();
  const update: Record<string, unknown> = {
    status: parsed.data.status,
    resolution_notes: parsed.data.resolutionNotes ?? null,
  };
  if (parsed.data.status === "resolved" || parsed.data.status === "dismissed") {
    update.resolved_by_admin_id = admin.userId;
    update.resolved_at = new Date().toISOString();
  }

  const { data, error } = await db.from("reports").update(update).eq("id", id).select("id, status").maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  if (!data) {
    return NextResponse.json({ error: "Report not found" }, { status: 404 });
  }

  return NextResponse.json({ report: data });
}
