"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/client";
import { ui } from "@/lib/ui";

const DANGER_BUTTON =
  "inline-flex items-center justify-center rounded-full bg-danger px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 active:scale-[0.98] disabled:opacity-40 disabled:pointer-events-none";

/**
 * Lets a user permanently delete their own account. Deliberately two
 * steps: the button only opens a warning that spells out what is lost,
 * and the final delete stays disabled until the user types their own
 * email (or, for a WhatsApp sign-up with no email, phone number) -- the
 * same thing the server re-checks before deleting anything.
 */
export default function DeleteAccountCard({ identifier, kind }: { identifier: string; kind: "email" | "phone" }) {
  const t = useTranslations("DeleteAccount");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const digits = (s: string) => s.replace(/\D/g, "");
  const confirmed =
    kind === "email"
      ? typed.trim().toLowerCase() === identifier.toLowerCase()
      : digits(typed).length > 0 && digits(typed) === digits(identifier);

  function cancel() {
    setOpen(false);
    setTyped("");
    setError(null);
  }

  async function deleteAccount() {
    if (!confirmed || deleting) return;
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch("/api/account", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: typed.trim() }),
      });
      if (!res.ok) {
        setError(t("error"));
        setDeleting(false);
        return;
      }
      // The account is gone; drop the now-orphaned session too.
      await createClient().auth.signOut();
      router.push("/login?deleted=1");
      router.refresh();
    } catch {
      setError(t("error"));
      setDeleting(false);
    }
  }

  return (
    <div className={ui.card + " p-6 mb-5 border-danger/30"}>
      <p className="text-xs font-medium uppercase tracking-wide text-danger mb-2">{t("title")}</p>

      {!open ? (
        <>
          <p className="text-sm text-muted mb-4">{t("summary")}</p>
          <button type="button" onClick={() => setOpen(true)} className={ui.buttonSecondary + " text-danger!"}>
            {t("open")}
          </button>
        </>
      ) : (
        <div className="flex flex-col gap-4">
          <div role="alert" className="rounded-xl bg-danger-soft p-4 text-sm text-danger flex flex-col gap-2">
            <p className="font-semibold">{t("warningTitle")}</p>
            <p>{t("warningBody")}</p>
            <ul className="list-disc ps-5 flex flex-col gap-0.5">
              <li>{t("lossProfiles")}</li>
              <li>{t("lossConversations")}</li>
              <li>{t("lossRatings")}</li>
              <li>{t("lossPosts")}</li>
              <li>{t("lossFeatured")}</li>
            </ul>
            <p>{t("reportsKept")}</p>
          </div>

          <label className="flex flex-col gap-1.5 text-sm">
            <span>{kind === "email" ? t("confirmLabel") : t("confirmLabelPhone")}</span>
            <span className="font-medium" dir="ltr">
              {identifier}
            </span>
            <input
              type={kind === "email" ? "email" : "tel"}
              dir="ltr"
              autoComplete="off"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder={identifier}
              className={ui.input}
            />
          </label>

          {error && <p className="text-sm text-danger">{error}</p>}

          <div className="flex flex-wrap items-center gap-3">
            <button type="button" onClick={deleteAccount} disabled={!confirmed || deleting} className={DANGER_BUTTON}>
              {deleting ? t("deleting") : t("confirm")}
            </button>
            <button type="button" onClick={cancel} disabled={deleting} className={ui.buttonGhost}>
              {t("cancel")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
