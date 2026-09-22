import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireActiveUser } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { containsContactInfo } from "@/lib/content-filter";
import { getPublicOrigin } from "@/lib/site-url";
import { sendEmail, postReplyEmail, activityEmailsEnabled } from "@/lib/email";
import { postAuthors } from "@/lib/posts";

const createSchema = z.object({
  body: z.string().trim().min(1).max(500),
  parentReplyId: z.string().uuid().optional(),
});

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const user = await requireActiveUser(supabase);

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { data: replies, error } = await supabase
    .from("post_replies")
    .select("id, user_id, body, parent_reply_id, created_at")
    .eq("post_id", id)
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const authorById = await postAuthors(replies ?? []);

  const results = (replies ?? []).map((r) => ({
    ...r,
    authorName: authorById.get(r.user_id)?.fullName ?? null,
    authorPhotoUrl: authorById.get(r.user_id)?.photoUrl ?? null,
    isMine: r.user_id === user.id,
  }));

  return NextResponse.json({ replies: results });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const user = await requireActiveUser(supabase);

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

  const admin = createAdminClient();

  // A reply-to-a-reply's parent has to actually belong to this post --
  // otherwise the client could stitch together replies from two different
  // posts into one fabricated thread.
  let notifyUserId: string | null = null;
  if (parsed.data.parentReplyId) {
    const { data: parentReply } = await admin
      .from("post_replies")
      .select("post_id, user_id")
      .eq("id", parsed.data.parentReplyId)
      .maybeSingle();
    if (!parentReply || parentReply.post_id !== id) {
      return NextResponse.json({ error: "Reply not found" }, { status: 404 });
    }
    notifyUserId = parentReply.user_id;
  }

  const { data: reply, error } = await supabase
    .from("post_replies")
    .insert({ post_id: id, user_id: user.id, body: parsed.data.body, parent_reply_id: parsed.data.parentReplyId ?? null })
    .select("id, user_id, body, parent_reply_id, created_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const { data: post } = await admin.from("posts").select("user_id").eq("id", id).maybeSingle();
  // Notify whoever this reply is actually addressed to: the specific
  // reply's author when nested, otherwise the post's author -- same as
  // how a reply on X notifies the person you replied to, not just OP.
  const recipientId = notifyUserId ?? post?.user_id ?? null;

  if (recipientId && recipientId !== user.id) {
    await admin
      .from("notifications")
      .insert({ user_id: recipientId, type: "post_reply", payload: { post_id: id, reply_id: reply.id } });

    if (activityEmailsEnabled()) {
      const [{ data: recipient }, myAuthors] = await Promise.all([
        admin.from("users").select("email, preferred_language").eq("id", recipientId).single(),
        postAuthors([{ user_id: user.id }]),
      ]);

      if (recipient?.email) {
        const fromName = myAuthors.get(user.id)?.fullName ?? "Someone";
        const locale = recipient.preferred_language === "ar" ? "ar" : "en";
        const postUrl = `${getPublicOrigin(request)}/${locale}/feed`;
        const { subject, html } = postReplyEmail(recipient.preferred_language, fromName, parsed.data.body, postUrl);
        await sendEmail(recipient.email, subject, html);
      }
    }
  }

  return NextResponse.json({ reply: { ...reply, authorName: null, authorPhotoUrl: null, isMine: true } }, { status: 201 });
}
