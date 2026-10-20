import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireActiveUser } from "@/lib/session";
import { containsContactInfo } from "@/lib/content-filter";
import { ownProject } from "@/lib/work";

/**
 * Shares one of the caller's work projects to the feed, once: an
 * "Offering" post under that profile, captioned with the project's title
 * and description, showing its photos (see decoratePosts). Written with
 * the caller's own session, so the posts RLS and the database's own-
 * project check (posts_protect_work_project) both apply.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
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

  const [{ count: photoCount }, { data: existing }, { data: details }] = await Promise.all([
    db.from("work_photos").select("id", { count: "exact", head: true }).eq("project_id", id),
    db.from("posts").select("id").eq("work_project_id", id).maybeSingle(),
    db.from("work_projects").select("description").eq("id", id).single(),
  ]);
  if (!photoCount) {
    return NextResponse.json({ error: "needs_photo" }, { status: 400 });
  }
  if (existing) {
    return NextResponse.json({ error: "already_shared" }, { status: 409 });
  }

  const caption = [project.title, details?.description?.trim()].filter(Boolean).join("\n\n").slice(0, 500);
  if (containsContactInfo(caption)) {
    return NextResponse.json({ error: "contact_info" }, { status: 400 });
  }

  const { data: post, error } = await supabase
    .from("posts")
    .insert({
      user_id: user.id,
      kind: "offering",
      caption,
      posted_as_generic_profile_id: project.profile_id,
      work_project_id: id,
    })
    .select("id")
    .single();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ postId: post.id });
}
