"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { demoSession } from "./demoSession";
import { nameFromEmail, portalForRole, type SessionUser } from "./session";

export type SessionState =
  | { status: "loading"; user: null }
  | { status: "anonymous"; user: null }
  | { status: "authenticated"; user: SessionUser };

const subscribeNoop = () => () => {};

/**
 * The single answer to "who is signed in?". A real (API) session wins; otherwise a demo session
 * is used. Both are mapped to the same `SessionUser`, so pages never branch on where it came from.
 */
export function useSession() {
  const { state: live, logout } = useAuth();
  const demo = useSyncExternalStore(demoSession.subscribe, demoSession.get, () => null);
  // Avoids a flash of "anonymous" before the client has had a chance to read storage.
  const hydrated = useSyncExternalStore(subscribeNoop, () => true, () => false);

  const state = useMemo<SessionState>(() => {
    if (live.status === "authenticated") {
      const { user } = live;
      return {
        status: "authenticated",
        user: {
          id: user.id,
          name: user.name?.trim() || nameFromEmail(user.email),
          email: user.email,
          portal: portalForRole(user.role),
          source: "live",
        },
      };
    }
    if (demo) return { status: "authenticated", user: demo };
    if (live.status === "loading" || !hydrated) return { status: "loading", user: null };
    return { status: "anonymous", user: null };
  }, [live, demo, hydrated]);

  const signOut = useCallback(async () => {
    demoSession.signOut();
    if (live.status === "authenticated") {
      try {
        await logout();
      } catch {
        // The local session is cleared regardless; the server-side token expires on its own.
      }
    }
  }, [live.status, logout]);

  return { state, signOut };
}
