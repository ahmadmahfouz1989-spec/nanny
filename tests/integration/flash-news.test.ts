import { afterAll, describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { admin, cleanupUsers, createUser } from "./helpers";
import { claimFlashNewsPush } from "@/lib/flash-news";

// Flash news: everyone (visitors too) reads what's up now; only the server writes.
describe("flash news", () => {
  afterAll(async () => {
    await admin.from("flash_news").delete().like("body", "Test flash%");
    await cleanupUsers();
  });
  const visitor = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false },
  });

  it("shows live news to everyone, and nothing once it's taken down", async () => {
    const { data: live } = await admin.from("flash_news").insert({ body: "Test flash: live" }).select("id").single();
    const { data: old } = await admin
      .from("flash_news")
      .insert({ body: "Test flash: removed", ended_at: new Date().toISOString() })
      .select("id")
      .single();
    const user = await createUser("flash-reader");
    for (const client of [visitor, user.client]) {
      const ids = ((await client.from("flash_news").select("id")).data ?? []).map((r) => r.id);
      expect(ids).toContain(live!.id);
      expect(ids).not.toContain(old!.id);
    }
    expect((await visitor.from("flash_news").insert({ body: "Test flash: sneaky" })).error).not.toBeNull();
    expect((await user.client.from("flash_news").insert({ body: "Test flash: sneaky" })).error).not.toBeNull();
  });

  it("is pushed once at most", async () => {
    const { data } = await admin.from("flash_news").insert({ body: "Test flash: push once" }).select("id").single();
    expect(await claimFlashNewsPush(admin, data!.id)).not.toBeNull();
    expect(await claimFlashNewsPush(admin, data!.id)).toBeNull();
  });
});
