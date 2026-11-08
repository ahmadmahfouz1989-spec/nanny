import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import type { Metadata } from "next";
import { redirect } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import SignupForm from "./signup-form";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Signup" });
  return { title: `${t("title")} — ouiKnow` };
}

export default async function SignupPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  // Already signed in: nothing to sign up for (same as the login page).
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect({ href: "/feed", locale });

  return (
    <Suspense>
      <SignupForm />
    </Suspense>
  );
}
