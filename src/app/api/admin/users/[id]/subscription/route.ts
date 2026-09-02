import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/admin/auth";

const bodySchema = z.object({
  plan: z.enum(["monthly", "yearly"]),
  note: z.string().trim().max(500).optional(),
});

const DAYS: Record<"monthly" | "yearly", number> = { monthly: 30, yearly: 365 };

// Activate (or extend) a user's subscription after an off-app Whish payment.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const admin = await requireAdmin(supabase);
  if (!admin) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const db = createAdminClient();
  const { data: target } = await db
    .from("users")
    .select("id, subscribed_until")
    .eq("id", id)
    .maybeSingle();

  if (!target) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  // Extend from whichever is later: now, or the current expiry.
  const now = new Date();
  const current = target.subscribed_until ? new Date(target.subscribed_until) : now;
  const base = current > now ? current : now;
  const expiresAt = new Date(base.getTime() + DAYS[parsed.data.plan] * 86400000);

  const { error: updateError } = await db
    .from("users")
    .update({ subscribed_until: expiresAt.toISOString() })
    .eq("id", id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 400 });
  }

  await db.from("subscription_grants").insert({
    user_id: id,
    plan: parsed.data.plan,
    granted_by: admin.userId,
    starts_at: base.toISOString(),
    expires_at: expiresAt.toISOString(),
    note: parsed.data.note ?? null,
  });

  return NextResponse.json({ subscribed_until: expiresAt.toISOString() });
}

// Revoke immediately.
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const admin = await requireAdmin(supabase);
  if (!admin) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const db = createAdminClient();
  const { data, error } = await db
    .from("users")
    .update({ subscribed_until: null })
    .eq("id", id)
    .select("id")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  if (!data) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  return NextResponse.json({ subscribed_until: null });
}
