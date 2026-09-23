import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireActiveUser } from "@/lib/session";
import { listSavedProfiles } from "@/lib/saved-profiles";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

function decodeCursor(raw: string | null): { createdAt: string; id: string } | null {
  if (!raw) return null;
  try {
    const decoded = JSON.parse(Buffer.from(raw, "base64").toString("utf-8"));
    if (typeof decoded?.createdAt === "string" && typeof decoded?.id === "string") return decoded;
    return null;
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  const supabase = await createClient();
  const user = await requireActiveUser(supabase);

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const category = searchParams.get("category");
  const role = searchParams.get("role");
  const limit = Math.min(MAX_LIMIT, Math.max(1, Number(searchParams.get("limit")) || DEFAULT_LIMIT));
  const rawCursor = searchParams.get("cursor");

  if (category && !["nanny", "nursing", "tutoring"].includes(category)) {
    return NextResponse.json({ error: "Invalid category" }, { status: 400 });
  }
  if (role && !["seeking", "offering"].includes(role)) {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  }
  if (rawCursor && decodeCursor(rawCursor) === null) {
    return NextResponse.json({ error: "Invalid cursor" }, { status: 400 });
  }

  const { items, nextCursor } = await listSavedProfiles(supabase, user.id, {
    category: category as "nanny" | "nursing" | "tutoring" | undefined,
    role: role as "seeking" | "offering" | undefined,
    limit,
    cursor: decodeCursor(rawCursor),
  });

  const encodedCursor = nextCursor ? Buffer.from(JSON.stringify(nextCursor)).toString("base64") : null;

  return NextResponse.json({
    items: items.map((item) => ({
      id: item.id,
      savedAt: item.savedAt,
      type: item.type,
      targetProfileId: item.targetProfileId,
      match: item.match,
      profile: item.profile
        ? {
            id: item.profile.id,
            type: item.profile.type,
            category: item.profile.category,
            role: item.profile.role,
            displayName: item.profile.displayName,
            photoUrl: item.profile.photoUrl,
            locationLabel: item.profile.locationLabel,
            attributes: item.profile.attributes,
            rating: item.profile.rating,
          }
        : null,
    })),
    nextCursor: encodedCursor,
  });
}
