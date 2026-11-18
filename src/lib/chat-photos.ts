// Photos sent in chat (the `chat-photos` bucket, private like voice notes).

export const MAX_CHAT_PHOTO_BYTES = 5 * 1024 * 1024;
export const ALLOWED_CHAT_PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];
/** Shrunk on the phone before sending: plenty to see a leak or a dent. */
export const CHAT_PHOTO_MAX_SIDE = 1600;

// The not-null body column's stand-in, as for voice notes: read only by code
// that knows nothing of photos (an email snippet); the app shows the photo.
export const CHAT_PHOTO_PLACEHOLDER_BODY = "📷 Photo";
