import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/admin/auth";
import { notify } from "@/lib/push";
import { removeProjectFiles } from "@/lib/work";

const bodySchema = z.object({ notes: z.string().max(1000).optional() });

/**
 * Removes a work project that breaks the rules -- its photos too -- and
 * tells the owner, with the admin's reason when there is one.
 */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  if (!(await requireAdmin(supabase))) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const db = createAdminClient();
  const { data: project } = await db.from("work_projects").select("id, user_id, profile_id, title").eq("id", id).maybeSingle();
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  await removeProjectFiles(db, [id], project.user_id);
  const { error } = await db.from("work_projects").delete().eq("id", id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  // work_rejected now means "an admin removed it" (no review any more).
  await notify({
    user_id: project.user_id,
    type: "work_rejected",
    payload: { profile_id: project.profile_id, title: project.title, notes: parsed.data.notes ?? null },
  });
  return NextResponse.json({ ok: true });
}
