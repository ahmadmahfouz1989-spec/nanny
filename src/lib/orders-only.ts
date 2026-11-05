/**
 * Delivery riders get customers as orders, with the map and a way to offer.
 * A match card for the same person only looks like an order that isn't one.
 * Customers still see riders and can message them, and chats already started
 * carry on in Messages.
 */
export function ridersWorkFromOrders(categorySlug: string, role: string | null | undefined) {
  return categorySlug === "errands" && role === "provider";
}
