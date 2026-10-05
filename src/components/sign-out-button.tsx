"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/client";
import { disablePush } from "@/lib/push-client";
import { ui } from "@/lib/ui";

export default function SignOutButton() {
  const t = useTranslations("Nav");
  const router = useRouter();

  async function handleSignOut() {
    // Stop this device getting the account's notifications once signed out
    // (needs the session, so before signOut).
    await disablePush().catch(() => {});
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <button onClick={handleSignOut} className={ui.buttonGhost + " whitespace-nowrap"}>
      {t("logout")}
    </button>
  );
}
