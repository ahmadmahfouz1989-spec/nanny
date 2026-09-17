import { redirect } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import AppShell from "@/components/app-shell";
import GenericMessagesClient from "./generic-messages-client";

export default async function CategoryMessagesPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect({ href: "/login", locale });
  }

  const { data: category } = await supabase.from("categories").select("status").eq("slug", slug).maybeSingle();
  if (!category || category.status !== "live") {
    redirect({ href: "/categories", locale });
  }

  return (
    <AppShell active="nursing" showNursing>
      <GenericMessagesClient categorySlug={slug} />
    </AppShell>
  );
}
