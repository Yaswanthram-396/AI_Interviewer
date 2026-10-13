import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export type Tone = "neutral" | "brand" | "accent" | "danger" | "outline";

const TONES: Record<Tone, string> = {
  neutral: "bg-sunken text-ink-2",
  brand: "bg-brand-soft text-brand",
  accent: "bg-accent-soft text-accent-ink",
  danger: "bg-danger-soft text-danger",
  outline: "border border-line-strong text-ink-2",
};

interface BadgeProps {
  tone?: Tone;
  dot?: boolean;
  className?: string;
  children: ReactNode;
}

/** Compact status / category label. */
export function Badge({ tone = "neutral", dot, className, children }: BadgeProps) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-medium", TONES[tone], className)}>
      {dot && <span className="size-1.5 rounded-full bg-current" aria-hidden />}
      {children}
    </span>
  );
}
