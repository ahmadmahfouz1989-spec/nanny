import * as Sentry from "@sentry/nextjs";

// Error monitoring (Sentry). Does nothing until SENTRY_DSN is set, so it's
// safe to deploy before a Sentry project exists.
export function register() {
  if (!process.env.SENTRY_DSN) return;
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV,
    // Errors only; no performance tracing (cost, and not needed yet).
    tracesSampleRate: 0,
    // Send the error and the user's id (set in requireActiveUser) only --
    // never cookies, headers, request bodies (chat messages, profile
    // fields) or query strings (searches).
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
    },
  });
}

// Every uncaught error in a route handler, server component or action.
export const onRequestError = Sentry.captureRequestError;
