"use client";

import { cn } from "@/lib/cn";
import { SwitchRow } from "@/components/ui/form";
import { PERSONALITIES, type BehaviorConfig, type Personality } from "@/features/interviews/types";

interface BehaviorSectionProps {
  value: BehaviorConfig;
  onChange: (value: BehaviorConfig) => void;
  error?: string;
}

const TOGGLES: { key: Exclude<keyof BehaviorConfig, "personality">; label: string; description: string }[] = [
  { key: "contextualFollowUps", label: "Contextual follow-up questions", description: "SIRI asks follow-ups based on what the candidate actually said." },
  { key: "adaptiveDifficulty", label: "Adaptive difficulty", description: "Question difficulty moves up or down with sustained performance, never from a single answer." },
  { key: "clarifications", label: "Clarification questions", description: "If an answer is unclear SIRI asks for clarification instead of marking it wrong." },
  { key: "allowRepeat", label: "Allow question repetition", description: 'Candidates can say "repeat the question".' },
  { key: "allowSkip", label: "Allow skipping questions", description: "Skipped questions are recorded but not scored." },
  { key: "voice", label: "Voice-based interaction", description: "SIRI speaks and listens. Turn off for a text-only interview." },
  { key: "interruptions", label: "Candidate interruption handling", description: "Let candidates talk over SIRI. Off by default: SIRI finishes speaking before listening." },
];

/** SIRI's behaviour switches and personality. The follow-up limit lives in Configuration (section B). */
export function BehaviorSection({ value, onChange, error }: BehaviorSectionProps) {
  const togglePersonality = (personality: Personality) => {
    const selected = value.personality.includes(personality);
    onChange({ ...value, personality: selected ? value.personality.filter((item) => item !== personality) : [...value.personality, personality] });
  };

  return (
    <div className="grid gap-8 lg:grid-cols-[1.1fr_1fr]">
      <div className="divide-y divide-line">
        {TOGGLES.map(({ key, label, description }) => (
          <SwitchRow key={key} checked={value[key]} onChange={(checked) => onChange({ ...value, [key]: checked })} label={label} description={description} />
        ))}
      </div>

      <fieldset>
        <legend className="text-[13px] font-medium text-ink">Interviewer personality</legend>
        <p className="mt-1 text-xs text-ink-3">Choose one or more. Professional and Friendly is the default.</p>
        <div className="mt-3 grid gap-2">
          {PERSONALITIES.map((option) => {
            const selected = value.personality.includes(option.value);
            return (
              <button
                key={option.value}
                type="button"
                role="checkbox"
                aria-checked={selected}
                onClick={() => togglePersonality(option.value)}
                className={cn("flex items-start gap-3 rounded-md border px-3.5 py-3 text-left transition-colors", selected ? "border-brand bg-brand-soft/60" : "border-line-strong bg-surface hover:border-ink-3")}
              >
                <span className={cn("mt-0.5 flex size-4 shrink-0 items-center justify-center rounded border", selected ? "border-brand bg-brand text-white" : "border-line-strong")} aria-hidden>
                  {selected && (
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                      <path d="M2 5.2 4.1 7.3 8 3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </span>
                <span>
                  <span className="block text-sm font-medium text-ink">{option.label}</span>
                  <span className="block text-xs text-ink-3">{option.hint}</span>
                </span>
              </button>
            );
          })}
        </div>
        {error && (
          <p role="alert" className="mt-2 text-xs text-danger">
            {error}
          </p>
        )}
      </fieldset>
    </div>
  );
}
