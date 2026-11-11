import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { canSeePoints, wallet } from "@/lib/points";

/** The signed-in person's points wallet (hidden until released, except for admins). */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!(await canSeePoints(user.id))) return NextResponse.json({ error: "Not available" }, { status: 404 });
  return NextResponse.json({ wallet: await wallet(user.id) });
}
