import { NextResponse } from "next/server";
import type { createClient } from "@/lib/supabase/server";

/** True when the user has a subscription that hasn't lapsed. */
export async function hasActiveSubscription(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from("users")
    .select("subscribed_until")
    .eq("id", userId)
    .maybeSingle();

  return !!data?.subscribed_until && new Date(data.subscribed_until) > new Date();
}

/** 402 body the client turns into a "Subscribe to connect" prompt. */
export function subscriptionRequiredResponse() {
  return NextResponse.json(
    { error: "subscription_required", message: "Subscribe to connect with your matches." },
    { status: 402 },
  );
}
