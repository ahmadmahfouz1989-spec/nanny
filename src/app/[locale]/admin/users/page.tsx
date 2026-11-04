"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { ui } from "@/lib/ui";
import AdminPageHeader from "@/components/admin/admin-page-header";
import { getJson, request } from "@/lib/request";
import ProfileTrustControls from "@/components/admin/profile-trust-controls";

type AdminUser = {
  id: string;
  role: string;
  email: string | null;
  phone: string | null;
  status: string;
  featured_until: string | null;
  created_at: string;
};


export default function AdminUsersPage() {
  const t = useTranslations("Admin");
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [q, setQ] = useState("");
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  function load(query: string) {
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    getJson(`/api/admin/users?${params.toString()}`).then((body) => body && setUsers(body.users));
  }

  useEffect(() => {
    load("");
  }, []);

  // Live search rather than requiring Enter -- relying on a keydown
  // handler meant it silently did nothing if the keypress from a mobile
  // keyboard's "Go"/"Search" action button was never actually reported as
  // "Enter", with no visible hint that a key was needed at all.
  const isFirstRun = useRef(true);
  useEffect(() => {
    if (isFirstRun.current) {
      isFirstRun.current = false;
      return;
    }
    const handle = setTimeout(() => load(q), 300);
    return () => clearTimeout(handle);
  }, [q]);

  async function toggleStatus(user: AdminUser) {
    const nextStatus = user.status === "suspended" ? "active" : "suspended";
    setSubmitting(user.id);
    const res = await request(`/api/admin/users/${user.id}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: nextStatus }),
    });
    setSubmitting(null);
    if (res?.ok) {
      setUsers((prev) => prev?.map((u) => (u.id === user.id ? { ...u, status: nextStatus } : u)) ?? null);
    }
  }

  async function remove(user: AdminUser) {
    setSubmitting(user.id);
    const res = await request(`/api/admin/users/${user.id}`, { method: "DELETE" });
    setSubmitting(null);
    setConfirmDelete(null);
    if (res?.ok) {
      setUsers((prev) => prev?.filter((u) => u.id !== user.id) ?? null);
    }
  }

  return (
    <>
      <AdminPageHeader title={t("usersTitle")} description={t("usersDescription")} />

      <input
        className={ui.input + " mb-6"}
        placeholder={t("searchPlaceholder")}
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />

      {users && users.length === 0 && <p className="text-sm text-muted">{t("usersEmpty")}</p>}

      <div className="flex flex-col gap-2">
        {users?.map((user) => (
          <div key={user.id} className={ui.card + " p-4 flex flex-col gap-3"}>
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{user.email ?? user.phone ?? "—"}</p>
                {user.role === "admin" && <p className="text-xs text-muted capitalize">{user.role}</p>}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className={ui.badge(user.status === "suspended" ? "danger" : "success")}>{user.status}</span>
                <button
                  onClick={() => toggleStatus(user)}
                  disabled={submitting === user.id}
                  className={ui.buttonSecondary + " px-4! py-1.5! text-sm"}
                >
                  {user.status === "suspended" ? t("reactivate") : t("suspend")}
                </button>
                {user.role !== "admin" &&
                  (confirmDelete === user.id ? (
                    <button
                      onClick={() => remove(user)}
                      disabled={submitting === user.id}
                      className={ui.buttonPrimary + " bg-danger! px-4! py-1.5! text-sm"}
                    >
                      {t("confirmDelete")}
                    </button>
                  ) : (
                    <button
                      onClick={() => setConfirmDelete(user.id)}
                      className="text-sm text-muted hover:text-danger transition"
                    >
                      {t("delete")}
                    </button>
                  ))}
              </div>
            </div>

            {user.role !== "admin" && <ProfileTrustControls userId={user.id} featuredUntil={user.featured_until} />}
          </div>
        ))}
      </div>
    </>
  );
}
