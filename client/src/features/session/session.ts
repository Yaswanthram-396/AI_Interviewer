/**
 * Who is using SIRI, as the UI needs to know it: a name, a portal (admin or candidate) and where
 * the identity came from. `live` identities come from the real auth API; `demo` identities let the
 * product be explored without creating accounts and never touch the backend.
 */
import type { UserRole } from "@/features/auth/types/auth.types";

export type Portal = "admin" | "candidate";
export type SessionSource = "live" | "demo";

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  portal: Portal;
  source: SessionSource;
}

export const DEMO_ACCOUNTS: Record<Portal, SessionUser> = {
  admin: { id: "demo-admin", name: "Priya Raman", email: "admin@siri-demo.dev", portal: "admin", source: "demo" },
  candidate: { id: "demo-candidate", name: "Arjun Mehta", email: "arjun.mehta@example.com", portal: "candidate", source: "demo" },
};

/** Recruiters and admins share the admin portal; the API still distinguishes them. */
export function portalForRole(role: UserRole): Portal {
  return role === "candidate" ? "candidate" : "admin";
}

export const portalHome = (portal: Portal) => (portal === "admin" ? "/admin" : "/candidate");

/** Display name for a live account that may not have set one. */
export function nameFromEmail(email: string) {
  const local = email.split("@")[0] ?? email;
  return local
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(" ");
}
