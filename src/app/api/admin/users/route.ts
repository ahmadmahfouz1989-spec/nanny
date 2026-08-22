import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/admin/auth";

export async function GET(request: Request) {
  const supabase = await createClient();
  const admin = await requireAdmin(supabase);
  if (!admin) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const role = searchParams.get("role");
  const status = searchParams.get("status");
  const q = searchParams.get("q");
  const page = Math.max(1, Number(searchParams.get("page") ?? 1));
  const pageSize = Math.min(50, Math.max(1, Number(searchParams.get("pageSize") ?? 20)));
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const db = createAdminClient();
  let query = db
    .from("users")
    .select("id, role, email, phone, status, email_verified_at, phone_verified_at, created_at")
    .order("created_at", { ascending: false })
    .range(from, to);

  if (role) query = query.eq("role", role);
  if (status) query = query.eq("status", status);
  if (q) {
    // strip characters with special meaning in PostgREST filter syntax before interpolating
    const safeQ = q.replace(/[,()]/g, "");
    query = query.or(`email.ilike.%${safeQ}%,phone.ilike.%${safeQ}%`);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ users: data });
}
