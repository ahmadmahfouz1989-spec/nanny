import { redirect } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import AppShell from "@/components/app-shell";
import Discover from "@/components/discover/discover";
import FeedClient from "./feed-client";

// Home: finding a service first (Discover), then the shared timeline,
// open to any authenticated account regardless of category or role.
export default async function FeedPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ post?: string; reply?: string; compose?: string }>;
}) {
  const { locale } = await params;
  const { post, reply, compose } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect({ href: "/login", locale });
  }

  return (
    <AppShell active="feed">
      <FeedClient targetPostId={post ?? null} targetReplyId={reply ?? null} compose={!!compose} intro={<Discover />} />
    </AppShell>
  );
}
