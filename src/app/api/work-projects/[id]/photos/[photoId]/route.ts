import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireActiveUser } from "@/lib/session";
import { WORK_BUCKET, isOwnWorkPath, ownProject } from "@/lib/work";

const patchSchema = z.union([
  z.object({ caption: z.string().trim().max(140) }),
  z.object({ move: z.enum(["earlier", "later"]) }),
]);

type Params = { params: Promise<{ id: string; photoId: string }> };

async function context(params: Params["params"]) {
  const { id, photoId } = await params;
  const supabase = await createClient();
  const user = await requireActiveUser(supabase);
  if (!user) return { error: NextResponse.json({ error: "Not authenticated" }, { status: 401 }) };
  const db = createAdminClient();
  const project = await ownProject(db, user.id, id);
  const { data: photo } = project
    ? await db.from("work_photos").select("id, path").eq("id", photoId).eq("project_id", id).maybeSingle()
    : { data: null };
  if (!project || !photo) return { error: NextResponse.json({ error: "Photo not found" }, { status: 404 }) };
  return { db, user, project, photo };
}

/** Changes a caption, or moves the photo one place. */
export async function PATCH(request: Request, { params }: Params) {
  const ctx = await context(params);
  if ("error" in ctx) return ctx.error;
  const { db, project, photo } = ctx;

  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  if ("move" in parsed.data) {
    const { data: siblings } = await db
      .from("work_photos")
      .select("id")
      .eq("project_id", project.id)
      .order("position", { ascending: true })
      .order("created_at", { ascending: true });
    const order = (siblings ?? []).map((s) => s.id);
    const from = order.indexOf(photo.id);
    const to = parsed.data.move === "earlier" ? from - 1 : from + 1;
    if (from !== -1 && to >= 0 && to < order.length) {
      [order[from], order[to]] = [order[to], order[from]];
      await Promise.all(order.map((pid, position) => db.from("work_photos").update({ position }).eq("id", pid)));
    }
    return NextResponse.json({ ok: true });
  }

  const { error } = await db.from("work_photos").update({ caption: parsed.data.caption || null }).eq("id", photo.id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}

/** Removes a photo. */
export async function DELETE(_request: Request, { params }: Params) {
  const ctx = await context(params);
  if ("error" in ctx) return ctx.error;
  const { db, user, photo } = ctx;

  const { error } = await db.from("work_photos").delete().eq("id", photo.id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  if (isOwnWorkPath(photo.path, user.id)) {
    await db.storage.from(WORK_BUCKET).remove([photo.path]).catch(() => {});
  }
  return NextResponse.json({ ok: true });
}
