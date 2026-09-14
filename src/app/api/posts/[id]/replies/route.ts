import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { containsContactInfo } from "@/lib/content-filter";
import { getPublicOrigin } from "@/lib/site-url";
import { sendEmail, postReplyEmail } from "@/lib/email";

const createSchema = z.object({ body: z.string().trim().min(1).max(500) });

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { data: replies, error } = await supabase
    .from("post_replies")
    .select("id, user_id, body, created_at")
    .eq("post_id", id)
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const admin = createAdminClient();
  const userIds = [...new Set((replies ?? []).map((r) => r.user_id))];
  const { data: names } =
    userIds.length > 0
      ? await admin
          .from("users")
          .select("id, role, parent_profiles(full_name), nanny_profiles(full_name)")
          .in("id", userIds)
      : { data: [] as never[] };

  const nameById = new Map(
    (names ?? []).map((n) => {
      const parent = n.parent_profiles as unknown as { full_name: string } | null;
      const nanny = n.nanny_profiles as unknown as { full_name: string } | null;
      return [n.id, parent?.full_name ?? nanny?.full_name ?? null];
    }),
  );

  const results = (replies ?? []).map((r) => ({
    ...r,
    authorName: nameById.get(r.user_id) ?? null,
    isMine: r.user_id === user.id,
  }));

  return NextResponse.json({ replies: results });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  if (containsContactInfo(parsed.data.body)) {
    return NextResponse.json(
      { error: "Please remove phone numbers, emails, or social handles. Contact details are only shared once you match." },
      { status: 400 },
    );
  }

  const { data: reply, error } = await supabase
    .from("post_replies")
    .insert({ post_id: id, user_id: user.id, body: parsed.data.body })
    .select("id, user_id, body, created_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: post } = await admin.from("posts").select("user_id").eq("id", id).maybeSingle();

  if (post && post.user_id !== user.id) {
    await admin
      .from("notifications")
      .insert({ user_id: post.user_id, type: "post_reply", payload: { post_id: id, reply_id: reply.id } });

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
      const { subject, html } = postReplyEmail(recipient.preferred_language, fromName, parsed.data.body, postUrl);
      await sendEmail(recipient.email, subject, html);
    }
  }

  return NextResponse.json({ reply: { ...reply, authorName: null, isMine: true } }, { status: 201 });
}
