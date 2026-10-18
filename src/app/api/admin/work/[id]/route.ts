import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/admin/auth";
import { notify } from "@/lib/push";

const bodySchema = z.object({
  status: z.enum(["approved", "rejected"]),
  notes: z.string().max(1000).optional(),
});

/**
 * Approves a work project (it appears on the profile) or sends it back
 * (it stays hidden; the owner sees "Needs changes" and can edit it, which
 * puts it back in the queue). Either way the owner is told.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  if (!(await requireAdmin(supabase))) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { status, notes } = parsed.data;

  const { data: project, error } = await createAdminClient()
    .from("work_projects")
    .update({ status, reviewed_at: new Date().toISOString() })
    .eq("id", id)
    .select("id, user_id, profile_id, title")
    .single();
  if (error || !project) {
    return NextResponse.json({ error: error?.message ?? "Project not found" }, { status: 404 });
  }

  await notify({
    user_id: project.user_id,
    type: status === "approved" ? "work_approved" : "work_rejected",
    payload: { profile_id: project.profile_id, title: project.title, notes: notes ?? null },
  });
  return NextResponse.json({ project });
}
