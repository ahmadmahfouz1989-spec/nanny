import createMiddleware from "next-intl/middleware";
import { NextResponse, type NextRequest } from "next/server";
import { routing } from "@/i18n/routing";
import { updateSession } from "@/lib/supabase/middleware";

const handleI18nRouting = createMiddleware(routing);

/**
 * READ_ONLY_MODE=1 turns the app read-only for a maintenance window (e.g. a
 * data migration): every write goes through /api, and every non-GET /api
 * request gets a 503 while pages keep working for reading. Auth routes stay
 * open so sign-in and Supabase's email hook (password reset) still work.
 */
function isBlockedWrite(request: NextRequest) {
  const { pathname } = request.nextUrl;
  return (
    process.env.READ_ONLY_MODE === "1" &&
    pathname.startsWith("/api/") &&
    !pathname.startsWith("/api/auth/") &&
    request.method !== "GET" &&
    request.method !== "HEAD"
  );
}

export async function proxy(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith("/api/")) {
    if (isBlockedWrite(request)) {
      return NextResponse.json(
        { error: "ouiKnow is briefly read-only for maintenance. Please try again in a few minutes." },
        { status: 503, headers: { "Retry-After": "600" } },
      );
    }
    return NextResponse.next();
  }

  const response = handleI18nRouting(request);
  return updateSession(request, response);
}

export const config = {
  matcher: [
    "/api/:path*",
    "/((?!api|auth/|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
