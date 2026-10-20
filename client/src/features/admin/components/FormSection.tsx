import type { ReactNode } from "react";

interface FormSectionProps {
  id: string;
  letter: string;
  title: string;
  description?: string;
  children: ReactNode;
}

/** A lettered form section: an editorial heading with dividers instead of a card around every block. */
export function FormSection({ id, letter, title, description, children }: FormSectionProps) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-24 border-t border-line pt-9 first:border-t-0 first:pt-0">
      <div className="mb-6 flex items-start gap-4">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-brand-soft text-[13px] font-semibold text-brand" aria-hidden>
          {letter}
        </span>
        <div>
          <h2 id={`${id}-title`} className="text-base font-semibold text-ink">
            {title}
          </h2>
          {description && <p className="mt-1 text-sm text-ink-3">{description}</p>}
        </div>
      </div>
      <div className="sm:pl-11">{children}</div>
    </section>
  );
}
