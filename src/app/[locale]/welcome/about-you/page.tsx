import { redirect } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { accountBasics } from "@/lib/account-basics";
import { safeReturnPath } from "@/lib/return-path";
import AppShell from "@/components/app-shell";
import AboutYouForm from "./about-you-form";

/**
 * "About you": the basics every account gives once, right after signing up
 * (name, phone, nationality, an optional photo), then on to `next` -- the
 * welcome question by default, or the service form that sent them here.
 * Also where Settings sends them to change these.
 */
export default async function AboutYouPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ next?: string }>;
}) {
  const { locale } = await params;
  const { next } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect({ href: "/login", locale });
    return;
  }
  const basics = await accountBasics(createAdminClient(), user.id);
  return (
    <AppShell active="profile">
      <div className="mx-auto w-full max-w-lg px-4 py-6 sm:px-6 sm:py-10">
        <AboutYouForm initial={basics} next={safeReturnPath(next ?? null) ?? "/welcome"} />
      </div>
    </AppShell>
  );
}
