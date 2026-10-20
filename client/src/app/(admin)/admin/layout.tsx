"use client";

import type { ReactNode } from "react";
import { ClipboardList, FileBarChart2, LayoutDashboard, PlusCircle, Settings } from "lucide-react";
import { AppShell, type NavItem } from "@/components/layout/AppShell";
import { RequireRole } from "@/features/session/RequireRole";

const NAV: NavItem[] = [
  { href: "/admin", label: "Overview", icon: LayoutDashboard, exact: true },
  { href: "/admin/interviews/new", label: "Create Interview", icon: PlusCircle, exact: true },
  {
    href: "/admin/interviews",
    label: "All Interviews",
    icon: ClipboardList,
    match: (path) => path === "/admin/interviews" || (path.startsWith("/admin/interviews/") && !path.startsWith("/admin/interviews/new")),
  },
  { href: "/admin/reports", label: "Candidate Reports", icon: FileBarChart2 },
  { href: "/admin/settings", label: "Settings", icon: Settings },
];

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <RequireRole portal="admin">
      <AppShell portal="admin" nav={NAV}>
        {children}
      </AppShell>
    </RequireRole>
  );
}
