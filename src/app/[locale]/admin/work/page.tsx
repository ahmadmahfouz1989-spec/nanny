"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { ui } from "@/lib/ui";
import AdminPageHeader from "@/components/admin/admin-page-header";
import { getJson, request } from "@/lib/request";

type QueueProject = {
  id: string;
  title: string;
  description: string | null;
  profile_id: string;
  generic_profiles: { full_name: string; categories: { name_en: string; name_ar: string } | null } | null;
  work_photos: { id: string; url: string; caption: string | null }[];
};

/**
 * Work projects waiting for review. Approving puts one on its profile;
 * sending it back keeps it hidden and tells the owner what to change.
 */
export default function AdminWorkPage() {
  const t = useTranslations("Admin");
  const locale = useLocale();
  const [projects, setProjects] = useState<QueueProject[] | null>(null);
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getJson<{ projects: QueueProject[] }>("/api/admin/work").then((body) => setProjects(body?.projects ?? []));
  }, []);

  async function decide(project: QueueProject, status: "approved" | "rejected") {
    setSubmitting(project.id);
    setError(null);
    const res = await request(`/api/admin/work/${project.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, notes: status === "rejected" && notes ? notes : undefined }),
    });
    setSubmitting(null);
    if (!res || !res.ok) {
      setError(t("workDecisionError"));
      return;
    }
    setRejecting(null);
    setNotes("");
    setProjects((prev) => prev?.filter((p) => p.id !== project.id) ?? null);
  }

  return (
    <div>
      <AdminPageHeader title={t("workTitle")} description={t("workDescription")} />

      {error && <p className="text-sm text-danger mb-4">{error}</p>}
      {projects === null && <p className="text-sm text-muted">{t("workLoading")}</p>}
      {projects?.length === 0 && <p className="text-sm text-muted">{t("workEmpty")}</p>}

      <div className="flex flex-col gap-5">
        {projects?.map((project) => {
          const owner = project.generic_profiles;
          const category = owner?.categories ? (locale === "ar" ? owner.categories.name_ar : owner.categories.name_en) : null;
          return (
            <div key={project.id} className={ui.card + " p-5"}>
              <div className="flex flex-wrap items-baseline justify-between gap-2 mb-1">
                <h2 className="font-display text-lg font-semibold" dir="auto">
                  {project.title}
                </h2>
                <Link href={`/u/${project.profile_id}`} className={ui.link + " text-sm"}>
                  {[owner?.full_name, category].filter(Boolean).join(" · ")}
                </Link>
              </div>
              {project.description && (
                <p dir="auto" className="text-sm text-ink/80 whitespace-pre-wrap mb-3">
                  {project.description}
                </p>
              )}

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
                {project.work_photos.map((photo) => (
                  <a key={photo.id} href={photo.url} target="_blank" rel="noreferrer" className="block">
                    <Image
                      src={photo.url}
                      alt=""
                      width={320}
                      height={320}
                      unoptimized
                      className="aspect-square w-full rounded-xl object-cover bg-surface-sunken"
                    />
                    {photo.caption && (
                      <span dir="auto" className="mt-1 block text-xs text-muted">
                        {photo.caption}
                      </span>
                    )}
                  </a>
                ))}
              </div>

              {rejecting === project.id ? (
                <div className="flex flex-col gap-2">
                  <textarea
                    className={ui.input}
                    rows={2}
                    placeholder={t("workRejectNotesPlaceholder")}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                  />
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => decide(project, "rejected")}
                      disabled={submitting === project.id}
                      className={ui.buttonPrimary + " px-4! py-1.5! text-sm"}
                    >
                      {t("workConfirmReject")}
                    </button>
                    <button onClick={() => setRejecting(null)} className={ui.buttonGhost + " text-sm"}>
                      {t("cancel")}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => decide(project, "approved")}
                    disabled={submitting === project.id}
                    className={ui.buttonPrimary + " px-4! py-1.5! text-sm"}
                  >
                    {t("approve")}
                  </button>
                  <button
                    onClick={() => setRejecting(project.id)}
                    disabled={submitting === project.id}
                    className={ui.buttonSecondary + " px-4! py-1.5! text-sm"}
                  >
                    {t("workReject")}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
