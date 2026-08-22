"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { ui } from "@/lib/ui";

type AdminUser = {
  id: string;
  role: string;
  email: string | null;
  phone: string | null;
  status: string;
  created_at: string;
};

export default function AdminUsersPage() {
  const t = useTranslations("Admin");
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [q, setQ] = useState("");
  const [submitting, setSubmitting] = useState<string | null>(null);

  function load(query: string) {
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    fetch(`/api/admin/users?${params.toString()}`)
      .then((res) => res.json())
      .then((body) => setUsers(body.users));
  }

  useEffect(() => {
    load("");
  }, []);

  async function toggleStatus(user: AdminUser) {
    const nextStatus = user.status === "suspended" ? "active" : "suspended";
    setSubmitting(user.id);
    const res = await fetch(`/api/admin/users/${user.id}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: nextStatus }),
    });
    setSubmitting(null);
    if (res.ok) {
      setUsers((prev) => prev?.map((u) => (u.id === user.id ? { ...u, status: nextStatus } : u)) ?? null);
    }
  }

  return (
    <>
      <h1 className="font-display text-3xl font-semibold mb-6">{t("usersTitle")}</h1>

      <input
        className={ui.input + " mb-6"}
        placeholder={t("searchPlaceholder")}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && load(q)}
      />

      {users && users.length === 0 && <p className="text-sm text-muted">{t("usersEmpty")}</p>}

      <div className="flex flex-col gap-2">
        {users?.map((user) => (
          <div key={user.id} className={ui.card + " p-4 flex items-center justify-between gap-4"}>
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">{user.email ?? user.phone ?? "—"}</p>
              <p className="text-xs text-muted capitalize">{user.role}</p>
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
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
