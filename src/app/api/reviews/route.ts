import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { reviewsForProfile, reviewsForGenericProfile } from "@/lib/ratings";

const querySchema = z.object({
  profileId: z.string().uuid(),
  profileType: z.enum(["parent", "nanny", "generic"]),
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

  const { profileId, profileType } = parsed.data;

  if (profileType === "generic") {
    const result = await reviewsForGenericProfile(profileId);
    if (!result) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }
    // Ratings are per-account, not per-category (see ratingAggregatesByUser)
    // -- a generic profile's reviews can come from any category or role, so
    // there's no single "rater role" to label them with the way a nanny
    // profile is always rated by parents specifically.
    return NextResponse.json({ ...result, raterRole: null });
  }

  const result = await reviewsForProfile(profileType, profileId);
  if (!result) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }

  // A nanny profile is only ever rated by parents, and vice versa.
  const raterRole = profileType === "parent" ? "nanny" : "parent";

  return NextResponse.json({ ...result, raterRole });
}
