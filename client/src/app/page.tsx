"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { portalHome } from "@/features/session/session";
import { useSession } from "@/features/session/useSession";

/** The front door: signed-in people go to their portal, everyone else to sign in. */
export default function Home() {
  const router = useRouter();
  const { state } = useSession();

  useEffect(() => {
    if (state.status === "authenticated") router.replace(portalHome(state.user.portal));
    else if (state.status === "anonymous") router.replace("/login");
  }, [state, router]);

  return (
    <div role="status" className="flex min-h-screen items-center justify-center gap-2 text-sm text-ink-3">
      <Loader2 className="size-4 animate-spin" aria-hidden /> Loading SIRI…
    </div>
  );
}
