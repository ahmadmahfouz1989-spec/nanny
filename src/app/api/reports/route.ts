import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const bodySchema = z.object({
  reportedProfileId: z.string().uuid(),
  profileType: z.enum(["parent", "nanny"]),
  reason: z.enum(["inappropriate_content", "harassment", "fraud_scam", "fake_profile", "other"]),
  details: z.string().max(1000).optional(),
});

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const table = parsed.data.profileType === "parent" ? "parent_profiles" : "nanny_profiles";
  const { data: profile } = await supabase.from(table).select("user_id").eq("id", parsed.data.reportedProfileId).maybeSingle();

  if (!profile) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }
  if (profile.user_id === user.id) {
    return NextResponse.json({ error: "You cannot report yourself" }, { status: 400 });
  }

  const { error } = await supabase.from("reports").insert({
    reporter_user_id: user.id,
    reported_user_id: profile.user_id,
    reason: parsed.data.reason,
    details: parsed.data.details ?? null,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ status: "reported" }, { status: 201 });
}
