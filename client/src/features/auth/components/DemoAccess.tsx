"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ShieldCheck, UserRound } from "lucide-react";
import { demoSession } from "@/features/session/demoSession";
import { DEMO_ACCOUNTS, portalHome, type Portal } from "@/features/session/session";
import { useSession } from "@/features/session/useSession";
import { safeNextPath } from "../schemas/authSchemas";

const OPTIONS: { portal: Portal; icon: typeof UserRound; title: string; text: string }[] = [
  { portal: "admin", icon: ShieldCheck, title: "Explore the Admin portal", text: "Create interviews and review candidate reports" },
  { portal: "candidate", icon: UserRound, title: "Explore the Candidate portal", text: "Take an interview and see your report" },
];

/**
 * One-click demo sessions so the product can be explored without creating accounts. A demo session
 * never talks to the API for identity; it only unlocks the sample data stored in the browser.
 */
export function DemoAccess() {
  const router = useRouter();
  const params = useSearchParams();
  const { state } = useSession();

  // A demo user who lands on /login is sent on to their portal.
  useEffect(() => {
    if (state.status === "authenticated") router.replace(safeNextPath(params.get("next")) ?? portalHome(state.user.portal));
  }, [state, router, params]);

  const enter = (portal: Portal) => {
    demoSession.signIn(portal);
    router.replace(safeNextPath(params.get("next")) ?? portalHome(portal));
  };

  return (
    <div className="mt-8">
      <div className="mb-4 flex items-center gap-3 text-xs text-ink-3">
        <span className="h-px flex-1 bg-line" />
        or try the demo
        <span className="h-px flex-1 bg-line" />
      </div>
      <div className="grid gap-2">
        {OPTIONS.map(({ portal, icon: Icon, title, text }) => (
          <button
            key={portal}
            type="button"
            onClick={() => enter(portal)}
            className="flex items-center gap-3 rounded-lg border border-line-strong bg-surface px-4 py-3 text-left transition-colors hover:border-brand/50 hover:bg-brand-soft/50"
          >
            <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-sunken text-ink-2">
              <Icon className="size-4" aria-hidden />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-medium text-ink">{title}</span>
              <span className="block truncate text-xs text-ink-3">
                {text} · as {DEMO_ACCOUNTS[portal].name}
              </span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
