import type { FormEvent, ReactNode } from "react";
import Link from "next/link";
import { AlertCircle, AudioLines, FileText, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Logo } from "@/components/ui/display";

interface AuthFormLayoutProps {
  title: string;
  subtitle?: string;
  submitLabel: string;
  isSubmitting: boolean;
  formError: string | null;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  footerText: string;
  footerLinkLabel: string;
  footerHref: string;
  /** Rendered under the footer link, e.g. demo access on the sign-in page. */
  extra?: ReactNode;
  children: ReactNode;
}

const POINTS = [
  { icon: AudioLines, title: "Natural voice interviews", text: "SIRI listens, follows up and adapts, like a good interviewer would." },
  { icon: FileText, title: "Evidence-based reports", text: "Every score is tied to what the candidate actually said." },
  { icon: ShieldCheck, title: "Fair by design", text: "No accent or grammar penalties, and no voice-based personality guesses." },
];

/** A quiet waveform, drawn once, used as the brand illustration. */
function WaveIllustration() {
  const bars = [14, 26, 44, 70, 104, 132, 96, 118, 150, 112, 84, 126, 92, 60, 38, 24, 16];
  return (
    <svg viewBox="0 0 340 180" className="w-full max-w-md" role="img" aria-label="Sound wave illustration">
      <circle cx="170" cy="90" r="84" fill="none" stroke="var(--color-brand)" strokeOpacity="0.12" />
      <circle cx="170" cy="90" r="58" fill="none" stroke="var(--color-brand)" strokeOpacity="0.18" />
      {bars.map((height, index) => (
        <rect key={index} x={14 + index * 19} y={90 - height / 2} width="8" height={height} rx="4" fill={index % 5 === 3 ? "var(--color-accent)" : "var(--color-brand)"} fillOpacity={index % 5 === 3 ? 0.9 : 0.78} />
      ))}
    </svg>
  );
}

/** Shared chrome for the sign-in and sign-up forms: brand panel on the left, form on the right. */
export function AuthFormLayout({ title, subtitle, submitLabel, isSubmitting, formError, onSubmit, footerText, footerLinkLabel, footerHref, extra, children }: AuthFormLayoutProps) {
  return (
    <main className="grid min-h-screen bg-canvas lg:grid-cols-[1.05fr_1fr]">
      <aside className="relative hidden flex-col justify-between overflow-hidden border-r border-line bg-[#edf3ea] p-12 lg:flex">
        <Logo />
        <div className="space-y-10">
          <div>
            <h2 className="max-w-md text-[34px] font-semibold leading-[1.15] tracking-tight text-ink">Interviews that feel like a conversation, reports that show their work.</h2>
            <p className="mt-4 max-w-md text-[15px] leading-relaxed text-ink-2">SIRI runs structured technical interviews by voice and turns each answer into specific, actionable feedback.</p>
          </div>
          <WaveIllustration />
          <ul className="space-y-4">
            {POINTS.map(({ icon: Icon, title: pointTitle, text }) => (
              <li key={pointTitle} className="flex gap-3">
                <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md bg-white/70 text-brand">
                  <Icon className="size-4" aria-hidden />
                </span>
                <span>
                  <span className="block text-sm font-medium text-ink">{pointTitle}</span>
                  <span className="block text-[13px] text-ink-2">{text}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
        <p className="text-xs text-ink-3">© SIRI. AI interviews with human oversight.</p>
      </aside>

      <section className="flex items-center justify-center px-5 py-12 sm:px-10">
        <div className="w-full max-w-[400px] animate-fade-up">
          <Logo className="mb-10 lg:hidden" />
          <h1 className="text-2xl font-semibold tracking-tight text-ink">{title}</h1>
          {subtitle && <p className="mt-1.5 text-sm text-ink-3">{subtitle}</p>}

          <form onSubmit={onSubmit} noValidate className="mt-7 grid gap-4">
            {formError && (
              <p role="alert" className="flex items-start gap-2 rounded-md border border-danger/20 bg-danger-soft px-3 py-2.5 text-sm text-danger">
                <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
                {formError}
              </p>
            )}
            {children}
            <Button type="submit" size="lg" loading={isSubmitting} className="mt-1 w-full">
              {submitLabel}
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-ink-3">
            {footerText}{" "}
            <Link href={footerHref} className="font-medium text-brand hover:underline">
              {footerLinkLabel}
            </Link>
          </p>
          {extra}
        </div>
      </section>
    </main>
  );
}
