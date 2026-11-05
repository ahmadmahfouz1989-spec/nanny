"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { request } from "@/lib/request";
import { ui } from "@/lib/ui";
import AddPhoneForm from "@/components/add-phone-form";
import { WHATSAPP_AUTH_ENABLED } from "@/components/whatsapp-auth";

/** The one set of personal details behind all of someone's profiles. */
export default function AccountDetailsCard({ name, email, phone }: { name: string | null; email: string | null; phone: string | null }) {
  const t = useTranslations("AccountDetails");
  const router = useRouter();
  const [value, setValue] = useState(name ?? "");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [addingPhone, setAddingPhone] = useState(false);

  const trimmed = value.trim();
  const changed = trimmed !== (name ?? "");

  async function saveName(e: React.FormEvent) {
    e.preventDefault();
    if (trimmed.length < 2 || trimmed.length > 80) {
      setMessage({ ok: false, text: t("nameInvalid") });
      return;
    }
    setSaving(true);
    setMessage(null);
    const res = await request("/api/account", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fullName: trimmed }),
    });
    setSaving(false);
    if (!res || !res.ok) {
      setMessage({ ok: false, text: t("saveFailed") });
      return;
    }
    setMessage({ ok: true, text: t("nameSaved") });
    router.refresh();
  }

  const label = "block text-xs font-medium text-muted mb-1";

  return (
    <div className={ui.card + " mb-5 flex flex-col gap-5 p-5"}>
      <form onSubmit={saveName}>
        <label htmlFor="account-name" className={label}>
          {t("name")}
        </label>
        <div className="flex gap-2">
          <input id="account-name" className={ui.input + " min-w-0 flex-1"} autoComplete="name" maxLength={80} value={value} onChange={(e) => setValue(e.target.value)} />
          {changed && (
            <button type="submit" disabled={saving} className={ui.buttonPrimary + " shrink-0"}>
              {saving ? t("saving") : t("save")}
            </button>
          )}
        </div>
        <p className="mt-1.5 text-xs text-muted">{t("nameHint")}</p>
        {message && <p className={`mt-2 rounded-lg px-3 py-2 text-sm ${message.ok ? "bg-surface-sunken text-ink" : "bg-danger-soft text-danger"}`}>{message.text}</p>}
      </form>

      {email && (
        <div>
          <p className={label}>{t("email")}</p>
          <p className="text-[15px] text-ink break-all">
            <bdi dir="ltr">{email}</bdi>
          </p>
        </div>
      )}

      {(phone || WHATSAPP_AUTH_ENABLED) && (
        <div id="phone">
          <p className={label}>{t("phone")}</p>
          {phone ? (
            <p className="text-[15px] text-ink">
              <bdi dir="ltr">+{phone}</bdi>
            </p>
          ) : addingPhone ? (
            <AddPhoneForm
              onDone={() => {
                setAddingPhone(false);
                router.refresh();
              }}
            />
          ) : (
            <>
              <p className="text-xs text-muted">{t("addPhoneWhy")}</p>
              <button type="button" onClick={() => setAddingPhone(true)} className={ui.buttonSecondary + " mt-2"}>
                {t("addPhone")}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
