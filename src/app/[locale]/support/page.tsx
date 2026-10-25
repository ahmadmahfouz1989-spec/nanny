import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import BrandMark from "@/components/brand-mark";
import { ui } from "@/lib/ui";
import { SUPPORT, SUPPORT_WHATSAPP } from "@/lib/support";

export const metadata: Metadata = { title: "Help & support — ouiKnow" };

export default async function SupportPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const tNav = await getTranslations("Nav");
  const doc = SUPPORT[locale === "ar" ? "ar" : "en"];

  return (
    <main className="oui-in mx-auto w-full max-w-2xl px-6 pb-12 pt-[calc(3rem+env(safe-area-inset-top))]">
      <div className="mb-8">
        <BrandMark />
      </div>

      <h1 className="font-display text-3xl font-bold">{doc.title}</h1>
      <p className="mt-4 text-sm text-ink/80">{doc.intro}</p>
      <a
        href={`https://wa.me/${SUPPORT_WHATSAPP}`}
        target="_blank"
        rel="noopener noreferrer"
        className={ui.buttonPrimary + " mt-5"}
      >
        {doc.contact}
      </a>
      <p className="mt-2 text-xs text-muted" dir="ltr">
        +{SUPPORT_WHATSAPP}
      </p>

      <div className="mt-10 flex flex-col gap-6">
        {doc.sections.map((s) => (
          <section key={s.heading}>
            <h2 className="font-display text-lg font-bold">{s.heading}</h2>
            <p className="mt-1.5 text-sm leading-relaxed text-muted">{s.body}</p>
          </section>
        ))}
      </div>

      <div className="mt-12 flex gap-5 border-t border-border pt-6 text-sm">
        <Link href="/privacy" className="text-primary hover:underline">
          {tNav("privacy")}
        </Link>
        <Link href="/terms" className="text-primary hover:underline">
          {tNav("terms")}
        </Link>
        <Link href="/" className="text-primary hover:underline">
          {tNav("backToHome")}
        </Link>
      </div>
    </main>
  );
}
