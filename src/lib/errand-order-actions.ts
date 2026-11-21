import { createAdminClient } from "@/lib/supabase/admin";
import { notify } from "@/lib/push";
import { containsContactInfo } from "@/lib/content-filter";
import { cancelSchema, offerSchema, quoteSchema } from "@/lib/validation/errand-order";
import {
  activeOrderCounts,
  dispatchOrder,
  ensureConversation,
  errandSettings,
  logOrderEvent,
  nextProviderStatus,
  nextWaveOrClose,
  openMinutesFor,
  reopenOrder,
  scheduledSendAt,
  tickOrder,
  type OrderCategory,
  type OrderStatus,
} from "@/lib/errand-orders";
import type { Tables, TablesUpdate } from "@/lib/supabase/database.types";
import { orderError, orderFieldError, type OrderErrorCode } from "@/lib/order-errors";

// Everything that changes an order, for each side. Each step only
// happens from the state it expects -- updates are conditional on the
// current status, so two taps (or two people) at once can't both win.

type Admin = ReturnType<typeof createAdminClient>;
type OrderRow = Tables<"errand_orders">;
type Actor = { userId: string; role: "seeker" | "provider" | "admin" };
export type ActionResult = { ok: true; orderId?: string } | { ok: false; status: number; error: string; code?: string };

export const SEEKER_ACTIONS = ["select", "change", "complete", "cancel", "retry"] as const;
export const PROVIDER_ACTIONS = ["offer", "decline", "withdraw", "confirm", "refuse", "advance", "cancel"] as const;
export const ADMIN_ACTIONS = ["resend", "widen", "reopen", "cancel"] as const;

const fail = (status: number, code: OrderErrorCode): ActionResult => ({ ok: false, status, ...orderError(code) });
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
 * After a provider answers (offers, declines or withdraws): a delivery
 * moves on at once if everyone in the wave has now answered -- to the
 * customer's choice if offers are in, else to the next wave. A repair
 * request with nobody left who might still quote asks more tradespeople.
 */
async function afterAnswer(db: Admin, order: OrderRow) {
  const { data: current } = await db.from("errand_orders").select("*").eq("id", order.id).maybeSingle();
  if (!current || current.status !== "open") return;
  if (current.category !== "maintenance") {
    await tickOrder(db, current);
    return;
  }
  const { data: rows } = await db.from("errand_order_recipients").select("status").eq("order_id", order.id);
  if ((rows ?? []).some((r) => r.status === "sent" || r.status === "offered")) return;
  await nextWaveOrClose(db, current);
}

const reopen = (db: Admin, order: OrderRow, from: OrderStatus[], actor: Actor) => reopenOrder(db, order, from, actor);

/** A rider at their limit of orders in progress (errand_settings.max_active_orders). */
async function atOrderLimit(db: Admin, profileId: string) {
  const [settings, load] = await Promise.all([errandSettings(db), activeOrderCounts(db, [profileId])]);
  return (load.get(profileId) ?? 0) >= settings.max_active_orders;
}

async function myRecipient(db: Admin, order: OrderRow, userId: string) {
  const { data } = await db.from("errand_order_recipients").select("*").eq("order_id", order.id).eq("provider_user_id", userId).maybeSingle();
  return data;
}

