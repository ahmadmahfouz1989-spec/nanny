"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

// Last-resort screen when the root layout itself fails -- reports the
// error and offers a reload. Deliberately plain: layout, fonts and
// translations may be what broke.
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", padding: "3rem 1.5rem", textAlign: "center" }}>
        <h1 style={{ fontSize: "1.25rem", marginBottom: "0.5rem" }}>Something went wrong</h1>
        <p style={{ color: "#666", marginBottom: "1.5rem" }}>حدث خطأ ما</p>
        <button type="button" onClick={reset} style={{ padding: "0.5rem 1.25rem", borderRadius: 999, border: "1px solid #ccc" }}>
          Try again · حاول مجددًا
        </button>
      </body>
    </html>
  );
}
