"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";
import { ui } from "@/lib/ui";

type Toast = {
  id: number;
  message: string;
  tone: "default" | "error";
  actionLabel?: string;
  onAction?: () => void;
};

type ShowToastOptions = {
  message: string;
  tone?: "default" | "error";
  actionLabel?: string;
  onAction?: () => void;
};

const ToastContext = createContext<((opts: ShowToastOptions) => void) | null>(null);

const AUTO_DISMISS_MS = 4000;

/**
 * Minimal shared toast host -- this app has no existing toast system
 * (ReportButton/similar surfaces just swap their own inline text in
 * place). Mounted once in AppShell so any component can call useToast()
 * without threading callbacks through props.
 */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(0);

  const show = useCallback((opts: ShowToastOptions) => {
    const id = nextId.current++;
    setToasts((prev) => [...prev, { id, message: opts.message, tone: opts.tone ?? "default", actionLabel: opts.actionLabel, onAction: opts.onAction }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, AUTO_DISMISS_MS);
  }, []);

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div className="fixed bottom-4 inset-x-0 z-50 flex flex-col items-center gap-2 px-4 pointer-events-none sm:bottom-6">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`${ui.card} pointer-events-auto flex items-center gap-3 px-4 py-3 text-sm shadow-md ${
              t.tone === "error" ? "border-danger/40 text-danger" : "text-ink"
            }`}
          >
            <span>{t.message}</span>
            {t.actionLabel && t.onAction && (
              <button type="button" onClick={t.onAction} className={ui.link + " text-sm font-semibold shrink-0"}>
                {t.actionLabel}
              </button>
            )}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const show = useContext(ToastContext);
  if (!show) throw new Error("useToast must be used within a ToastProvider");
  return { show };
}
