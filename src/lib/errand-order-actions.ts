import { createAdminClient } from "@/lib/supabase/admin";
import { notify } from "@/lib/push";
import { containsContactInfo } from "@/lib/content-filter";
import { cancelSchema, offerSchema, quoteSchema } from "@/lib/validation/errand-order";
import {
  BUSY_STATUSES,
  dispatchOrder,
  ensureConversation,
  errandSettings,
  logOrderEvent,
  nextProviderStatus,
  openMinutesFor,
  type OrderCategory,
  type OrderService,
  type OrderStatus,
} from "@/lib/errand-orders";
import type { Tables, TablesUpdate } from "@/lib/supabase/database.types";

// Everything that changes an order, for each side. Each step only
// happens from the state it expects -- updates are conditional on the
// current status, so two taps (or two people) at once can't both win.

type Admin = ReturnType<typeof createAdminClient>;
type OrderRow = Tables<"errand_orders">;
type Actor = { userId: string; role: "seeker" | "provider" | "admin" };
export type ActionResult = { ok: true; orderId?: string } | { ok: false; status: number; error: string; code?: string };

export const SEEKER_ACTIONS = ["select", "change", "complete", "cancel", "retry"] as const;
export const PROVIDER_ACTIONS = ["offer", "decline", "withdraw", "confirm", "refuse", "advance", "cancel"] as const;
export const ADMIN_ACTIONS = ["resend", "reopen", "cancel"] as const;

const fail = (status: number, error: string, code?: string): ActionResult => ({ ok: false, status, error, code });
const now = () => new Date().toISOString();
const payload = (order: OrderRow, extra: Record<string, unknown> = {}) => ({
  order_id: order.id,
  order_number: order.number,
  category_slug: order.category,
  ...extra,
});

/** Moves the order from `from` to `to` only if it's still in `from`; false if someone got there first. */
async function move(db: Admin, order: OrderRow, from: OrderStatus[], to: OrderStatus, fields: TablesUpdate<"errand_orders"> = {}) {
  const { data } = await db
    .from("errand_orders")
    .update({ ...fields, status: to, status_changed_at: now() })
    .eq("id", order.id)
    .in("status", from)
    .select("id");
  return (data ?? []).length > 0;
}

/**
 * After a provider declines or withdraws: if nobody is left who might
 * still offer, try more providers; if there are none, close it as
 * "no provider" and tell the customer.
 */
async function topUpOrClose(db: Admin, order: OrderRow) {
  const { data: rows } = await db.from("errand_order_recipients").select("status").eq("order_id", order.id);
  if ((rows ?? []).some((r) => r.status === "sent" || r.status === "offered")) return;
  const sent = await dispatchOrder(db, { ...order, service: order.service as OrderService }, { userId: null, role: "system" });
  if (sent > 0) return;
  if (await move(db, order, ["open"], "no_provider", { cancelled_by: "system" })) {
    await logOrderEvent(db, order.id, { userId: null, role: "system" }, "status", { status: "no_provider" });
    await notify({ user_id: order.seeker_user_id, type: "errand_no_provider", payload: payload(order) });
  }
}

/** Back to open for offers, without the provider who dropped out; more providers are tried if needed. */
async function reopen(db: Admin, order: OrderRow, from: OrderStatus[], actor: Actor | { userId: null; role: "system" }) {
  const settings = await errandSettings(db);
  const ok = await move(db, order, from, "open", {
    provider_profile_id: null,
    provider_user_id: null,
    selected_recipient_id: null,
    open_until: new Date(Date.now() + openMinutesFor(settings, order.category) * 60_000).toISOString(),
  });
  if (!ok) return false;
  await logOrderEvent(db, order.id, actor, "status", { status: "open" });
  await topUpOrClose(db, { ...order, status: "open" });
  return true;
}

async function myRecipient(db: Admin, order: OrderRow, userId: string) {
  const { data } = await db.from("errand_order_recipients").select("*").eq("order_id", order.id).eq("provider_user_id", userId).maybeSingle();
  return data;
}

