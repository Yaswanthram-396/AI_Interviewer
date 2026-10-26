"use client";

import { cn } from "@/lib/cn";
import type { TurnPhase } from "@/features/interview/interviewTurnMachine";

const BARS = 31;

/** Deterministic per-bar variation so the wave looks organic but never re-randomises between renders. */
const variation = (index: number) => {
  const x = Math.sin(index * 12.9898) * 43758.5453;
  return x - Math.floor(x);
};

const ENVELOPE = Array.from({ length: BARS }, (_, index) => {
  const centre = (BARS - 1) / 2;
  const distance = Math.abs(index - centre) / centre;
  return 0.25 + 0.75 * Math.cos((distance * Math.PI) / 2); // taller in the middle
});

interface SiriVisualizerProps {
  phase: TurnPhase;
  /** 0..1 live microphone level, used while listening. */
  level?: number;
  /** Calm mode: no looping animation (the speaking wave becomes static). */
  calm?: boolean;
  className?: string;
}

const LABEL: Record<TurnPhase, string> = {
  IDLE: "Ready",
  AI_SPEAKING: "SIRI is speaking",
  LISTENING: "Listening to you",
  PROCESSING: "SIRI is thinking",
  CANCELLED: "Interrupted",
};

/**
 * The room's centrepiece. Speaking is green and animated, listening is orange and follows the
 * microphone level, thinking is a calm rotating arc. Motion stops under prefers-reduced-motion.
 */
export function SiriVisualizer({ phase, level = 0, calm = false, className }: SiriVisualizerProps) {
  const speaking = phase === "AI_SPEAKING" && !calm;
  const listening = phase === "LISTENING";
  const thinking = phase === "PROCESSING";
  const color = listening ? "bg-accent" : "bg-brand";
  const ring = listening ? "border-accent/30" : "border-brand/25";

  return (
    <div className={cn("relative flex items-center justify-center", className)} role="img" aria-label={LABEL[phase]}>
      {/* Soft concentric halos */}
      <span className={cn("absolute size-[300px] rounded-full border sm:size-[380px]", ring, (speaking || listening) && !calm && "animate-soft-pulse")} aria-hidden />
      <span className={cn("absolute size-[230px] rounded-full border sm:size-[290px]", ring, (speaking || listening) && !calm && "animate-soft-pulse [animation-delay:0.5s]")} aria-hidden />
      <span className={cn("absolute size-[170px] rounded-full sm:size-[210px]", listening ? "bg-accent-soft" : "bg-brand-soft")} aria-hidden />

      {thinking && !calm && (
        <span className="absolute size-[190px] animate-orbit rounded-full border-2 border-transparent border-t-brand sm:size-[230px]" aria-hidden />
      )}

      {/* Waveform */}
      <div className="relative flex h-24 items-center gap-[3px] sm:h-28 sm:gap-1" aria-hidden>
        {ENVELOPE.map((height, index) => {
          const wobble = 0.55 + variation(index) * 0.45;
          const scale = speaking ? undefined : phase === "AI_SPEAKING" ? 0.45 * wobble + 0.2 : listening ? Math.min(1, 0.12 + level * 1.4 * wobble) : thinking ? 0.14 + 0.06 * wobble : 0.1;
          return (
            <span
              key={index}
              className={cn("w-[3px] origin-center rounded-full transition-transform duration-150 sm:w-1", color, thinking && "opacity-60")}
              style={{
                height: `${height * 100}%`,
                ...(speaking
                  ? { animation: `siri-bar ${0.7 + variation(index + 7) * 0.7}s ease-in-out ${variation(index + 3) * -1}s infinite` }
                  : { transform: `scaleY(${scale})` }),
              }}
            />
          );
        })}
      </div>
    </div>
  );
}

export const phaseLabel = (phase: TurnPhase) => LABEL[phase];
