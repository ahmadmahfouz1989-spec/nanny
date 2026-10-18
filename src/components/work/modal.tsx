"use client";

import { useEffect, useRef } from "react";

/**
 * A native <dialog> opened as a modal: the browser handles focus, Escape
 * and keeping the page behind it inert. Clicking the backdrop closes it.
 * Full screen on phones, a centred panel on wider screens.
 */
export default function Modal({
  label,
  onClose,
  children,
  wide = false,
}: {
  label: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  return (
    <dialog
      ref={ref}
      aria-label={label}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      className={`m-0 h-dvh max-h-none w-full max-w-none bg-surface text-ink p-0 backdrop:bg-black/70 sm:m-auto sm:h-auto sm:max-h-[90dvh] sm:rounded-2xl sm:border sm:border-border sm:shadow-xl ${
        wide ? "sm:max-w-3xl" : "sm:max-w-lg"
      }`}
    >
      {children}
    </dialog>
  );
}
