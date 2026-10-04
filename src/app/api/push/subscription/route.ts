import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireActiveUser } from "@/lib/session";
import { pushEnabled } from "@/lib/push";

/**
 * Turns push on/off for the calling device. push_subscriptions has no RLS
 * policies (see its migration), so the writes go through the service role
 * after the session check here.
 */

// Push services are https endpoints run by the browser vendor; anything
// else is not a real subscription.
const subscriptionSchema = z.object({
  endpoint: z.string().url().startsWith("https://").max(2000),
  keys: z.object({ p256dh: z.string().min(1).max(200), auth: z.string().min(1).max(100) }),
  locale: z.enum(["en", "ar"]),
});

export async function PUT(request: Request) {
  if (!pushEnabled()) {
    return NextResponse.json({ error: "Push notifications are not configured" }, { status: 503 });
  }

  const supabase = await createClient();
  const user = await requireActiveUser(supabase);
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const parsed = subscriptionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  // Upsert on endpoint: a device that signs in as someone else moves to
  // that account instead of keeping the old one's notifications.
  const { endpoint, keys, locale } = parsed.data;
  const { error } = await createAdminClient()
    .from("push_subscriptions")
    .upsert(
      { user_id: user.id, endpoint, p256dh: keys.p256dh, auth: keys.auth, locale, updated_at: new Date().toISOString() },
      { onConflict: "endpoint" },
    );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}

const deleteSchema = z.object({ endpoint: z.string().max(2000) });

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

  // Scoped to the caller: an endpoint alone never removes someone else's row.
  const { error } = await createAdminClient()
    .from("push_subscriptions")
    .delete()
    .eq("endpoint", parsed.data.endpoint)
    .eq("user_id", user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
