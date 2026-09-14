import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveMatchAccess } from "@/lib/matching/access";
import { applyInterest } from "@/lib/matching/apply-interest";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const access = await resolveMatchAccess(supabase, id, user.id);
  if (!access) {
    return NextResponse.json({ error: "Match not found" }, { status: 404 });
  }

  return applyInterest(request, access);
}
