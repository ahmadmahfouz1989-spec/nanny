import { redirect } from "@/i18n/navigation";

/** Points & invites live on the profile page now; old links land there. */
export default async function PointsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  redirect({ href: "/profile#points", locale });
}
