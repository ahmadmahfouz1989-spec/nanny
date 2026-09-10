import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import BrandMark from "@/components/brand-mark";
import { TERMS } from "@/lib/legal";

export const metadata: Metadata = { title: "Terms of Service — ouiKnow" };

export default async function TermsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const tNav = await getTranslations("Nav");
  const doc = TERMS[locale === "ar" ? "ar" : "en"];

  return (
    <main className="oui-in mx-auto w-full max-w-2xl px-6 py-12">
      <div className="mb-8">
        <BrandMark />
      </div>

      <h1 className="font-display text-3xl font-bold">{doc.title}</h1>
      <p className="mt-1 text-xs text-muted">{doc.updated}</p>
      <p className="mt-6 text-sm text-ink/80">{doc.intro}</p>

      <div className="mt-8 flex flex-col gap-6">
        {doc.sections.map((s) => (
          <section key={s.heading}>
            <h2 className="font-display text-lg font-bold">{s.heading}</h2>
            <p className="mt-1.5 text-sm leading-relaxed text-muted">{s.body}</p>
          </section>
        ))}
      </div>

      <div className="mt-12 border-t border-border pt-6">
        <Link href="/" className="text-sm text-primary hover:underline">
          {tNav("backToHome")}
        </Link>
      </div>
    </main>
  );
}
