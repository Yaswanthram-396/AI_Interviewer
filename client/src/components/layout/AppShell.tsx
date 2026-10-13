"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogOut, Menu, X, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";
import { Avatar, Logo } from "@/components/ui/display";
import { Badge } from "@/components/ui/Badge";
import type { Portal } from "@/features/session/session";
import { useSession } from "@/features/session/useSession";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Match only the exact path (for section roots like /admin). */
  exact?: boolean;
  /** Custom active test, for sections whose child routes overlap a sibling item. */
  match?: (pathname: string) => boolean;
}

function isActive(pathname: string, item: NavItem) {
  if (item.match) return item.match(pathname);
  return item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
}

function SidebarContent({ portal, nav, onNavigate }: { portal: Portal; nav: NavItem[]; onNavigate?: () => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const { state, signOut } = useSession();
  const user = state.user;

  const handleSignOut = async () => {
    await signOut();
    router.replace("/login");
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-16 items-center justify-between px-5">
        <Logo />
        <Badge tone={portal === "admin" ? "accent" : "brand"}>{portal === "admin" ? "Admin" : "Candidate"}</Badge>
      </div>

      <nav aria-label={`${portal} navigation`} className="flex-1 space-y-0.5 px-3 py-2">
        {nav.map((item) => {
          const active = isActive(pathname, item);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={cn(
                "group flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                active ? "bg-brand-soft text-brand" : "text-ink-2 hover:bg-sunken hover:text-ink",
              )}
            >
              <Icon className={cn("size-[18px]", active ? "text-brand" : "text-ink-3 group-hover:text-ink-2")} aria-hidden />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {user && (
        <div className="border-t border-line p-3">
          <div className="flex items-center gap-3 rounded-md px-2 py-2">
            <Avatar name={user.name} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-ink">{user.name}</p>
              <p className="truncate text-xs text-ink-3">{user.source === "demo" ? "Demo account" : user.email}</p>
            </div>
            <button
              type="button"
              onClick={handleSignOut}
              className="rounded-md p-1.5 text-ink-3 transition-colors hover:bg-sunken hover:text-ink"
              aria-label="Sign out"
              title="Sign out"
            >
              <LogOut className="size-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Persistent sidebar on desktop, slide-over drawer on small screens. */
export function AppShell({ portal, nav, children }: { portal: Portal; nav: NavItem[]; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <div className="min-h-screen bg-canvas lg:pl-64">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-line bg-surface lg:block no-print">
        <SidebarContent portal={portal} nav={nav} />
      </aside>

      <div className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-line bg-surface/90 px-4 backdrop-blur lg:hidden no-print">
        <Logo />
        <button type="button" onClick={() => setOpen(true)} className="rounded-md p-2 text-ink-2 hover:bg-sunken" aria-label="Open navigation">
          <Menu className="size-5" />
        </button>
      </div>

      {open && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <button type="button" className="absolute inset-0 bg-ink/30" aria-label="Close navigation" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-72 max-w-[85%] bg-surface shadow-pop animate-fade-up">
            <button type="button" onClick={() => setOpen(false)} className="absolute right-3 top-4 rounded-md p-1.5 text-ink-3 hover:bg-sunken" aria-label="Close navigation">
              <X className="size-4" />
            </button>
            <SidebarContent portal={portal} nav={nav} onNavigate={() => setOpen(false)} />
          </div>
        </div>
      )}

      <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-8 sm:py-10">{children}</main>
    </div>
  );
}