export async function seekerAction(db: Admin, order: OrderRow, actor: Actor, action: string, body: unknown): Promise<ActionResult> {
  const b = (body ?? {}) as Record<string, unknown>;
  switch (action) {
    case "select": {
      // The customer picks an offer; it's held for that provider to confirm.
      const recipientId = typeof b.recipientId === "string" ? b.recipientId : "";
      const { data: r } = await db.from("errand_order_recipients").select("*").eq("id", recipientId).eq("order_id", order.id).maybeSingle();
      if (!r || r.status !== "offered") return fail(409, "That offer is no longer available");
      const ok = await move(db, order, ["open"], "reserved", {
        provider_profile_id: r.provider_profile_id,
        provider_user_id: r.provider_user_id,
        selected_recipient_id: r.id,
      });
      if (!ok) return fail(409, "This order changed. Refresh and try again.");
      await db.from("errand_order_recipients").update({ status: "selected" }).eq("id", r.id);
      await logOrderEvent(db, order.id, actor, "status", { status: "reserved", provider_profile_id: r.provider_profile_id, price_usd: r.price_usd });
      await notify({ user_id: r.provider_user_id, type: "errand_selected", payload: payload(order) });
      return { ok: true };
    }
    case "change": {
      // The chosen provider hasn't confirmed: let go of them and pick another.
      if (order.status !== "reserved" || !order.selected_recipient_id) return fail(409, "There's no offer waiting for confirmation");
      const recipientId = order.selected_recipient_id;
      const providerUserId = order.provider_user_id;
      if (!(await reopen(db, order, ["reserved"], actor))) return fail(409, "This order changed. Refresh and try again.");
      await db.from("errand_order_recipients").update({ status: "not_selected" }).eq("id", recipientId);
      if (providerUserId) await notify({ user_id: providerUserId, type: "errand_cancelled", payload: payload(order) });
      return { ok: true };
    }
    case "complete": {
      if (!(await move(db, order, ["delivered"], "completed"))) return fail(409, "It can be marked complete once delivered");
      await logOrderEvent(db, order.id, actor, "status", { status: "completed" });
      if (order.provider_user_id) await notify({ user_id: order.provider_user_id, type: "errand_status", payload: payload(order, { status: "completed" }) });
      return { ok: true };
    }
    case "cancel": {
      // Up to the moment it's picked up; after that it's on its way to you.
      const reason = cancelSchema.safeParse(b).data?.reason ?? null;
      const from: OrderStatus[] = ["open", "reserved", "accepted", "on_the_way", "arrived"];
      if (!(await move(db, order, from, "cancelled", { cancelled_by: "seeker", cancel_reason: reason }))) {
        return fail(409, "This order can't be cancelled any more");
      }
      await logOrderEvent(db, order.id, actor, "status", { status: "cancelled", reason });
      await db.from("errand_order_recipients").update({ status: "not_selected" }).eq("order_id", order.id).in("status", ["sent", "offered"]);
      if (order.provider_user_id) await notify({ user_id: order.provider_user_id, type: "errand_cancelled", payload: payload(order) });
      return { ok: true };
    }
    case "retry": {
      // A fresh copy of an order nobody took, sent to whoever is available now.
      if (order.status !== "no_provider" && order.status !== "cancelled") return fail(409, "This order is still going");
      const settings = await errandSettings(db);
      const { data: copy, error } = await db
        .from("errand_orders")
        .insert({
          seeker_user_id: order.seeker_user_id,
          seeker_profile_id: order.seeker_profile_id,
          category: order.category,
          service: order.service,
          photo_paths: order.photo_paths,
          description: order.description,
          pickup_district_id: order.pickup_district_id,
          pickup_area_id: order.pickup_area_id,
          pickup_detail: order.pickup_detail,
          dropoff_district_id: order.dropoff_district_id,
          dropoff_area_id: order.dropoff_area_id,
          dropoff_detail: order.dropoff_detail,
          timing: order.timing,
          scheduled_at: order.scheduled_at,
          budget_usd: order.budget_usd,
          open_until: new Date(Date.now() + openMinutesFor(settings, order.category) * 60_000).toISOString(),
        })
        .select("*")
        .single();
      if (error || !copy) return fail(400, error?.message ?? "Could not try again");
      await logOrderEvent(db, copy.id, actor, "created", { retry_of: order.number });
      const sent = await dispatchOrder(db, { ...copy, service: copy.service as OrderService }, actor);
      if (sent === 0) {
        await move(db, copy, ["open"], "no_provider", { cancelled_by: "system" });
        await logOrderEvent(db, copy.id, { userId: null, role: "system" }, "status", { status: "no_provider" });
      }
      return { ok: true, orderId: copy.id };
    }
  }
  return fail(400, "Unknown action");
}

