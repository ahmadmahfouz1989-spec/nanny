"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { ShieldCheckIcon } from "@/components/home-icons";
import { ui } from "@/lib/ui";

type Status = "pending" | "approved" | "rejected" | null;

/**
 * Photo of an ID or driving licence: required for delivery & errands
 * providers, optional for cleaners (`optional`), who get "ID checked". Uploaded straight away (privately -- only admins see it) and
 * reported through `onStatus`, so the form can tell it's there. Shows
 * whether it's waiting for review or already checked.
 */
export default function IdDocumentField({
  profileId,
  onStatus,
  error,
  optional = false,
}: {
  profileId: string;
  onStatus: (status: Status) => void;
  error?: boolean;
  optional?: boolean;
}) {
  const t = useTranslations("IdDocument");
  const inputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<Status>(null);
  const [uploading, setUploading] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetch(`/api/id-document?profileId=${profileId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => {
        if (!active) return;
        setStatus(body?.status ?? null);
        onStatus(body?.status ?? null);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileId]);

  async function upload(file: File) {
    setUploading(true);
    setFailed(null);
    const form = new FormData();
    form.append("file", file);
    form.append("genericProfileId", profileId);
    const res = await fetch("/api/id-document", { method: "POST", body: form }).catch(() => null);
    setUploading(false);
    if (!res || !res.ok) {
      const body = await res?.json().catch(() => null);
      setFailed(body?.error === "File too large (max 10MB)" ? t("tooLarge") : t("failed"));
      return;
    }
    setStatus("pending");
    onStatus("pending");
  }

  return (
    <div className={`flex flex-col gap-2 rounded-2xl border p-3 ${error && !status ? "border-danger" : "border-border"}`}>
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-secondary-soft text-secondary">
          <ShieldCheckIcon className="h-5 w-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold">{t("title")}</span>
          <span className="block text-xs text-muted">{t(optional ? "whyOptional" : "why")}</span>
        </span>
      </div>
      {status && (
        <p className={`text-sm font-medium ${status === "approved" ? "text-success" : status === "rejected" ? "text-danger" : "text-ink/80"}`}>
          {t(status)}
        </p>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void upload(file);
          e.target.value = "";
        }}
      />
      <button type="button" onClick={() => inputRef.current?.click()} disabled={uploading} className={ui.buttonSecondary + " self-start"}>
        {uploading ? t("uploading") : status ? t("replace") : t("upload")}
      </button>
      {failed && <p className="text-xs text-danger">{failed}</p>}
      {error && !status && (
        <p data-field-error className="text-xs font-medium text-danger" role="alert">
          {t("required")}
        </p>
      )}
    </div>
  );
}
