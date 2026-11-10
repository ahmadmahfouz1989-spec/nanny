import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { suggestNames } from "@/lib/search";

/** People whose name matches what's typed in Home's search box, as it's typed. */
export async function GET(request: NextRequest) {
  const q = (request.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 60);
  const locale = request.nextUrl.searchParams.get("locale") === "ar" ? "ar" : "en";
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const people = q ? await suggestNames(q, user?.id ?? null, locale) : [];
  return NextResponse.json({ people });
}