export async function providerAction(db: Admin, order: OrderRow, actor: Actor, action: string, body: unknown): Promise<ActionResult> {
  const mine = await myRecipient(db, order, actor.userId);
  const assigned = order.provider_user_id === actor.userId;
  if (!mine && !assigned) return fail(404, "Order not found");

  switch (action) {
    case "offer": {
      if (!mine || order.status !== "open") return fail(409, "This order is no longer taking offers");
      if (!["sent", "declined", "withdrawn", "offered"].includes(mine.status)) return fail(409, "You can't offer on this order any more");
      // A delivery offer is a price and minutes away; a repair quote is a
      // price or a range, and when they can come.
      const job = order.category === "maintenance";
      const parsed = job ? quoteSchema.safeParse(body) : offerSchema.safeParse(body);
      if (!parsed.success) return fail(400, parsed.error.issues[0]?.message ?? "Check the offer");
      const offer = parsed.data as { priceUsd: number; priceMaxUsd?: number; etaMinutes?: number; visitAt?: string; note?: string };
      if (offer.note && containsContactInfo(offer.note)) {
        return fail(400, "Please remove phone numbers, emails, or social handles. You can share them in chat once confirmed.");
      }
      if (!job) {
        const { count } = await db
          .from("errand_orders")
          .select("id", { count: "exact", head: true })
          .eq("provider_profile_id", mine.provider_profile_id)
          .in("status", [...BUSY_STATUSES]);
        if ((count ?? 0) > 0) return fail(409, "Finish your current order first", "busy");
      }
      const first = mine.status !== "offered";
      await db
        .from("errand_order_recipients")
        .update({
          status: "offered",
          price_usd: offer.priceUsd,
          price_max_usd: offer.priceMaxUsd ?? null,
          eta_minutes: offer.etaMinutes ?? null,
          visit_at: offer.visitAt ?? null,
          note: offer.note || null,
          responded_at: now(),
        })
        .eq("id", mine.id);
      await logOrderEvent(db, order.id, actor, first ? "offered" : "offer_changed", {
        provider_profile_id: mine.provider_profile_id,
        price_usd: offer.priceUsd,
        price_max_usd: offer.priceMaxUsd ?? null,
        eta_minutes: offer.etaMinutes ?? null,
        visit_at: offer.visitAt ?? null,
      });
      if (first) await notify({ user_id: order.seeker_user_id, type: "errand_offer", payload: payload(order) });
      return { ok: true };
    }
    case "decline":
    case "withdraw": {
      if (!mine || order.status !== "open") return fail(409, "This order is no longer open");
      if (action === "decline" && mine.status !== "sent") return fail(409, "You already answered");
      if (action === "withdraw" && mine.status !== "offered") return fail(409, "There's no offer to withdraw");
      await db
        .from("errand_order_recipients")
        .update({ status: action === "decline" ? "declined" : "withdrawn", responded_at: now() })
        .eq("id", mine.id);
      await logOrderEvent(db, order.id, actor, action === "decline" ? "declined" : "withdrawn", { provider_profile_id: mine.provider_profile_id });
      await topUpOrClose(db, order);
      return { ok: true };
    }
    case "confirm": {
      if (!assigned || order.status !== "reserved") return fail(409, "There's nothing to confirm");
      // The unique index on active orders refuses a second one for this
      // provider, even if two customers picked them at the same moment.
      const { data, error } = await db
        .from("errand_orders")
        .update({ status: "accepted", status_changed_at: now() })
        .eq("id", order.id)
        .eq("status", "reserved")
        .select("id");
      if (error) return fail(409, "Finish your current order first", "busy");
      if (!data?.length) return fail(409, "This order changed. Refresh and try again.");
      await logOrderEvent(db, order.id, actor, "status", { status: "accepted" });
      await db
        .from("errand_order_recipients")
        .update({ status: "not_selected" })
        .eq("order_id", order.id)
        .in("status", ["sent", "offered"]);
      const matchId = await ensureConversation(db, order.seeker_profile_id, order.provider_profile_id!, order.category as OrderCategory);
      if (matchId) await db.from("errand_orders").update({ generic_match_id: matchId }).eq("id", order.id);
      // A rider's other open offers stand down while they're busy; a
      // tradesperson can take several jobs.
      if (mine && order.category !== "maintenance") {
        await db
          .from("errand_order_recipients")
          .update({ status: "withdrawn", responded_at: now() })
          .eq("provider_profile_id", mine.provider_profile_id)
          .eq("status", "offered")
          .neq("order_id", order.id);
      }
      await notify({ user_id: order.seeker_user_id, type: "errand_confirmed", payload: payload(order) });
      return { ok: true };
    }
    case "refuse": {
      if (!assigned || order.status !== "reserved") return fail(409, "There's nothing to confirm");
      const recipientId = order.selected_recipient_id;
      if (!(await reopen(db, order, ["reserved"], actor))) return fail(409, "This order changed. Refresh and try again.");
      if (recipientId) await db.from("errand_order_recipients").update({ status: "refused", responded_at: now() }).eq("id", recipientId);
      await notify({ user_id: order.seeker_user_id, type: "errand_status", payload: payload(order, { status: "refused" }) });
      return { ok: true };
    }
    case "advance": {
      const next = nextProviderStatus(order.status as OrderStatus, order.category);
      if (!assigned || !next) return fail(409, "There's no next step");
      if (!(await move(db, order, [order.status as OrderStatus], next))) return fail(409, "This order changed. Refresh and try again.");
      await logOrderEvent(db, order.id, actor, "status", { status: next });
      await notify({ user_id: order.seeker_user_id, type: "errand_status", payload: payload(order, { status: next }) });
      return { ok: true };
    }
    case "cancel": {
      // The provider drops out before pick-up: the order goes back out to others.
      if (!assigned || !["accepted", "on_the_way", "arrived"].includes(order.status)) return fail(409, "This order can't be dropped now");
      const reason = cancelSchema.safeParse(body ?? {}).data?.reason ?? null;
      const recipientId = order.selected_recipient_id;
      await logOrderEvent(db, order.id, actor, "provider_dropped", { reason });
      if (!(await reopen(db, order, ["accepted", "on_the_way", "arrived"], actor))) return fail(409, "This order changed. Refresh and try again.");
      if (recipientId) await db.from("errand_order_recipients").update({ status: "refused", responded_at: now() }).eq("id", recipientId);
      await notify({ user_id: order.seeker_user_id, type: "errand_status", payload: payload(order, { status: "refused" }) });
      return { ok: true };
    }
  }
  return fail(400, "Unknown action");
}

