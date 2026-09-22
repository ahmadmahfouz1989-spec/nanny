import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireActiveUser } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPublicOrigin } from "@/lib/site-url";
import { sendEmail, postLikeEmail } from "@/lib/email";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const user = await requireActiveUser(supabase);

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { data: existing } = await supabase
    .from("post_likes")
    .select("post_id")
    .eq("post_id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase.from("post_likes").delete().eq("post_id", id).eq("user_id", user.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ liked: false });
  }

  const { error } = await supabase.from("post_likes").insert({ post_id: id, user_id: user.id });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: post } = await admin.from("posts").select("user_id").eq("id", id).maybeSingle();

  if (post && post.user_id !== user.id) {
    await admin.from("notifications").insert({ user_id: post.user_id, type: "post_like", payload: { post_id: id } });

    const [{ data: recipient }, { data: myProfile }] = await Promise.all([
      admin.from("users").select("email, preferred_language").eq("id", post.user_id).single(),
      admin
        .from("users")
        .select("role, parent_profiles(full_name), nanny_profiles(full_name)")
        .eq("id", user.id)
        .single(),
    ]);

    if (recipient?.email) {
      const parent = myProfile?.parent_profiles as unknown as { full_name: string } | null;
      const nanny = myProfile?.nanny_profiles as unknown as { full_name: string } | null;
      const fromName = parent?.full_name ?? nanny?.full_name ?? "Someone";
      const locale = recipient.preferred_language === "ar" ? "ar" : "en";
      const postUrl = `${getPublicOrigin(request)}/${locale}/feed`;
      const { subject, html } = postLikeEmail(recipient.preferred_language, fromName, postUrl);
      await sendEmail(recipient.email, subject, html);
    }
  }

  return NextResponse.json({ liked: true });
}
