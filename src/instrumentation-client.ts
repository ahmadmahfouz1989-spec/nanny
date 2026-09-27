import * as Sentry from "@sentry/nextjs";

// Browser-side error monitoring. Inactive until NEXT_PUBLIC_SENTRY_DSN is
// set (it has to be public: the browser reports errors directly).
if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ?? process.env.NODE_ENV,
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

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
