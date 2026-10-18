import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireActiveUser } from "@/lib/session";
import { MAX_PROJECTS_PER_PROFILE, ownProviderProfile } from "@/lib/work";

const createSchema = z.object({
  profileId: z.uuid(),
  title: z.string().trim().min(2).max(80),
  description: z.string().trim().max(1000).optional(),
});

/**
 * Starts a work project on one of the caller's provider profiles. It has
 * no photos yet, so nobody sees it and admins aren't told until the first
 * photo arrives (see sendBackToReview).
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const user = await requireActiveUser(supabase);
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { profileId, title, description } = parsed.data;

  const db = createAdminClient();
  if (!(await ownProviderProfile(db, user.id, profileId))) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }

  const { data: existing } = await db
    .from("work_projects")
    .select("position")
    .eq("profile_id", profileId)
    .order("position", { ascending: false });
  if ((existing?.length ?? 0) >= MAX_PROJECTS_PER_PROFILE) {
    return NextResponse.json({ error: "too_many_projects" }, { status: 400 });
  }

  const { data: project, error } = await db
    .from("work_projects")
    .insert({
      profile_id: profileId,
      user_id: user.id,
      title,
      description: description || null,
      position: (existing?.[0]?.position ?? -1) + 1,
    })
    .select("id, title, description, status")
    .single();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ project: { ...project, photos: [] } });
}