export async function adminAction(db: Admin, order: OrderRow, actor: Actor, action: string, body: unknown): Promise<ActionResult> {
  switch (action) {
    case "resend": {
      if (order.status !== "open") return fail(409, "Only an open order can be sent to more providers");
      const sent = await dispatchOrder(db, { ...order, service: order.service as OrderService }, actor);
      return sent > 0 ? { ok: true } : fail(409, "No other eligible provider is available right now");
    }
    case "reopen": {
      if (!["no_provider", "reserved"].includes(order.status)) return fail(409, "Only an order with no provider, or one waiting for confirmation, can be reopened");
      const recipientId = order.selected_recipient_id;
      if (!(await reopen(db, order, ["no_provider", "reserved"], actor))) return fail(409, "This order changed. Refresh and try again.");
      if (recipientId) await db.from("errand_order_recipients").update({ status: "not_selected" }).eq("id", recipientId);
      return { ok: true };
    }
    case "cancel": {
      const reason = cancelSchema.safeParse(body ?? {}).data?.reason ?? null;
      const from: OrderStatus[] = ["open", "reserved", "accepted", "on_the_way", "arrived", "picked_up", "delivered", "no_provider"];
      if (!(await move(db, order, from, "cancelled", { cancelled_by: "admin", cancel_reason: reason }))) return fail(409, "This order is already closed");
      await logOrderEvent(db, order.id, actor, "status", { status: "cancelled", reason });
      await db.from("errand_order_recipients").update({ status: "not_selected" }).eq("order_id", order.id).in("status", ["sent", "offered"]);
      const recipients = [order.seeker_user_id, order.provider_user_id].filter((id): id is string => !!id);
      await notify(recipients.map((user_id) => ({ user_id, type: "errand_cancelled", payload: payload(order) })));
      return { ok: true };
    }
  }
  return fail(400, "Unknown action");
}
