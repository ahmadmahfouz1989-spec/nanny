import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/admin/auth";

/** A short-lived link to a profile's ID document, for an admin reviewing it. */
export async function GET(_request: Request, { params }: { params: Promise<{ profileId: string }> }) {
  const { profileId } = await params;
  const supabase = await createClient();
  if (!(await requireAdmin(supabase))) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const db = createAdminClient();
  const { data: doc } = await db.from("id_documents").select("path, status").eq("profile_id", profileId).maybeSingle();
  if (!doc) return NextResponse.json({ document: null });

  // Five minutes: long enough to look, short enough not to matter if copied.
  const { data, error } = await db.storage.from("id-documents").createSignedUrl(doc.path, 300);
  if (error || !data) return NextResponse.json({ error: "Could not open the document" }, { status: 500 });
  return NextResponse.json({ document: { url: data.signedUrl, status: doc.status } });
}
