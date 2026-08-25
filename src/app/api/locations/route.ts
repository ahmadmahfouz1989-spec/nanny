import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const level = searchParams.get("level");
  const parentId = searchParams.get("parent_id");
  const id = searchParams.get("id");

  const supabase = await createClient();
  let query = supabase
    .from("locations")
    .select("id, name_en, name_ar, name_fr, level, parent_location_id, sort_order")
    .order("sort_order", { ascending: true });

  if (id) query = query.eq("id", id);
  if (level) query = query.eq("level", level);
  if (parentId) query = query.eq("parent_location_id", parentId);

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ locations: data });
}
