"use client";

import { useState } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { ui } from "@/lib/ui";
import { request } from "@/lib/request";
import { PhotoIcon } from "@/components/nav-icons";
import WorkViewer from "./work-viewer";
import WorkEditor from "./work-editor";
import type { WorkProject } from "@/lib/work";

/**
 * The Work grid on a provider's profile page. Visitors see approved
 * projects with photos; tapping one opens it full screen. The owner also
 * sees what's waiting for review or needs changes, and adds, edits and
 * reorders their work here.
 */
export default function WorkSection({
  profileId,
  initialProjects,
  isOwn,
}: {
  profileId: string;
  initialProjects: WorkProject[];
  isOwn: boolean;
}) {
  const t = useTranslations("Work");
  const [projects, setProjects] = useState(initialProjects);
  const [viewing, setViewing] = useState<WorkProject | null>(null);
  // null: closed; "new": adding; otherwise the project being edited.
  const [editing, setEditing] = useState<WorkProject | "new" | null>(null);

  const visible = isOwn ? projects : projects.filter((p) => p.status === "approved" && p.photos.length > 0);
  if (!isOwn && visible.length === 0) return null;

  function upsert(project: WorkProject) {
    setProjects((prev) => (prev.some((p) => p.id === project.id) ? prev.map((p) => (p.id === project.id ? project : p)) : [...prev, project]));
  }

  async function move(index: number, direction: -1 | 1) {
    const to = index + direction;
    if (to < 0 || to >= projects.length) return;
    const before = projects;
    const next = [...projects];
    [next[index], next[to]] = [next[to], next[index]];
    setProjects(next);
    const res = await request(`/api/work-projects/${before[index].id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ move: direction === -1 ? "up" : "down" }),
    });
    if (!res || !res.ok) setProjects(before);
  }

  function statusBadge(project: WorkProject) {
    if (project.photos.length === 0) return <span className={ui.badge("secondary")}>{t("statusNoPhotos")}</span>;
    if (project.status === "pending") return <span className={ui.badge("warning")}>{t("statusPending")}</span>;
    if (project.status === "rejected") return <span className={ui.badge("danger")}>{t("statusRejected")}</span>;
    return null;
  }

  return (
    <section id="work" className={ui.card + " p-4 sm:p-5 flex flex-col gap-3 scroll-mt-6"}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-display text-lg font-semibold">
          {t("title")}
          {visible.length > 0 && (
            <span className="ms-2 text-sm font-normal text-muted">{t("projectCount", { count: visible.length })}</span>
          )}
        </h2>
        {isOwn && projects.length < 20 && (
          <button type="button" onClick={() => setEditing("new")} className={ui.buttonSecondary + " px-4! py-1.5!"}>
            + {t("add")}
          </button>
        )}
      </div>

      {isOwn && projects.length === 0 && (
        <button
          type="button"
          onClick={() => setEditing("new")}
          className="flex flex-col items-center gap-2 rounded-xl border-2 border-dashed border-border px-4 py-8 text-center text-sm text-muted transition hover:border-primary/50 hover:text-ink"
        >
          <PhotoIcon className="h-8 w-8" />
          {t("emptyOwn")}
        </button>
      )}
      {isOwn && projects.some((p) => p.status !== "approved") && <p className="text-xs text-muted">{t("onlyYou")}</p>}

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {visible.map((project, i) => {
          const cover = project.photos[0];
          return (
            <div key={project.id} className="flex flex-col gap-1.5 min-w-0">
              <button
                type="button"
                onClick={() => (cover ? setViewing(project) : setEditing(project))}
                className="relative block aspect-square w-full overflow-hidden rounded-xl bg-surface-sunken text-start"
              >
                {cover ? (
                  <Image
                    src={cover.url}
                    alt=""
                    width={400}
                    height={400}
                    unoptimized
                    className="h-full w-full object-cover transition hover:scale-[1.03]"
                  />
                ) : (
                  <span className="flex h-full w-full items-center justify-center text-muted">
                    <PhotoIcon className="h-8 w-8" />
                  </span>
                )}
                {project.photos.length > 1 && (
                  <span className="absolute top-2 end-2 rounded-full bg-black/60 px-2 py-0.5 text-[11px] font-semibold text-white">
                    {project.photos.length}
                  </span>
                )}
                {isOwn && statusBadge(project) && <span className="absolute bottom-2 start-2">{statusBadge(project)}</span>}
              </button>
              <p dir="auto" className="text-sm font-medium text-ink truncate">
                {project.title}
              </p>
              {isOwn && (
                <div className="flex items-center gap-1 text-xs">
                  <button type="button" onClick={() => setEditing(project)} className={ui.link + " text-xs"}>
                    {t("edit")}
                  </button>
                  <button
                    type="button"
                    onClick={() => move(i, -1)}
                    disabled={i === 0}
                    aria-label={t("moveEarlier")}
                    className="ms-auto inline-flex h-7 w-7 items-center justify-center rounded-full text-muted hover:bg-surface-sunken disabled:opacity-30"
                  >
                    <span aria-hidden className="rtl:scale-x-[-1]">‹</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => move(i, 1)}
                    disabled={i === visible.length - 1}
                    aria-label={t("moveLater")}
                    className="inline-flex h-7 w-7 items-center justify-center rounded-full text-muted hover:bg-surface-sunken disabled:opacity-30"
                  >
                    <span aria-hidden className="rtl:scale-x-[-1]">›</span>
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {viewing && <WorkViewer project={viewing} onClose={() => setViewing(null)} />}
      {editing && (
        <WorkEditor
          profileId={profileId}
          initial={editing === "new" ? null : editing}
          onChange={upsert}
          onDeleted={(id) => setProjects((prev) => prev.filter((p) => p.id !== id))}
          onClose={() => setEditing(null)}
        />
      )}
    </section>
  );
}
