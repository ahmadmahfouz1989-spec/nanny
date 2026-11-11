import { getTranslations } from "next-intl/server";
import { Link, redirect } from "@/i18n/navigation";
import BrandMark from "@/components/brand-mark";
import { ui } from "@/lib/ui";
import { APP_STORE_URL, inviterOf, playStoreLink, pointsReleased } from "@/lib/points";
import RememberInvite from "./remember-invite";

/**
 * Where an invite link lands (oui-know.com/r/CODE): who invited you, and
 * the way in for each phone. Google Play carries the code into the app by
 * itself; on iPhone the code is shown to type when signing up; on the
 * website it's remembered. Not released yet: straight to the home page.
 */
export default async function InvitePage({ params }: { params: Promise<{ locale: string; code: string }> }) {
  const { locale, code } = await params;
  const inviter = (await pointsReleased()) ? await inviterOf(code) : null;
  if (!inviter) {
    redirect({ href: "/", locale });
    return;
  }
  const t = await getTranslations("Invite");

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center gap-6 bg-background px-6 py-10 text-center">
      <RememberInvite code={inviter.code} />
      <BrandMark />
      <div className="flex flex-col gap-2">
        <h1 className="font-display text-2xl font-bold text-ink">{inviter.firstName ? t("title", { name: inviter.firstName }) : t("titleNoName")}</h1>
        <p className="text-muted">{t("body")}</p>
      </div>

      <div className={ui.card + " w-full p-5"}>
        <p className="text-sm text-muted">{t("codeLabel")}</p>
        <p className="font-display text-3xl font-extrabold tracking-[0.25em] text-ink" dir="ltr">
          {inviter.code}
        </p>
      </div>

      <div className="flex w-full flex-col gap-3">
        <a href={playStoreLink(inviter.code)} className={ui.buttonPrimary + " text-center"}>
          {t("android")}
        </a>
        <a href={APP_STORE_URL} className={ui.buttonSecondary + " text-center"}>
          {t("iphone")}
        </a>
        <p className="text-xs text-muted">{t("iphoneHint", { code: inviter.code })}</p>
        <Link href="/signup" className={ui.link + " text-sm"}>
          {t("web")}
        </Link>
      </div>
    </main>
  );
}
