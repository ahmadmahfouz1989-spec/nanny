import { afterAll, describe, expect, it } from "vitest";
import { startDirectContact } from "@/lib/direct-contact";
import { admin, cleanupUsers, createProfile, createUser, NANNY_PROVIDER, NANNY_SEEKER } from "./helpers";

// "Message now" on a provider's profile, for someone with no request in
// that service: a short request is made and the conversation opens.

afterAll(cleanupUsers);

describe("message a provider without a request first", () => {
  it("asks for a name when there's none, then opens a conversation the visitor can write in", async () => {
    const [visitor, nanny] = await Promise.all([createUser("dc-visitor"), createUser("dc-nanny")]);
    const nannyProfile = await createProfile(nanny, "nanny", "provider", NANNY_PROVIDER);

    expect(await startDirectContact(admin, visitor.id, nannyProfile)).toMatchObject({ ok: false, code: "name_required" });

    const opened = await startDirectContact(admin, visitor.id, nannyProfile, "Maya Visitor");
    expect(opened.ok).toBe(true);
    const matchId = (opened as { matchId: string }).matchId;

    const { data: request } = await admin
      .from("generic_profiles")
      .select("full_name, role, status, moderation_status, attributes")
      .eq("user_id", visitor.id)
      .single();
    expect(request).toMatchObject({ full_name: "Maya Visitor", role: "seeker", status: "active", moderation_status: "approved" });
    expect((request!.attributes as { quickContact?: boolean }).quickContact).toBe(true);

    // The short request is live straight away, and the nanny can answer.
    expect((await visitor.client.from("generic_messages").insert({ match_id: matchId, sender_id: visitor.id, body: "Hello!" })).error).toBeNull();
    expect((await nanny.client.from("generic_messages").insert({ match_id: matchId, sender_id: nanny.id, body: "Hi Maya" })).error).toBeNull();

    // Again: the same conversation, no second request.
    expect(await startDirectContact(admin, visitor.id, nannyProfile)).toEqual({ ok: true, matchId });
    const { count } = await admin.from("generic_profiles").select("id", { count: "exact", head: true }).eq("user_id", visitor.id);
    expect(count).toBe(1);
  });

  it("takes the name and area from the person's other profile", async () => {
    const [person, tutor] = await Promise.all([createUser("dc-parent"), createUser("dc-tutor")]);
    await createProfile(person, "nanny", "seeker", { ...NANNY_SEEKER, districtId: "00000000-0000-0000-0000-000000000000" }, { fullName: "Karim Known" });
    const tutorProfile = await createProfile(tutor, "tutoring", "provider", {});
    expect((await startDirectContact(admin, person.id, tutorProfile)).ok).toBe(true);
    const { data } = await admin
      .from("generic_profiles")
      .select("full_name, attributes, categories(slug)")
      .eq("user_id", person.id)
      .eq("role", "seeker")
      .neq("full_name", "")
      .order("created_at", { ascending: false })
      .limit(1)
      .single();
    expect(data).toMatchObject({ full_name: "Karim Known", categories: { slug: "tutoring" } });
  });

  it("never reaches a seeker, an unapproved provider, or yourself", async () => {
    const [someone, family, pending] = await Promise.all([createUser("dc-someone"), createUser("dc-family"), createUser("dc-pending")]);
    const familyProfile = await createProfile(family, "nanny", "seeker", NANNY_SEEKER);
    const pendingProfile = await createProfile(pending, "nanny", "provider", NANNY_PROVIDER, { approved: false });
    const own = await createProfile(someone, "nursing", "provider", {});
    expect(await startDirectContact(admin, someone.id, familyProfile, "Someone")).toMatchObject({ ok: false, code: "not_available" });
    expect(await startDirectContact(admin, someone.id, pendingProfile, "Someone")).toMatchObject({ ok: false, code: "not_available" });
    expect(await startDirectContact(admin, someone.id, own, "Someone")).toMatchObject({ ok: false, code: "own_profile" });
  });
});
