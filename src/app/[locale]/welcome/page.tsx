import { getTranslations } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCategories } from "@/lib/categories";
import AppShell from "@/components/app-shell";
import WelcomeClient from "./welcome-client";

/**
 * The first screen after signing up: what brings you here (need help or
 * offer help), then which service -- which opens that service's form for
 * that side directly. Someone who already has a profile has answered
 * this, so goes to Home.
 */
export default async function WelcomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect({ href: "/login", locale });
    return;
  }
  const { count } = await supabase
    .from("generic_profiles")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .neq("status", "draft");
  if (count) {
    redirect({ href: "/feed", locale });
    return;
  }

  const t = await getTranslations("Welcome");
  const live = (await getCategories()).filter((c) => c.status === "live" && c.href);

  return (
    <AppShell active="feed">
      <div className="mx-auto w-full max-w-lg px-4 py-6 sm:px-6 sm:py-10">
        <WelcomeClient
          categories={live.map((c) => ({ slug: c.slug, icon: c.icon, name: locale === "ar" ? c.name_ar : c.name_en }))}
          title={t("title")}
        />
      </div>
    </AppShell>
  );
}
