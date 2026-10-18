import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireActiveUser } from "@/lib/session";
import { ownProject, removeProjectFiles, sendBackToReview } from "@/lib/work";

const patchSchema = z.union([
  z.object({
    title: z.string().trim().min(2).max(80),
    description: z.string().trim().max(1000).optional(),
  }),
  z.object({ move: z.enum(["up", "down"]) }),
]);

/**
 * Edits a project's text (back to review) or moves it one place in the
 * profile's order (no review: nothing new is shown).
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const user = await requireActiveUser(supabase);
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const db = createAdminClient();
  const project = await ownProject(db, user.id, id);
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  if ("move" in parsed.data) {
    const { data: siblings } = await db
      .from("work_projects")
      .select("id")
      .eq("profile_id", project.profile_id)
      .order("position", { ascending: true })
      .order("created_at", { ascending: true });
    const order = (siblings ?? []).map((s) => s.id);
    const from = order.indexOf(id);
    const to = parsed.data.move === "up" ? from - 1 : from + 1;
    if (from !== -1 && to >= 0 && to < order.length) {
      [order[from], order[to]] = [order[to], order[from]];
      // Renumbering everything also repairs any duplicate positions.
      await Promise.all(order.map((pid, position) => db.from("work_projects").update({ position }).eq("id", pid)));
    }
    return NextResponse.json({ ok: true });
  }

  const { title, description } = parsed.data;
  const { error } = await db.from("work_projects").update({ title, description: description || null }).eq("id", id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  await sendBackToReview(db, { ...project, title });
  return NextResponse.json({ ok: true, status: "pending" });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const user = await requireActiveUser(supabase);
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const db = createAdminClient();
  const project = await ownProject(db, user.id, id);
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  await removeProjectFiles(db, [id], user.id);
  const { error } = await db.from("work_projects").delete().eq("id", id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
