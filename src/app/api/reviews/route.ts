import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { reviewsForProfile } from "@/lib/ratings";

const querySchema = z.object({
  profileId: z.string().uuid(),
  profileType: z.enum(["parent", "nanny"]),
});

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const parsed = querySchema.safeParse({
    profileId: searchParams.get("profileId"),
    profileType: searchParams.get("profileType"),
  });
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const result = await reviewsForProfile(parsed.data.profileType, parsed.data.profileId);
  if (!result) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }

  // A nanny profile is only ever rated by parents, and vice versa.
  const raterRole = parsed.data.profileType === "parent" ? "nanny" : "parent";

  return NextResponse.json({ ...result, raterRole });
}