export async function seekerAction(
  db: Admin,
  order: OrderRow,
  actor: Actor,
  action: string,
  body: unknown,
  /** Picked by the order itself ("take the first rider"): the rider isn't asked to confirm what they just offered. */
  automatic = false,
): Promise<ActionResult> {
  const b = (body ?? {}) as Record<string, unknown>;
  switch (action) {
    case "select": {
      // The customer picks an offer; it's held for that provider to confirm.
      const recipientId = typeof b.recipientId === "string" ? b.recipientId : "";
      const { data: r } = await db.from("errand_order_recipients").select("*").eq("id", recipientId).eq("order_id", order.id).maybeSingle();
      if (!r || r.status !== "offered") return fail(409, "offer_gone");
      // A rider has a limited time to confirm; a tradesperson doesn't.
      const settings = await errandSettings(db);
      const ok = await move(db, order, ["open"], "reserved", {
        provider_profile_id: r.provider_profile_id,
        provider_user_id: r.provider_user_id,
        selected_recipient_id: r.id,
        choose_until: null,
        confirm_until: order.category === "maintenance" ? null : new Date(Date.now() + settings.confirm_seconds * 1000).toISOString(),
      });
      if (!ok) return fail(409, "order_changed");
      await db.from("errand_order_recipients").update({ status: "selected" }).eq("id", r.id);
      await logOrderEvent(db, order.id, actor, "status", { status: "reserved", provider_profile_id: r.provider_profile_id, price_usd: r.price_usd, ...(automatic ? { automatic } : {}) });
      if (automatic) return { ok: true };
      await notify({
        user_id: r.provider_user_id,
        type: "errand_selected",
        payload: payload(order, order.category === "maintenance" ? {} : { confirm_seconds: settings.confirm_seconds }),
      });
      return { ok: true };
    }
    case "change": {
      // The chosen provider hasn't confirmed: let go of them and pick another.
      if (order.status !== "reserved" || !order.selected_recipient_id) return fail(409, "nothing_waiting");
      const recipientId = order.selected_recipient_id;
      const providerUserId = order.provider_user_id;
      if (!(await reopen(db, order, ["reserved"], actor))) return fail(409, "order_changed");
      await db.from("errand_order_recipients").update({ status: "not_selected" }).eq("id", recipientId);
      if (providerUserId) await notify({ user_id: providerUserId, type: "errand_cancelled", payload: payload(order) });
      return { ok: true };
    }
    case "complete": {
      if (!(await move(db, order, ["delivered"], "completed"))) return fail(409, "complete_after_delivered");
      await logOrderEvent(db, order.id, actor, "status", { status: "completed" });
      // Completing is what gives the order its number (the database does it).
      const { data: done } = await db.from("errand_orders").select("number").eq("id", order.id).single();
      const completed = { ...order, number: done?.number ?? null };
      if (order.provider_user_id) await notify({ user_id: order.provider_user_id, type: "errand_status", payload: payload(completed, { status: "completed" }) });
      return { ok: true };
    }
    case "cancel": {
      // Up to the moment it's picked up; after that it's on its way to you.
      const reason = cancelSchema.safeParse(b).data?.reason ?? null;
      const from: OrderStatus[] = ["open", "reserved", "accepted", "on_the_way", "arrived"];
      if (!(await move(db, order, from, "cancelled", { cancelled_by: "seeker", cancel_reason: reason }))) {
        return fail(409, "cannot_cancel");
      }
      await logOrderEvent(db, order.id, actor, "status", { status: "cancelled", reason });
      await db.from("errand_order_recipients").update({ status: "not_selected" }).eq("order_id", order.id).in("status", ["sent", "offered"]);
      if (order.provider_user_id) await notify({ user_id: order.provider_user_id, type: "errand_cancelled", payload: payload(order) });
      return { ok: true };
    }
    case "retry": {
      // A fresh copy of an order nobody took, sent to whoever is available now.
      if (order.status !== "no_provider" && order.status !== "cancelled") return fail(409, "still_going");
      const settings = await errandSettings(db);
      // A time that has passed is now "as soon as possible"; one still
      // ahead waits again until shortly before it.
      const stillAhead = order.timing === "scheduled" && order.scheduled_at !== null && Date.parse(order.scheduled_at) > Date.now();
      const timing = order.timing === "scheduled" && !stillAhead ? "asap" : order.timing;
      const scheduledAt = stillAhead ? order.scheduled_at : null;
      const holdUntil = order.category === "maintenance" ? null : scheduledSendAt(timing, scheduledAt);
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
          pickup_lat: order.pickup_lat,
          pickup_lng: order.pickup_lng,
          pickup_address: order.pickup_address,
          pickup_place_name: order.pickup_place_name,
          pickup_instructions: order.pickup_instructions,
          pickup_contact_name: order.pickup_contact_name,
          pickup_contact_phone: order.pickup_contact_phone,
          dropoff_lat: order.dropoff_lat,
          dropoff_lng: order.dropoff_lng,
          dropoff_address: order.dropoff_address,
          dropoff_place_name: order.dropoff_place_name,
          dropoff_instructions: order.dropoff_instructions,
          dropoff_contact_name: order.dropoff_contact_name,
          dropoff_contact_phone: order.dropoff_contact_phone,
          timing,
          scheduled_at: scheduledAt,
          budget_usd: order.budget_usd,
          open_until: new Date((holdUntil ? Date.parse(holdUntil) : Date.now()) + openMinutesFor(settings, order.category) * 60_000).toISOString(),
          ...(holdUntil ? { wave_until: holdUntil } : {}),
        })
        .select("*")
        .single();
      if (error || !copy) {
        console.error("[errand-orders] retry failed:", error?.message);
        return fail(400, "invalid_order");
      }
      await logOrderEvent(db, copy.id, actor, "created", { retry_of: order.number });
      if (holdUntil) {
        await logOrderEvent(db, copy.id, actor, "scheduled_hold", { send_at: holdUntil });
        return { ok: true, orderId: copy.id };
      }
      // The customer is looking at the answer: no notification if nobody's there.
      await nextWaveOrClose(db, copy, actor, { quiet: true });
      return { ok: true, orderId: copy.id };
    }
  }
  return fail(400, "unknown_action");
}

