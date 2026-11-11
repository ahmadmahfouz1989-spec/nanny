import OfflineBar from "@/components/shell/offline-bar";
import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import Script from "next/script";
import { Baloo_2, Cairo, Plus_Jakarta_Sans } from "next/font/google";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { routing } from "@/i18n/routing";
import ServiceWorkerRegister from "@/components/service-worker-register";
import NativeAppBridge from "@/components/native-app-bridge";
import LanguageChooser from "@/components/language-chooser";
import { LANGUAGE_ASK_SCRIPT } from "@/lib/language-ask";
import MetaPixel from "@/components/meta-pixel";
import "../globals.css";

const THEME_INIT_SCRIPT = `
(function () {
  try {
    var t = localStorage.getItem('theme');
    if (t === 'light' || t === 'dark') {
      document.documentElement.setAttribute('data-theme', t);
    }
  } catch (e) {}
})();
`;

// One typeface for English (body and headings) and one for Arabic; Baloo
// only draws the "ouiKnow" wordmark.
const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

const baloo = Baloo_2({
  variable: "--font-baloo",
  subsets: ["latin"],
  weight: ["600", "700"],
});

const cairo = Cairo({
  variable: "--font-cairo",
  subsets: ["arabic", "latin"],
  // 400/500 too: Arabic pages set all body text in Cairo, and without
  // them labels, hints and placeholders fell back to the system font.
  weight: ["400", "500", "600", "700", "800"],
});

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Home" });
  return {
    title: `ouiKnow — ${t("subhead")}`,
    description: t("subhead"),
    appleWebApp: {
      capable: true,
      title: "ouiKnow",
      statusBarStyle: "default",
    },
  };
}

// viewportFit "cover" lets the installed app draw under the notch / home
// indicator; app-shell pads its fixed bars with env(safe-area-inset-*).
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fbf8f4" },
    { media: "(prefers-color-scheme: dark)", color: "#1b1712" },
  ],
};

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }
  setRequestLocale(locale);

  const dir = locale === "ar" ? "rtl" : "ltr";

  return (
    <html
      lang={locale}
      dir={dir}
      className={`${jakarta.variable} ${baloo.variable} ${cairo.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col bg-background text-ink font-sans">
        <Script id="theme-init" strategy="beforeInteractive">
          {THEME_INIT_SCRIPT}
        </Script>
        <Script id="lang-ask" strategy="beforeInteractive">
          {LANGUAGE_ASK_SCRIPT}
        </Script>
        <ServiceWorkerRegister />
        <NativeAppBridge />
        {/* Reads the search query, which needs a Suspense boundary. */}
        <Suspense fallback={null}>
          <MetaPixel />
        </Suspense>
        <NextIntlClientProvider>
          {children}
          <LanguageChooser />
          <OfflineBar />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
