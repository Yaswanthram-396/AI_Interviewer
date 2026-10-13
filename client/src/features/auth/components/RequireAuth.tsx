"use client";

import { useEffect, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "../hooks/useAuth";
import type { UserRole } from "../types/auth.types";

interface RequireAuthProps {
  /** Allowed roles; omit to allow any signed-in user. */
  roles?: readonly UserRole[];
  children: ReactNode;
}

const CenteredMessage = ({ children }: { children: ReactNode }) => (
  <div role="status" className="flex h-screen items-center justify-center text-lg font-semibold text-gray-700">
    {children}
  </div>
);

/**
 * Client-side route guard for UX only. Access control is enforced by the API; this just keeps
 * signed-out users out of screens that would fail and sends them to sign in.
 */
export function RequireAuth({ roles, children }: RequireAuthProps) {
  const { state } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (state.status === "anonymous") router.replace(`/login?next=${encodeURIComponent(pathname)}`);
  }, [state.status, router, pathname]);

  if (state.status !== "authenticated") return <CenteredMessage>Checking your session...</CenteredMessage>;
  if (roles && !roles.includes(state.user.role)) {
    return <CenteredMessage>Your account does not have access to this page.</CenteredMessage>;
  }
  return <>{children}</>;
}
