import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import BrandMark from "@/components/brand-mark";
import { ui } from "@/lib/ui";

/** A page that doesn't exist (or a link that's gone): say so, and offer a way on. */
export default async function NotFound() {
  const t = await getTranslations("NotFound");
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-background px-6 text-center">
      <BrandMark />
      <h1 className="text-2xl font-bold text-ink">{t("title")}</h1>
      <p className="max-w-sm text-sm text-muted">{t("body")}</p>
      <div className="flex flex-wrap justify-center gap-2">
        <Link href="/" className={ui.buttonPrimary}>
          {t("home")}
        </Link>
        <Link href="/categories" className={ui.buttonSecondary}>
          {t("services")}
        </Link>
      </div>
    </main>
  );
}
