import { DEMO_ACCOUNTS, type Portal, type SessionUser } from "./session";

const KEY = "siri.demoSession";
const listeners = new Set<() => void>();
let cache: { raw: string | null; user: SessionUser | null } = { raw: null, user: null };

function read(): SessionUser | null {
  if (typeof window === "undefined") return null;
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(KEY);
  } catch {
    return null; // storage blocked: demo mode is simply unavailable
  }
  if (raw === cache.raw) return cache.user; // keep the snapshot referentially stable for useSyncExternalStore
  let user: SessionUser | null = null;
  const portal = raw as Portal | null;
  if (portal === "admin" || portal === "candidate") user = DEMO_ACCOUNTS[portal];
  cache = { raw, user };
  return user;
}

export const demoSession = {
  get: read,
  subscribe(listener: () => void) {
    listeners.add(listener);
    window.addEventListener("storage", listener);
    return () => {
      listeners.delete(listener);
      window.removeEventListener("storage", listener);
    };
  },
  signIn(portal: Portal) {
    try {
      window.localStorage.setItem(KEY, portal);
    } catch {
      /* storage blocked */
    }
    listeners.forEach((listener) => listener());
  },
  signOut() {
    try {
      window.localStorage.removeItem(KEY);
    } catch {
      /* storage blocked */
    }
    listeners.forEach((listener) => listener());
  },
};