export async function providerAction(db: Admin, order: OrderRow, actor: Actor, action: string, body: unknown): Promise<ActionResult> {
  const mine = await myRecipient(db, order, actor.userId);
  const assigned = order.provider_user_id === actor.userId;
  if (!mine && !assigned) return fail(404, "not_found");

  switch (action) {
    case "offer": {
      if (!mine || order.status !== "open") return fail(409, "not_taking_offers");
      if (!["sent", "declined", "withdrawn", "offered"].includes(mine.status)) return fail(409, "cannot_offer");
      // A delivery offer is a price and minutes away; a repair quote is a
      // price or a range, and when they can come.
      const job = order.category === "maintenance";
      const parsed = job ? quoteSchema.safeParse(body) : offerSchema.safeParse(body);
      if (!parsed.success) return fail(400, orderFieldError(parsed.error.issues[0]?.path[0]));
      const offer = parsed.data as { priceUsd: number; priceMaxUsd?: number; etaMinutes?: number; visitAt?: string; note?: string };
      if (offer.note && containsContactInfo(offer.note)) {
        return fail(400, "contact_info_offer");
      }
      if (!job && (await atOrderLimit(db, mine.provider_profile_id))) return fail(409, "busy");
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
      // "Take the first rider within my budget": this offer fits, so it's
      // theirs -- chosen and confirmed in one go, nothing for anyone to tap.
      if (!job && order.auto_accept && order.budget_usd !== null && offer.priceUsd <= Number(order.budget_usd)) {
        const customer = { userId: order.seeker_user_id, role: "seeker" as const };
        const picked = await seekerAction(db, order, customer, "select", { recipientId: mine.id }, true);
        if (picked.ok) {
          const { data: reserved } = await db.from("errand_orders").select("*").eq("id", order.id).single();
          const confirmed = reserved ? await providerAction(db, reserved, actor, "confirm", {}) : picked;
          if (confirmed.ok) return { ok: true };
        }
      }
      if (first) await notify({ user_id: order.seeker_user_id, type: "errand_offer", payload: payload(order) });
      await afterAnswer(db, order);
      return { ok: true };
    }
    case "decline":
    case "withdraw": {
      if (!mine || order.status !== "open") return fail(409, "not_open");
      if (action === "decline" && mine.status !== "sent") return fail(409, "already_answered");
      if (action === "withdraw" && mine.status !== "offered") return fail(409, "no_offer_to_withdraw");
      await db
        .from("errand_order_recipients")
        .update({ status: action === "decline" ? "declined" : "withdrawn", responded_at: now() })
        .eq("id", mine.id);
      await logOrderEvent(db, order.id, actor, action === "decline" ? "declined" : "withdrawn", { provider_profile_id: mine.provider_profile_id });
      await afterAnswer(db, order);
      return { ok: true };
    }
    case "confirm": {
      if (!assigned || order.status !== "reserved") return fail(409, "nothing_to_confirm");
      // The unique index on active orders refuses a second one for this
      // provider, even if two customers picked them at the same moment.
      const { data, error } = await db
        .from("errand_orders")
        .update({ status: "accepted", status_changed_at: now(), confirm_until: null })
        .eq("id", order.id)
        .eq("status", "reserved")
        .select("id");
      if (error) return fail(409, "busy");
      if (!data?.length) return fail(409, "order_changed");
      await logOrderEvent(db, order.id, actor, "status", { status: "accepted" });
      await db
        .from("errand_order_recipients")
        .update({ status: "not_selected" })
        .eq("order_id", order.id)
        .in("status", ["sent", "offered"]);
      const matchId = await ensureConversation(db, order.seeker_profile_id, order.provider_profile_id!, order.category as OrderCategory);
      if (matchId) await db.from("errand_orders").update({ generic_match_id: matchId }).eq("id", order.id);
      // Once a rider is at their limit of orders in progress, they leave
      // every other order they were asked about -- offers and unanswered
      // requests alike -- and those orders move on at once instead of
      // waiting out the timer. A tradesperson can take several jobs.
      if (mine && order.category !== "maintenance" && (await atOrderLimit(db, mine.provider_profile_id))) {
        const { data: left } = await db
          .from("errand_order_recipients")
          .update({ status: "withdrawn", responded_at: now() })
          .eq("provider_profile_id", mine.provider_profile_id)
          .in("status", ["sent", "offered"])
          .neq("order_id", order.id)
          .select("order_id");
        for (const orderId of [...new Set((left ?? []).map((r) => r.order_id))]) {
          await logOrderEvent(db, orderId, { userId: null, role: "system" }, "busy_elsewhere", { provider_profile_id: mine.provider_profile_id });
          await afterAnswer(db, { id: orderId } as OrderRow);
        }
      }
      await notify({ user_id: order.seeker_user_id, type: "errand_confirmed", payload: payload(order) });
      return { ok: true };
    }
    case "refuse": {
      if (!assigned || order.status !== "reserved") return fail(409, "nothing_to_confirm");
      const recipientId = order.selected_recipient_id;
      if (!(await reopen(db, order, ["reserved"], actor))) return fail(409, "order_changed");
      if (recipientId) await db.from("errand_order_recipients").update({ status: "refused", responded_at: now() }).eq("id", recipientId);
      await notify({ user_id: order.seeker_user_id, type: "errand_status", payload: payload(order, { status: "refused" }) });
      return { ok: true };
    }
    case "advance": {
      const next = nextProviderStatus(order.status as OrderStatus, order.category);
      if (!assigned || !next) return fail(409, "no_next_step");
      if (!(await move(db, order, [order.status as OrderStatus], next))) return fail(409, "order_changed");
      await logOrderEvent(db, order.id, actor, "status", { status: next });
      await notify({ user_id: order.seeker_user_id, type: "errand_status", payload: payload(order, { status: next }) });
      return { ok: true };
    }
    case "cancel": {
      // The provider drops out before pick-up: the order goes back out to others.
      if (!assigned || !["accepted", "on_the_way", "arrived"].includes(order.status)) return fail(409, "cannot_drop");
      const reason = cancelSchema.safeParse(body ?? {}).data?.reason ?? null;
      const recipientId = order.selected_recipient_id;
      await logOrderEvent(db, order.id, actor, "provider_dropped", { reason });
      if (!(await reopen(db, order, ["accepted", "on_the_way", "arrived"], actor))) return fail(409, "order_changed");
      if (recipientId) await db.from("errand_order_recipients").update({ status: "refused", responded_at: now() }).eq("id", recipientId);
      await notify({ user_id: order.seeker_user_id, type: "errand_status", payload: payload(order, { status: "refused" }) });
      return { ok: true };
    }
  }
  return fail(400, "unknown_action");
}

