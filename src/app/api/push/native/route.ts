import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireActiveUser } from "@/lib/session";

/**
 * Registers/forgets the calling iOS or Android app install for push (see
 * src/lib/native-app.ts and src/lib/native-push.ts). native_push_tokens has
 * no RLS policies (see its migration), so the writes go through the service
 * role after the session check here. Accepted even before APNs/FCM are
 * configured, so installs from before then still get notifications after.
 */

// APNs device tokens are hex; FCM registration tokens are url-safe base64
// with a colon. Anything else is not a real token.
const tokenSchema = z.string().min(32).max(4096).regex(/^[A-Za-z0-9:_-]+$/);

const registerSchema = z.object({
  token: tokenSchema,
  platform: z.enum(["ios", "android"]),
  locale: z.enum(["en", "ar"]),
  // Apps that ring for calls (iOS 1.5 / Android 1.4 and later): the
  // iPhone's PushKit token, and Android saying it can show the call screen.
  voipToken: z.string().regex(/^[0-9a-fA-F]{32,200}$/).optional(),
  ringsCalls: z.boolean().optional(),
});

export async function PUT(request: Request) {
  const supabase = await createClient();
  const user = await requireActiveUser(supabase);
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const parsed = registerSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  // Upsert on token: an install that signs in as someone else moves to
  // that account instead of keeping the old one's notifications.
  const { token, platform, locale, voipToken, ringsCalls } = parsed.data;
  const db = createAdminClient();
  // Older apps send neither: their row is written exactly as before.
  const calls = voipToken || ringsCalls ? { voip_token: voipToken ?? null, rings_calls: !!ringsCalls } : {};
  // A PushKit token moves with the install, like the token itself.
  if (voipToken) await db.from("native_push_tokens").update({ voip_token: null }).eq("voip_token", voipToken).neq("token", token);
  const { error } = await db
    .from("native_push_tokens")
    .upsert(
      { user_id: user.id, token, platform, locale, updated_at: new Date().toISOString(), ...calls },
      { onConflict: "token" },
    );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}

const deleteSchema = z.object({ token: tokenSchema });

export async function DELETE(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const parsed = deleteSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  // Scoped to the caller: a token alone never removes someone else's row.
  const { error } = await createAdminClient()
    .from("native_push_tokens")
    .delete()
    .eq("token", parsed.data.token)
    .eq("user_id", user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
