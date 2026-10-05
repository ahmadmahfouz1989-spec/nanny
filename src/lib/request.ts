// fetch() rejects -- rather than returning an error response -- when the
// request never completes: a dropped connection, switching networks, a
// phone suspending the tab. Safari reports that as "TypeError: Load
// failed". Left unhandled it shows up in Sentry and, worse, leaves a
// button stuck on "Saving…" or a list loading forever. These helpers turn
// it into an ordinary "no response" the caller already knows how to show.

/** fetch() that resolves to null instead of throwing when the network fails. */
export async function request(input: RequestInfo | URL, init?: RequestInit): Promise<Response | null> {
  try {
    return await fetch(input, init);
  } catch {
    return null;
  }
}

/**
 * A JSON GET: the parsed body, or null on a network failure, an error
 * status, or a body that isn't JSON. Untyped by default, like res.json().
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getJson<T = any>(input: RequestInfo | URL, init?: RequestInit): Promise<T | null> {
  const res = await request(input, init);
  if (!res || !res.ok) return null;
  try {
    return (await res.json()) as T;
  } catch {
    return null;
  }
}
