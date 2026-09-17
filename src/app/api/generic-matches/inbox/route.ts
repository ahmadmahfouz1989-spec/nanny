import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * The generic-category equivalent of /api/messages/inbox, scoped to one
 * category. v1 doesn't unify this with the nanny inbox -- see the plan's
 * messaging scope note -- so nursing gets its own conversation list here.
 */
export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const categorySlug = searchParams.get("categorySlug");
  if (!categorySlug) {
    return NextResponse.json({ error: "categorySlug is required" }, { status: 400 });
  }

  const { data: category } = await supabase.from("categories").select("id").eq("slug", categorySlug).maybeSingle();
  if (!category) {
    return NextResponse.json({ conversations: [] });
  }

  const { data: myProfile } = await supabase
    .from("generic_profiles")
    .select("id, role")
    .eq("user_id", user.id)
    .eq("category_id", category.id)
    .maybeSingle();

  if (!myProfile) {
    return NextResponse.json({ conversations: [] });
  }

  const column = myProfile.role === "seeker" ? "seeker_profile_id" : "provider_profile_id";
  const otherIdOf = (m: { seeker_profile_id: string; provider_profile_id: string }) =>
    myProfile.role === "seeker" ? m.provider_profile_id : m.seeker_profile_id;

  const { data: matches } = await supabase
    .from("generic_matches")
    .select("id, seeker_profile_id, provider_profile_id")
    .eq(column, myProfile.id)
    .eq("status", "mutual");

  if (!matches || matches.length === 0) {
    return NextResponse.json({ conversations: [] });
  }

  const otherIds = matches.map(otherIdOf);
  const { data: otherProfiles } = await supabase.from("generic_profiles").select("id, full_name").in("id", otherIds);
  const otherById = new Map((otherProfiles ?? []).map((p) => [p.id, p]));

  const matchIds = matches.map((m) => m.id);
  const { data: allMessages } = await supabase
    .from("generic_messages")
    .select("id, match_id, sender_id, body, created_at, read_at")
    .in("match_id", matchIds)
    .order("created_at", { ascending: true });

  const conversations = matches.map((m) => {
    const msgs = (allMessages ?? []).filter((msg) => msg.match_id === m.id);
    const lastMessage = msgs[msgs.length - 1] ?? null;
    const unreadCount = msgs.filter((msg) => msg.sender_id !== user.id && !msg.read_at).length;
    const other = otherById.get(otherIdOf(m));

    return {
      matchId: m.id,
      counterpart: { id: other?.id ?? "", name: other?.full_name ?? "" },
      lastMessage: lastMessage ? { body: lastMessage.body, createdAt: lastMessage.created_at } : null,
      unreadCount,
    };
  });

  conversations.sort((a, b) => (b.lastMessage?.createdAt ?? "").localeCompare(a.lastMessage?.createdAt ?? ""));

  return NextResponse.json({ role: myProfile.role, conversations });
}
