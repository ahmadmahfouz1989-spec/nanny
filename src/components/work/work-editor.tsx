"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import Modal from "./modal";
import { ui } from "@/lib/ui";
import { request } from "@/lib/request";
import { shrinkImage } from "@/lib/image-resize";
import type { WorkPhoto, WorkProject } from "@/lib/work";

const MAX_PHOTOS = 10;
const MAX_PROJECTS = 20;
const TYPES = ["image/jpeg", "image/png", "image/webp"];

/**
 * Adding or editing one work project. A new one is created as soon as it
 * has a title, then photos are added to it; every change saves straight
 * away, so closing never loses anything. What others will see changes
 * only after review.
 */
export default function WorkEditor({
  profileId,
  initial,
  onChange,
  onDeleted,
  onClose,
}: {
  profileId: string;
  initial: WorkProject | null;
  onChange: (project: WorkProject) => void;
  onDeleted: (id: string) => void;
  onClose: () => void;
}) {
  const t = useTranslations("Work");
  const [project, setProject] = useState<WorkProject | null>(initial);
  const [title, setTitle] = useState(initial?.title ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [savingText, setSavingText] = useState(false);
  const [textSaved, setTextSaved] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  function update(next: WorkProject) {
    setProject(next);
    onChange(next);
  }

  const textChanged = !project || title.trim() !== project.title || description.trim() !== (project.description ?? "");

  async function saveText() {
    if (title.trim().length < 2) return;
    setSavingText(true);
    setError(null);
    const body = JSON.stringify({ profileId, title: title.trim(), description: description.trim() || undefined });
    const res = project
      ? await request(`/api/work-projects/${project.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body })
      : await request("/api/work-projects", { method: "POST", headers: { "Content-Type": "application/json" }, body });
    setSavingText(false);
    if (!res || !res.ok) {
      const code = (await res?.json().catch(() => null))?.error;
      setError(code === "too_many_projects" ? t("errorTooManyProjects", { max: MAX_PROJECTS }) : t("errorGeneric"));
      return;
    }
    if (project) {
      update({ ...project, title: title.trim(), description: description.trim() || null, status: "pending" });
      setTextSaved(true);
    } else {
      update((await res.json()).project as WorkProject);
    }
  }

  async function addPhotos(files: FileList | null) {
    if (!project || !files?.length) return;
    setError(null);
    const room = MAX_PHOTOS - project.photos.length;
    const list = Array.from(files).slice(0, Math.max(0, room));
    if (files.length > room) setError(t("errorTooManyPhotos", { max: MAX_PHOTOS }));
    let current = project;
    for (let i = 0; i < list.length; i++) {
      setProgress({ current: i + 1, total: list.length });
      if (!TYPES.includes(list[i].type)) {
        setError(t("errorFileType"));
        continue;
      }
      const shrunk = await shrinkImage(list[i]);
      const form = new FormData();
      form.append("file", shrunk.file);
      if (shrunk.width) form.append("width", String(shrunk.width));
      if (shrunk.height) form.append("height", String(shrunk.height));
      const res = await request(`/api/work-projects/${project.id}/photos`, { method: "POST", body: form });
      if (!res || !res.ok) {
        const code = (await res?.json().catch(() => null))?.error;
        setError(code === "too_many_photos" ? t("errorTooManyPhotos", { max: MAX_PHOTOS }) : t("errorGeneric"));
        break;
      }
      const { photo } = (await res.json()) as { photo: WorkPhoto };
      current = { ...current, status: "pending", photos: [...current.photos, photo] };
      update(current);
    }
    setProgress(null);
    if (fileInput.current) fileInput.current.value = "";
  }

  async function saveCaption(photo: WorkPhoto, caption: string) {
    if (!project || caption.trim() === (photo.caption ?? "")) return;
    const res = await request(`/api/work-projects/${project.id}/photos/${photo.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ caption: caption.trim() }),
    });
    if (!res || !res.ok) {
      setError(t("errorGeneric"));
      return;
    }
    update({
      ...project,
      status: "pending",
      photos: project.photos.map((p) => (p.id === photo.id ? { ...p, caption: caption.trim() || null } : p)),
    });
  }

  async function movePhoto(index: number, direction: -1 | 1) {
    if (!project) return;
    const to = index + direction;
    if (to < 0 || to >= project.photos.length) return;
    const photos = [...project.photos];
    [photos[index], photos[to]] = [photos[to], photos[index]];
    update({ ...project, photos });
    const res = await request(`/api/work-projects/${project.id}/photos/${project.photos[index].id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ move: direction === -1 ? "earlier" : "later" }),
    });
    if (!res || !res.ok) {
      update(project);
      setError(t("errorGeneric"));
    }
  }

  async function removePhoto(photo: WorkPhoto) {
    if (!project) return;
    const res = await request(`/api/work-projects/${project.id}/photos/${photo.id}`, { method: "DELETE" });
    if (!res || !res.ok) {
      setError(t("errorGeneric"));
      return;
    }
    update({ ...project, photos: project.photos.filter((p) => p.id !== photo.id) });
  }

  async function removeProject() {
    if (!project) return;
    const res = await request(`/api/work-projects/${project.id}`, { method: "DELETE" });
    if (!res || !res.ok) {
      setError(t("errorGeneric"));
      return;
    }
    onDeleted(project.id);
    onClose();
  }

  return (
    <Modal label={initial ? t("editTitle") : t("newTitle")} onClose={onClose}>
      <div className="flex h-full flex-col sm:max-h-[90dvh]">
        <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
          <h2 className="font-display text-lg font-semibold">{initial ? t("editTitle") : t("newTitle")}</h2>
          <button type="button" onClick={onClose} className={ui.buttonPrimary + " px-4! py-1.5!"}>
            {t("done")}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
          <label className="flex flex-col gap-1.5">
            <span className={ui.label}>{t("titleLabel")}</span>
            <input
              className={ui.input}
              value={title}
              maxLength={80}
              dir="auto"
              placeholder={t("titlePlaceholder")}
              onChange={(e) => {
                setTitle(e.target.value);
                setTextSaved(false);
              }}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className={ui.label}>{t("descriptionLabel")}</span>
            <textarea
              className={ui.input}
              rows={3}
              value={description}
              maxLength={1000}
              dir="auto"
              placeholder={t("descriptionPlaceholder")}
              onChange={(e) => {
                setDescription(e.target.value);
                setTextSaved(false);
              }}
            />
          </label>
          {(textChanged || textSaved) && (
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={saveText}
                disabled={savingText || title.trim().length < 2 || !textChanged}
                className={ui.buttonSecondary + " self-start"}
              >
                {project ? t("saveText") : t("continue")}
              </button>
              {textSaved && !textChanged && <span className="text-sm text-success">{t("saved")}</span>}
            </div>
          )}

          {project && (
            <section className="flex flex-col gap-3 border-t border-border pt-4">
              <div>
                <h3 className="font-semibold">{t("photosLabel")}</h3>
                <p className="text-xs text-muted">{t("photosHint", { max: MAX_PHOTOS })}</p>
              </div>

              <div className="rounded-xl bg-warning-soft px-3 py-2 text-sm text-ink">
                <p className="font-semibold">{t("rulesTitle")}</p>
                <ul className="list-disc ps-5 text-ink/80">
                  <li>{t("rule1")}</li>
                  <li>{t("rule2")}</li>
                  <li>{t("rule3")}</li>
                </ul>
              </div>

              {project.photos.map((photo, i) => (
                <div key={photo.id} className="flex gap-3">
                  <Image
                    src={photo.url}
                    alt=""
                    width={96}
                    height={96}
                    unoptimized
                    className="h-20 w-20 shrink-0 rounded-xl object-cover bg-surface-sunken"
                  />
                  <div className="flex-1 min-w-0 flex flex-col gap-1.5">
                    <input
                      className={ui.input + " py-2!"}
                      defaultValue={photo.caption ?? ""}
                      maxLength={140}
                      dir="auto"
                      placeholder={t("captionPlaceholder")}
                      onBlur={(e) => saveCaption(photo, e.target.value)}
                    />
                    <div className="flex items-center gap-1 text-xs">
                      <button
                        type="button"
                        onClick={() => movePhoto(i, -1)}
                        disabled={i === 0}
                        className={ui.buttonGhost + " px-2! py-1! text-xs disabled:opacity-30!"}
                      >
                        {t("moveEarlier")}
                      </button>
                      <button
                        type="button"
                        onClick={() => movePhoto(i, 1)}
                        disabled={i === project.photos.length - 1}
                        className={ui.buttonGhost + " px-2! py-1! text-xs disabled:opacity-30!"}
                      >
                        {t("moveLater")}
                      </button>
                      <button
                        type="button"
                        onClick={() => removePhoto(photo)}
                        className="ms-auto px-2 py-1 text-danger hover:underline"
                      >
                        {t("deletePhoto")}
                      </button>
                    </div>
                  </div>
                </div>
              ))}

              {project.photos.length < MAX_PHOTOS && (
                <div>
                  <button
                    type="button"
                    onClick={() => fileInput.current?.click()}
                    disabled={!!progress}
                    className={ui.buttonSecondary}
                  >
                    {progress ? t("uploading", progress) : t("addPhotos")}
                  </button>
                  <input
                    ref={fileInput}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    multiple
                    className="hidden"
                    onChange={(e) => addPhotos(e.target.files)}
                  />
                </div>
              )}

              <p className="text-xs text-muted">{t("reviewNote")}</p>
            </section>
          )}

          {error && <p className="text-sm text-danger">{error}</p>}

          {project && (
            <div className="border-t border-border pt-4">
              {confirmingDelete ? (
                <div className="flex items-center gap-3">
                  <button type="button" onClick={removeProject} className="text-sm font-semibold text-danger hover:underline">
                    {t("confirmDelete")}
                  </button>
                  <button type="button" onClick={() => setConfirmingDelete(false)} className="text-sm text-muted hover:text-ink">
                    {t("cancel")}
                  </button>
                </div>
              ) : (
                <button type="button" onClick={() => setConfirmingDelete(true)} className="text-sm text-danger hover:underline">
                  {t("deleteProject")}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