export async function adminAction(db: Admin, order: OrderRow, actor: Actor, action: string, body: unknown): Promise<ActionResult> {
  switch (action) {
    case "resend":
    case "widen": {
      // Send the next wave now, without waiting for the timer; "widen"
      // first reaches one radius step further out.
      if (order.status !== "open") return fail(409, "only_open_resend");
      const sent = await dispatchOrder(db, order, actor, { widen: action === "widen" });
      if (sent > 0) await logOrderEvent(db, order.id, actor, action === "widen" ? "admin_widened" : "admin_resent");
      return sent > 0 ? { ok: true } : fail(409, "no_more_providers");
    }
    case "reopen": {
      if (!["no_provider", "reserved"].includes(order.status)) return fail(409, "reopen_not_allowed");
      const recipientId = order.selected_recipient_id;
      if (!(await reopen(db, order, ["no_provider", "reserved"], actor))) return fail(409, "order_changed");
      if (recipientId) await db.from("errand_order_recipients").update({ status: "not_selected" }).eq("id", recipientId);
      return { ok: true };
    }
    case "cancel": {
      const reason = cancelSchema.safeParse(body ?? {}).data?.reason ?? null;
      const from: OrderStatus[] = ["open", "reserved", "accepted", "on_the_way", "arrived", "picked_up", "delivered", "no_provider"];
      if (!(await move(db, order, from, "cancelled", { cancelled_by: "admin", cancel_reason: reason }))) return fail(409, "already_closed");
      await logOrderEvent(db, order.id, actor, "status", { status: "cancelled", reason });
      await db.from("errand_order_recipients").update({ status: "not_selected" }).eq("order_id", order.id).in("status", ["sent", "offered"]);
      const recipients = [order.seeker_user_id, order.provider_user_id].filter((id): id is string => !!id);
      await notify(recipients.map((user_id) => ({ user_id, type: "errand_cancelled", payload: payload(order) })));
      return { ok: true };
    }
  }
  return fail(400, "unknown_action");
}
