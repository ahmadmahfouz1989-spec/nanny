"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Keeps a profile form's answers on the phone as they're typed, so leaving
 * the page, losing the connection or the app closing doesn't lose them:
 * opening the form again brings them back (and says so). Saving or
 * cancelling clears it. Best-effort -- private browsing just means no draft.
 */
export function useFormDraft<T>(key: string, form: T, setForm: (value: T) => void) {
  const [restored, setRestored] = useState(false);
  const ready = useRef(false);
  const cleared = useRef(false);

  useEffect(() => {
    let saved: T | null = null;
    try {
      const raw = window.localStorage.getItem(key);
      saved = raw ? (JSON.parse(raw) as T) : null;
    } catch {}
    // As a callback, so the restore isn't a state update in the effect body.
    void Promise.resolve().then(() => {
      if (saved) {
        setForm(saved);
        setRestored(true);
      }
      ready.current = true;
    });
    // Once per form.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    if (!ready.current || cleared.current) return;
    try {
      window.localStorage.setItem(key, JSON.stringify(form));
    } catch {}
  }, [key, form]);

  return {
    restored,
    clear() {
      cleared.current = true;
      try {
        window.localStorage.removeItem(key);
      } catch {}
    },
  };
}
