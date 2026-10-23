import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import AppShell from "@/components/app-shell";
import PushNotificationsCard from "@/components/push-notifications-card";
import DeleteAccountCard from "@/components/delete-account-card";
import SettingsRows from "@/components/settings-rows";
import { ChevronIcon, DocumentIcon, WhatsAppIcon } from "@/components/home-icons";
import { SUPPORT_WHATSAPP } from "@/lib/support";
import { ui } from "@/lib/ui";

/** Settings & Help: notifications, look and language, help, and the account. */
export default async function SettingsPage() {
  const t = await getTranslations("Settings");
  const tm = await getTranslations("Menu");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: account } = await supabase.from("users").select("email, phone").eq("id", user!.id).single();

  const row = "flex items-center gap-3 px-5 py-4 text-[15px] text-ink transition-colors hover:bg-surface-sunken";
  const label = "text-xs font-medium uppercase tracking-wide text-muted mb-2 px-1";

  return (
    <AppShell active="profile">
      <div className="max-w-lg w-full mx-auto px-6 py-8">
        <h1 className="font-display text-2xl font-bold mb-6">{t("title")}</h1>

        <PushNotificationsCard />

        <p className={label}>{t("appearance")}</p>
        <div className={ui.card + " mb-5 overflow-hidden"}>
          <SettingsRows />
        </div>

        <p className={label}>{t("help")}</p>
        <div className={ui.card + " mb-5 overflow-hidden divide-y divide-border"}>
          <a href={`https://wa.me/${SUPPORT_WHATSAPP}`} target="_blank" rel="noopener noreferrer" className={row}>
            <WhatsAppIcon className="h-[22px] w-[22px] text-[#25D366]" />
            <span className="flex-1">
              <span className="block">{tm("contactWhatsapp")}</span>
              <span className="block text-xs text-muted">{t("helpBody")}</span>
            </span>
            <ChevronIcon className="h-5 w-5 text-muted" />
          </a>
          <Link href="/terms" className={row}>
            <DocumentIcon className="h-[22px] w-[22px] text-muted" />
            <span className="flex-1">{t("terms")}</span>
            <ChevronIcon className="h-5 w-5 text-muted" />
          </Link>
          <Link href="/privacy" className={row}>
            <DocumentIcon className="h-[22px] w-[22px] text-muted" />
            <span className="flex-1">{t("privacy")}</span>
            <ChevronIcon className="h-5 w-5 text-muted" />
          </Link>
        </div>

        <p className={label}>{t("account")}</p>
        {account?.email ? (
          <DeleteAccountCard identifier={account.email} kind="email" />
        ) : account?.phone ? (
          <DeleteAccountCard identifier={`+${account.phone}`} kind="phone" />
        ) : null}
      </div>
    </AppShell>
  );
}
