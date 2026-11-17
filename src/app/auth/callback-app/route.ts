// NATIVE_AUTH_CALLBACK in src/lib/native-app.ts (a client-only module).
const NATIVE_AUTH_CALLBACK = "ouiknow://auth/callback";

/**
 * The end of Google sign-in in the iPhone app. Google and Supabase run in
 * the in-app browser, and their last redirect used to go straight to
 * ouiknow://auth/callback. iOS can refuse that jump from a redirect
 * ("Safari cannot open the page because the address is invalid"), but
 * never from a tap. So sign-in ends here, on a page with one button that
 * hands the code to the app. The app (listenForNativeEvents) closes the
 * browser and finishes the sign-in in its own web view, where the PKCE
 * verifier lives.
 *
 * Allowed by the `https://oui-know.com/auth/callback**` redirect URL in Supabase.
 */
export function GET(request: Request) {
  const incoming = new URL(request.url).searchParams;
  const forward = new URLSearchParams();
  for (const key of ["code", "error", "error_code", "error_description"]) {
    const value = incoming.get(key);
    if (value) forward.set(key, value);
  }
  const target = `${NATIVE_AUTH_CALLBACK}?${forward.toString()}`;
  // URLSearchParams encodes everything that could break out of the attribute.
  const href = target.replace(/&/g, "&amp;").replace(/"/g, "&quot;");

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>ouiKnow</title>
<style>
  :root { color-scheme: light dark; --bg: #fdfaf1; --fg: #1f2421; --muted: #6b716c; --accent: #e8743b; }
  @media (prefers-color-scheme: dark) { :root { --bg: #141614; --fg: #ecefec; --muted: #9aa19b; } }
  body { margin: 0; min-height: 100dvh; display: grid; place-items: center; background: var(--bg); color: var(--fg);
    font: 16px/1.5 -apple-system, system-ui, sans-serif; padding: 24px; box-sizing: border-box; text-align: center; }
  main { display: flex; flex-direction: column; gap: 16px; align-items: center; max-width: 340px; }
  h1 { font-size: 1.4rem; margin: 0; }
  p { margin: 0; color: var(--muted); }
  a.button { display: block; width: 100%; box-sizing: border-box; padding: 14px 20px; border-radius: 999px;
    background: var(--accent); color: #fff; font-weight: 600; text-decoration: none; font-size: 1.05rem; }
</style>
</head>
<body>
<main>
  <h1>You're signed in with Google</h1>
  <p>Tap below to go back to ouiKnow.</p>
  <a class="button" href="${href}">Continue to ouiKnow</a>
  <p dir="rtl" lang="ar">اضغط للعودة إلى ouiKnow</p>
</main>
</body>
</html>`;

  return new Response(html, {
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "referrer-policy": "no-referrer" },
  });
}
