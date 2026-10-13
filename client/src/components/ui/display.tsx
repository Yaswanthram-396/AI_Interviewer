import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/** Page title row: heading, optional description and primary actions. */
export function PageHeader({ title, description, actions, eyebrow }: { title: string; description?: string; actions?: ReactNode; eyebrow?: ReactNode }) {
  return (
    <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow && <div className="mb-2">{eyebrow}</div>}
        <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-[28px]">{title}</h1>
        {description && <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-ink-3">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

/** A white panel. Use sparingly: most content is laid out on the canvas with dividers instead. */
export function Surface({ className, children }: { className?: string; children: ReactNode }) {
  return <section className={cn("rounded-lg border border-line bg-surface shadow-card print-surface", className)}>{children}</section>;
}

export function SectionTitle({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="mb-4 flex items-end justify-between gap-4">
      <div>
        <h2 className="text-[15px] font-semibold text-ink">{title}</h2>
        {description && <p className="mt-0.5 text-[13px] text-ink-3">{description}</p>}
      </div>
      {action}
    </div>
  );
}

interface StatProps {
  label: string;
  value: ReactNode;
  hint?: string;
  icon?: ReactNode;
}

/** Compact statistic. Lives in a divided strip rather than four separate cards. */
export function Stat({ label, value, hint, icon }: StatProps) {
  return (
    <div className="px-5 py-4">
      <div className="flex items-center justify-between text-[13px] text-ink-3">
        <span>{label}</span>
        {icon && <span className="text-ink-3/80">{icon}</span>}
      </div>
      <div className="tnum mt-2 text-[28px] font-semibold leading-none tracking-tight text-ink">{value}</div>
      {hint && <div className="mt-2 text-xs text-ink-3">{hint}</div>}
    </div>
  );
}

/** Statistics laid out as one divided strip (1px gaps over a line-coloured backdrop) instead of separate cards. */
export function StatStrip({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line shadow-card lg:grid-cols-4 [&>*]:bg-surface">{children}</div>;
}

export function EmptyState({ icon, title, description, action }: { icon?: ReactNode; title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-14 text-center">
      {icon && <div className="mb-4 flex size-11 items-center justify-center rounded-full bg-sunken text-ink-3">{icon}</div>}
      <h3 className="text-sm font-semibold text-ink">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-sm text-ink-3">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

const AVATAR_TONES = ["bg-brand-soft text-brand", "bg-accent-soft text-accent-ink", "bg-sunken text-ink-2"] as const;

export function initialsOf(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "?"
  );
}

/** Initials avatar; the tone is stable per name so people keep their colour. */
export function Avatar({ name, size = "md", className }: { name: string; size?: "sm" | "md" | "lg"; className?: string }) {
  const tone = AVATAR_TONES[[...name].reduce((sum, ch) => sum + ch.charCodeAt(0), 0) % AVATAR_TONES.length];
  const dimension = size === "sm" ? "size-7 text-[11px]" : size === "lg" ? "size-12 text-base" : "size-9 text-xs";
  return (
    <span aria-hidden className={cn("inline-flex shrink-0 items-center justify-center rounded-full font-semibold", dimension, tone, className)}>
      {initialsOf(name)}
    </span>
  );
}

/** Horizontal score bar. `tone` is derived from the score unless given. */
export function ScoreBar({ value, max = 100, tone, className, label }: { value: number; max?: number; tone?: "brand" | "accent" | "muted"; className?: string; label?: string }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  const resolved = tone ?? (pct >= 70 ? "brand" : pct >= 50 ? "accent" : "muted");
  const fill = resolved === "brand" ? "bg-brand" : resolved === "accent" ? "bg-accent" : "bg-ink-3";
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuenow={Math.round(value)}
      aria-valuemin={0}
      aria-valuemax={max}
      className={cn("h-1.5 w-full overflow-hidden rounded-full bg-sunken", className)}
    >
      <div className={cn("h-full rounded-full transition-[width] duration-700 ease-out", fill)} style={{ width: `${pct}%` }} />
    </div>
  );
}

interface ScoreRingProps {
  value: number; // 0-100
  size?: number;
  stroke?: number;
  label?: string;
  tone?: "brand" | "accent" | "muted";
  children?: ReactNode;
}

/** Circular score indicator drawn in SVG (no chart dependency for a single value). */
export function ScoreRing({ value, size = 160, stroke = 10, tone = "brand", label, children }: ScoreRingProps) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const pct = Math.max(0, Math.min(100, value));
  const color = tone === "brand" ? "var(--color-brand)" : tone === "accent" ? "var(--color-accent)" : "var(--color-ink-3)";
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }} role="img" aria-label={label ?? `Score ${Math.round(pct)} out of 100`}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--color-sunken)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - pct / 100)}
          className="transition-[stroke-dashoffset] duration-1000 ease-out"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">{children}</div>
    </div>
  );
}

/** The SIRI wordmark: a quiet waveform glyph beside the name. */
export function Logo({ className, subtle }: { className?: string; subtle?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <span className="flex size-8 items-center justify-center rounded-lg bg-brand" aria-hidden>
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
          <rect x="1.5" y="7" width="2" height="4" rx="1" fill="#fff" />
          <rect x="5.5" y="3.5" width="2" height="11" rx="1" fill="#fff" />
          <rect x="9.5" y="1.5" width="2" height="15" rx="1" fill="#fff" />
          <rect x="13.5" y="5" width="2" height="8" rx="1" fill="#fff" />
        </svg>
      </span>
      <span className={cn("text-[17px] font-semibold tracking-tight", subtle ? "text-ink-2" : "text-ink")}>SIRI</span>
    </span>
  );
}

export function Divider({ className }: { className?: string }) {
  return <hr className={cn("border-line", className)} />;
}

/** Tiny label for sections of metadata. */
export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn("text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3", className)}>{children}</p>;
}
