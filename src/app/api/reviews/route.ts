import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireActiveUser } from "@/lib/session";
import { reviewsForProfile, reviewsForGenericProfile } from "@/lib/ratings";

const querySchema = z.object({
  profileId: z.string().uuid(),
  profileType: z.enum(["parent", "nanny", "generic"]),
});

export async function GET(request: Request) {
  const supabase = await createClient();
  const user = await requireActiveUser(supabase);

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

  const { profileId, profileType } = parsed.data;

  // Each review carries its own rater label (see ReviewRater) -- ratings
  // are per-account, so a profile's reviews can come from any category.
  const result =
    profileType === "generic"
      ? await reviewsForGenericProfile(profileId)
      : await reviewsForProfile(profileType, profileId);
  if (!result) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }

  return NextResponse.json(result);
}
