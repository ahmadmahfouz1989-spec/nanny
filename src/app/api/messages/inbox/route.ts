import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { data: profile } = await supabase.from("users").select("role").eq("id", user.id).single();
  const role = profile?.role;

  if (role !== "parent" && role !== "nanny") {
    return NextResponse.json({ conversations: [] });
  }

  const ownProfileTable = role === "parent" ? "parent_profiles" : "nanny_profiles";
  const { data: ownProfile } = await supabase.from(ownProfileTable).select("id").eq("user_id", user.id).maybeSingle();

  if (!ownProfile) {
    return NextResponse.json({ conversations: [] });
  }

  const matchColumn = role === "parent" ? "parent_profile_id" : "nanny_profile_id";
  const { data: matches } = await supabase
    .from("matches")
    .select(
      role === "parent"
        ? "id, nanny_profiles(id, full_name, profile_photo_url)"
        : "id, parent_profiles(id, full_name)",
    )
    .eq(matchColumn, ownProfile.id)
    .eq("status", "mutual");

  if (!matches || matches.length === 0) {
    return NextResponse.json({ conversations: [] });
  }

  const matchIds = matches.map((m) => m.id);
  const { data: allMessages } = await supabase
    .from("messages")
    .select("id, match_id, sender_id, body, created_at, read_at")
    .in("match_id", matchIds)
    .order("created_at", { ascending: true });

  const conversations = matches.map((m) => {
    const msgs = (allMessages ?? []).filter((msg) => msg.match_id === m.id);
    const lastMessage = msgs[msgs.length - 1] ?? null;
    const unreadCount = msgs.filter((msg) => msg.sender_id !== user.id && !msg.read_at).length;
    const counterpart =
      role === "parent"
        ? (m as unknown as { nanny_profiles: { id: string; full_name: string; profile_photo_url: string | null } })
            .nanny_profiles
        : (m as unknown as { parent_profiles: { id: string; full_name: string } }).parent_profiles;

    return {
      matchId: m.id,
      counterpart: {
        name: counterpart?.full_name ?? "",
        photoUrl: role === "parent" ? (counterpart as { profile_photo_url?: string | null })?.profile_photo_url ?? null : null,
      },
      lastMessage: lastMessage ? { body: lastMessage.body, createdAt: lastMessage.created_at } : null,
      unreadCount,
    };
  });

  conversations.sort((a, b) => {
    const aTime = a.lastMessage?.createdAt ?? "";
    const bTime = b.lastMessage?.createdAt ?? "";
    return bTime.localeCompare(aTime);
  });

  return NextResponse.json({ conversations });
}
