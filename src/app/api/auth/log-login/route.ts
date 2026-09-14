import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { logLoginEvent } from "@/lib/login-log";

// Password sign-in happens client-side, straight against Supabase's own
// auth API (signInWithPassword) -- our server never sees that request.
// The login form calls this immediately after a successful sign-in so
// there's still one authenticated request per login to log from.
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  await logLoginEvent(request, user.id);
  return NextResponse.json({ status: "logged" });
}
