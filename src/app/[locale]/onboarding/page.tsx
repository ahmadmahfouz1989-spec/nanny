import { permanentRedirect } from "@/i18n/navigation";

// Old nanny link -- nanny onboards through the shared category flow now.
export default async function OnboardingPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  permanentRedirect({ href: "/categories/nanny/onboarding", locale });
}
