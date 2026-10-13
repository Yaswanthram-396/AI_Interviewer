"use client";

import { useEffect, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { portalHome, type Portal } from "./session";
import { useSession } from "./useSession";

/**
 * UX guard for a portal. Signed-out visitors go to sign in (and come back); someone in the wrong
 * portal is sent to their own. Real access control is enforced by the API.
 */
export function RequireRole({ portal, children }: { portal: Portal; children: ReactNode }) {
  const { state } = useSession();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (state.status === "anonymous") router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    else if (state.status === "authenticated" && state.user.portal !== portal) router.replace(portalHome(state.user.portal));
  }, [state, portal, router, pathname]);

  if (state.status !== "authenticated" || state.user.portal !== portal) {
    return (
      <div role="status" className="flex min-h-screen items-center justify-center gap-2 text-sm text-ink-3">
        <Loader2 className="size-4 animate-spin" aria-hidden /> Checking your session…
      </div>
    );
  }
  return <>{children}</>;
}
