import { permanentRedirect } from "@/i18n/navigation";

// Old nanny link -- see ../dashboard/page.tsx.
export default async function MatchesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  permanentRedirect({ href: "/categories/nanny/dashboard", locale });
}
