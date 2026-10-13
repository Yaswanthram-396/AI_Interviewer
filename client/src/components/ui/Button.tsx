import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/cn";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "accent";
type Size = "sm" | "md" | "lg";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-brand text-white hover:bg-brand-hover shadow-card",
  secondary: "bg-surface text-ink border border-line-strong hover:bg-sunken",
  ghost: "text-ink-2 hover:bg-sunken",
  danger: "bg-danger text-white hover:opacity-90",
  accent: "bg-accent text-white hover:opacity-90",
};

const SIZES: Record<Size, string> = {
  sm: "h-8 px-3 text-[13px] gap-1.5",
  md: "h-9 px-4 text-sm gap-2",
  lg: "h-11 px-5 text-[15px] gap-2",
};

const base =
  "inline-flex items-center justify-center rounded-md font-medium transition-colors select-none disabled:cursor-not-allowed disabled:opacity-50";

interface ButtonStyleProps {
  variant?: Variant;
  size?: Size;
  className?: string;
}

export const buttonStyles = ({ variant = "primary", size = "md", className }: ButtonStyleProps = {}) =>
  cn(base, VARIANTS[variant], SIZES[size], className);

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, ButtonStyleProps {
  loading?: boolean;
  icon?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant, size, className, loading, icon, children, disabled, type = "button", ...rest },
  ref,
) {
  return (
    <button ref={ref} type={type} disabled={disabled || loading} className={buttonStyles({ variant, size, className })} {...rest}>
      {loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  );
});

interface LinkButtonProps extends ButtonStyleProps {
  href: string;
  children: ReactNode;
  icon?: ReactNode;
}

/** A link that looks like a button, so navigation stays a real anchor. */
export function LinkButton({ href, variant, size, className, icon, children }: LinkButtonProps) {
  return (
    <Link href={href} className={buttonStyles({ variant, size, className })}>
      {icon}
      {children}
    </Link>
  );
}
