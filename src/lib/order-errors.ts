/**
 * Every error an order screen can be told about, by code. The API sends
 * `{ error, code }`: `error` in English (for logs and old clients), `code`
 * for the screen, which shows its own words for it (Orders.errors.<code>
 * in messages/*.json) -- so an Arabic screen never shows English.
 */
export const ORDER_ERRORS = {
  // Placing an order
  contact_info: "Please remove phone numbers, emails, or social handles from the description. Put a phone number in the contact field instead: only the provider who confirms sees it.",
  not_in_lebanon: "Pick a place in Lebanon",
  upload_photos_again: "Upload the photos again",
  choose_from_list: "Choose the places from the list",
  too_many_orders: "You already have 3 orders waiting. Choose an offer or cancel one first.",
  rider_unavailable: "That rider can't take orders right now. Pick another one, or send it to the nearest riders.",
  name_required: "Enter your name",
  profile_rejected: "Your request was turned down. Edit it before ordering.",
  phone_required: "Verify your phone number first, in Settings.",
  invalid_description: "Tell them a few words about it",
  invalid_phone: "Enter a phone number, or leave it empty",
  schedule_past: "Pick a time from now on",
  schedule_too_far: "Pick a time within the next 30 days",
  invalid_order: "Check the order and try again",
  // Offers and quotes
  contact_info_offer: "Please remove phone numbers, emails, or social handles. You can share them in chat once confirmed.",
  invalid_price: "Enter a price",
  invalid_price_max: "The top of the range is below the start",
  invalid_eta: "Enter how many minutes, from 5 to 1440",
  invalid_visit: "Pick when you can come, from now on",
  too_long: "That's too long",
  // Moving an order along
  not_found: "Order not found",
  unknown_action: "Unknown action",
  busy: "Finish your current order first",
  order_changed: "This order changed. Refresh and try again.",
  offer_gone: "That offer is no longer available",
  nothing_waiting: "There's no offer waiting for confirmation",
  complete_after_delivered: "It can be marked complete once delivered",
  cannot_cancel: "This order can't be cancelled any more",
  still_going: "This order is still going",
  not_taking_offers: "This order is no longer taking offers",
  cannot_offer: "You can't offer on this order any more",
  not_open: "This order is no longer open",
  already_answered: "You already answered",
  no_offer_to_withdraw: "There's no offer to withdraw",
  nothing_to_confirm: "There's nothing to confirm",
  no_next_step: "There's no next step",
  cannot_drop: "This order can't be dropped now",
  // Admin
  only_open_resend: "Only an open order can be sent to more providers",
  no_more_providers: "No other eligible provider is available right now",
  reopen_not_allowed: "Only an order with no provider, or one waiting for confirmation, can be reopened",
  already_closed: "This order is already closed",
  // Rider availability
  needs_approval: "Your Delivery & Errands provider profile needs to be approved first",
} as const;

export type OrderErrorCode = keyof typeof ORDER_ERRORS;

/** The JSON body for an order error. */
export const orderError = (code: OrderErrorCode) => ({ error: ORDER_ERRORS[code], code });

/** Which error a failed check of an order (or an offer) is, from the field it's about. */
export function orderFieldError(field: unknown): OrderErrorCode {
  switch (field) {
    case "description":
      return "invalid_description";
    case "pickupContactPhone":
    case "dropoffContactPhone":
      return "invalid_phone";
    case "scheduledAt":
      return "schedule_past";
    case "fullName":
      return "name_required";
    case "priceUsd":
      return "invalid_price";
    case "priceMaxUsd":
      return "invalid_price_max";
    case "etaMinutes":
      return "invalid_eta";
    case "visitAt":
      return "invalid_visit";
    case "note":
      return "too_long";
    default:
      return "invalid_order";
  }
}
