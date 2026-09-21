import { redirect } from "@/i18n/navigation";

// Conversations now live in one place -- see /messages and
// src/lib/inbox.ts -- so this route just forwards old links/bookmarks
// there instead of rendering its own separate, single-category inbox.
export default async function CategoryMessagesPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; slug: string }>;
  searchParams: Promise<{ match?: string }>;
}) {
  const { locale } = await params;
  const { match } = await searchParams;
  redirect({ href: match ? `/messages?match=${match}` : "/messages", locale });
}
