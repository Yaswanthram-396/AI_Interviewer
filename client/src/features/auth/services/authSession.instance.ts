import { API_URL } from "@/config/env";
import { createAuthSession } from "./authSession";

/** Uses the Web Locks API (when present) so concurrent tabs don't rotate the same refresh token at once. */
async function withBrowserLock<T>(fn: () => Promise<T>): Promise<T> {
  if (typeof navigator === "undefined" || !navigator.locks) return fn();
  return await navigator.locks.request("ai-interviewer-auth-refresh", fn);
}

/** The app-wide session. Import this rather than creating another. */
export const authSession = createAuthSession({ apiUrl: API_URL, withLock: withBrowserLock });
