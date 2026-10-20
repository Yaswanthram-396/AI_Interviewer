"use client";

import type { ReactNode } from "react";
import { FileBarChart2, ListChecks, Settings, UserRound } from "lucide-react";
import { AppShell, type NavItem } from "@/components/layout/AppShell";
import { RequireRole } from "@/features/session/RequireRole";

const NAV: NavItem[] = [
  {
    href: "/candidate",
    label: "My Interviews",
    icon: ListChecks,
    match: (path) => path === "/candidate" || path.startsWith("/candidate/interviews"),
  },
  { href: "/candidate/reports", label: "My Reports", icon: FileBarChart2 },
  { href: "/candidate/profile", label: "Profile", icon: UserRound },
  { href: "/candidate/settings", label: "Settings", icon: Settings },
];

export default function CandidateLayout({ children }: { children: ReactNode }) {
  return (
    <RequireRole portal="candidate">
      <AppShell portal="candidate" nav={NAV}>
        {children}
      </AppShell>
    </RequireRole>
  );
}
