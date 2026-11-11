import { notFound } from "next/navigation";
import { redirect } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import AppShell from "@/components/app-shell";
import { canSeePoints, pointsReleased, pointsRules, wallet } from "@/lib/points";
import PointsWallet from "./points-wallet";

/**
 * Points & invites: the balance and where it came from, a personal invite
 * link to share, who joined with it, how to earn more. Hidden until the
 * team releases it (admins see it before, to set it up).
 */
export default async function PointsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect({ href: "/login?next=/points", locale });
    return;
  }
  if (!(await canSeePoints(user.id))) notFound();

  const [w, rules, released] = await Promise.all([wallet(user.id), pointsRules(), pointsReleased()]);
  return (
    <AppShell active="profile">
      <PointsWallet wallet={w} rules={rules.filter((r) => r.enabled && r.points > 0)} preview={!released} />
    </AppShell>
  );
}
