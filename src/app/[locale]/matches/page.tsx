import { redirect } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import NannyResults from "./nanny-results";
import FamilyResults from "./family-results";

export default async function MatchesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect({ href: "/login", locale });
  }

  const { data: profile } = await supabase.from("users").select("role").eq("id", user!.id).single();

  if (profile?.role === "parent") return <NannyResults />;
  if (profile?.role === "nanny") return <FamilyResults />;

  redirect({ href: "/dashboard", locale });
}
