import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { signupSchema } from "@/lib/validation/auth";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = signupSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { role, email, password, preferredLanguage } = parsed.data;
  const supabase = await createClient();
  const metadata = { role, preferred_language: preferredLanguage };

  const { data, error } = await supabase.auth.signUp({ email, password, options: { data: metadata } });

  if (error) {
    // Supabase returns a generic-enough message; avoid echoing raw provider errors
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ user: data.user }, { status: 201 });
}
