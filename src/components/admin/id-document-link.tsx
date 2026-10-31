"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { ui } from "@/lib/ui";

/**
 * For a delivery provider in the review queue: their ID photo, opened
 * through a short-lived private link -- or a warning that there's none.
 * Cleaners' IDs are optional (`optional`): nothing shows without one.
 */
export default function IdDocumentLink({ profileId, optional = false }: { profileId: string; optional?: boolean }) {
  const t = useTranslations("IdDocument");
  const [doc, setDoc] = useState<{ url: string; status: string } | null | undefined>(undefined);

  useEffect(() => {
    let active = true;
    fetch(`/api/admin/id-documents/${profileId}`)
      .then((r) => (r.ok ? r.json() : { document: null }))
      .then((body) => active && setDoc(body.document ?? null))
      .catch(() => active && setDoc(null));
    return () => {
      active = false;
    };
  }, [profileId]);

  if (doc === undefined) return null;
  if (!doc && optional) return null;
  if (!doc) return <p className="mb-3 text-sm font-medium text-danger">{t("adminMissing")}</p>;
  return (
    <p className="mb-3 flex items-center gap-2 text-sm">
      {/* A fresh link each time the queue loads; it stops working after 5 minutes. */}
      <a href={doc.url} target="_blank" rel="noopener noreferrer" className={ui.link + " font-semibold"}>
        {t("adminView")}
      </a>
      <span className="text-muted">· {t(doc.status as "pending" | "approved" | "rejected")}</span>
    </p>
  );
}
