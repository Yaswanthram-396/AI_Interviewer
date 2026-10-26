"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { AlertCircle, CheckCircle2, Clock, FlaskConical, Headphones, Loader2, Mic, MicOff, PhoneOff, ScrollText, Wifi, WifiOff, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatClock } from "@/lib/format";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Logo } from "@/components/ui/display";
import { Modal } from "@/components/ui/Modal";
import type { TurnPhase } from "@/features/interview/interviewTurnMachine";
import { useRoomPreferences } from "./roomPreferences";
import { SiriVisualizer, phaseLabel } from "./SiriVisualizer";

export interface RoomMessage {
  id: string;
  sender: "ai" | "candidate";
  text: string;
}

export interface RoomViewProps {
  title: string;
  subtitle?: string;
  /** "simulated" is clearly labelled: nothing in the room is scored by a model. */
  mode: "live" | "simulated";
  phase: TurnPhase;
  connection: "connected" | "connecting" | "disconnected";
  started: boolean;
  completed: boolean;
  messages: RoomMessage[];
  liveTranscript: string;
  remainingSeconds: number;
  totalSeconds: number;
  question: { current: number; total: number } | null;
  mic: { state: "off" | "starting" | "live" | "muted"; level: number; disabled: boolean };
  error: string | null;
  selfVideoRef?: RefObject<HTMLVideoElement>;
  onStart: () => void;
  onToggleMic: () => void;
  onEnd: () => void;
  onDismissError?: () => void;
}

function ConnectionPill({ connection, mode }: { connection: RoomViewProps["connection"]; mode: RoomViewProps["mode"] }) {
  if (mode === "simulated") {
    return (
      <Badge tone="accent">
        <FlaskConical className="size-3" aria-hidden /> Simulated session
      </Badge>
    );
  }
  const map = {
    connected: { tone: "brand" as const, label: "Connected", icon: Wifi },
    connecting: { tone: "accent" as const, label: "Connecting…", icon: Loader2 },
    disconnected: { tone: "danger" as const, label: "Disconnected", icon: WifiOff },
  }[connection];
  const Icon = map.icon;
  return (
    <span role="status" aria-live="polite">
      <Badge tone={map.tone}>
        <Icon className={cn("size-3", connection === "connecting" && "animate-spin")} aria-hidden /> {map.label}
      </Badge>
    </span>
  );
}

function Transcript({ messages, liveTranscript, className }: { messages: RoomMessage[]; liveTranscript: string; className?: string }) {
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    end.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, liveTranscript]);
  return (
    <div className={cn("flex flex-col", className)}>
      <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5" role="log" aria-live="polite" aria-label="Interview transcript">
        {messages.length === 0 && !liveTranscript && <p className="text-sm text-ink-3">The conversation will appear here as you speak.</p>}
        {messages.map((message) => (
          <div key={message.id} className={cn("max-w-[92%]", message.sender === "candidate" && "ml-auto")}>
            <p className={cn("mb-1 text-[11px] font-semibold uppercase tracking-[0.08em]", message.sender === "ai" ? "text-brand" : "text-right text-ink-3")}>{message.sender === "ai" ? "SIRI" : "You"}</p>
            <p className={cn("rounded-lg px-3.5 py-2.5 text-sm leading-relaxed", message.sender === "ai" ? "border border-line bg-surface text-ink" : "bg-sunken text-ink-2")}>{message.text}</p>
          </div>
        ))}
        {liveTranscript && (
          <div className="ml-auto max-w-[92%]">
            <p className="mb-1 text-right text-[11px] font-semibold uppercase tracking-[0.08em] text-accent-ink">You, speaking…</p>
            <p className="rounded-lg border border-dashed border-accent-line bg-accent-soft/50 px-3.5 py-2.5 text-sm italic leading-relaxed text-ink-2">{liveTranscript}</p>
          </div>
        )}
        <div ref={end} />
      </div>
    </div>
  );
}

/** Immersive, light-themed interview room. All state arrives as props, so live and simulated sessions look identical. */
export function RoomView(props: RoomViewProps) {
  const { title, subtitle, mode, phase, connection, started, completed, messages, liveTranscript, remainingSeconds, totalSeconds, question, mic, error, selfVideoRef } = props;
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [transcriptOpen, setTranscriptOpen] = useState(false);
  const { captions, reduceMotion } = useRoomPreferences();

  const lastAi = [...messages].reverse().find((message) => message.sender === "ai");
  const low = started && remainingSeconds <= 120 && remainingSeconds > 0;
  const progress = question ? Math.min(100, (Math.max(0, question.current - (phase === "AI_SPEAKING" || phase === "PROCESSING" ? 1 : 0)) / question.total) * 100) : 0;

  const micLabel =
    mic.state === "muted" ? "Your microphone is off while SIRI speaks" : mic.state === "live" ? "Microphone on. Stop to end your answer" : mic.state === "starting" ? "Starting microphone…" : "Start speaking";
  const MicIcon = mic.state === "muted" ? MicOff : Mic;

  return (
    <div className="flex h-screen flex-col bg-canvas">
      {/* Top bar */}
      <header className="flex h-14 shrink-0 items-center justify-between gap-4 border-b border-line bg-surface px-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-4">
          <Logo className="hidden sm:inline-flex" />
          <span className="hidden h-5 w-px bg-line sm:block" aria-hidden />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-ink">{title}</p>
            {subtitle && <p className="truncate text-xs text-ink-3">{subtitle}</p>}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <ConnectionPill connection={connection} mode={mode} />
          <span className={cn("tnum inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[13px] font-medium", low ? "border-accent-line bg-accent-soft text-accent-ink" : "border-line text-ink-2")} aria-label={`Time remaining ${formatClock(remainingSeconds)}`}>
            <Clock className="size-3.5" aria-hidden />
            {started ? formatClock(remainingSeconds) : formatClock(totalSeconds)}
          </span>
          <Button variant="secondary" size="sm" icon={<PhoneOff className="size-3.5" />} onClick={() => setConfirmEnd(true)} disabled={!started || completed} className="hover:border-danger/40 hover:text-danger">
            <span className="hidden sm:inline">End interview</span>
            <span className="sm:hidden">End</span>
          </Button>
        </div>
      </header>

      {/* Progress */}
      <div className="flex shrink-0 items-center gap-4 border-b border-line bg-surface px-4 py-2.5 sm:px-6">
        <p className="tnum shrink-0 text-xs text-ink-3">{question ? `Question ${Math.min(question.current, question.total)} of ${question.total}` : "Not started"}</p>
        <div className="h-1 flex-1 overflow-hidden rounded-full bg-sunken" role="progressbar" aria-label="Interview progress" aria-valuenow={Math.round(progress)} aria-valuemin={0} aria-valuemax={100}>
          <div className="h-full rounded-full bg-brand transition-[width] duration-700" style={{ width: `${progress}%` }} />
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* Stage */}
        <main className="relative flex min-w-0 flex-1 flex-col items-center justify-between px-4 py-6 sm:py-8">
          {error && (
            <div role="alert" className="absolute left-1/2 top-4 z-10 flex w-[min(92%,520px)] -translate-x-1/2 items-start gap-2.5 rounded-lg border border-accent-line bg-accent-soft px-4 py-3 text-sm text-accent-ink shadow-card">
              <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span className="flex-1">{error}</span>
              {props.onDismissError && (
                <button type="button" onClick={props.onDismissError} aria-label="Dismiss" className="rounded p-0.5 hover:bg-accent/10">
                  <X className="size-4" />
                </button>
              )}
            </div>
          )}

          {!started ? (
            <div className="m-auto flex max-w-md flex-col items-center text-center animate-fade-up">
              <SiriVisualizer phase="IDLE" className="mb-8 scale-75 sm:scale-90" />
              <h1 className="text-2xl font-semibold tracking-tight text-ink">{completed ? "Interview complete" : "Ready when you are"}</h1>
              <p className="mt-2 text-sm text-ink-3">
                {completed ? "Thank you. Your report is being prepared." : "SIRI will speak first and your microphone turns on when it finishes. Aim for a quiet room."}
              </p>
              {!completed && (
                <>
                  <ul className="mt-6 grid w-full gap-2 text-left text-sm text-ink-2">
                    <li className="flex items-center gap-2.5 rounded-md border border-line bg-surface px-3.5 py-2.5">
                      <Headphones className="size-4 text-ink-3" aria-hidden /> Headphones recommended
                    </li>
                    <li className="flex items-center gap-2.5 rounded-md border border-line bg-surface px-3.5 py-2.5">
                      <Mic className="size-4 text-ink-3" aria-hidden /> Allow microphone access when asked
                    </li>
                    <li className="flex items-center gap-2.5 rounded-md border border-line bg-surface px-3.5 py-2.5">
                      <CheckCircle2 className="size-4 text-brand" aria-hidden /> No accent or grammar penalties
                    </li>
                  </ul>
                  <Button size="lg" className="mt-7 w-full" onClick={props.onStart} disabled={mode === "live" && connection !== "connected"} icon={mode === "live" && connection !== "connected" ? <Loader2 className="size-4 animate-spin" /> : undefined}>
                    {mode === "live" && connection !== "connected" ? "Connecting…" : "Start interview"}
                  </Button>
                </>
              )}
            </div>
          ) : (
            <>
              <div className="flex flex-1 items-center justify-center">
                <SiriVisualizer phase={phase} level={mic.level} calm={reduceMotion} />
              </div>

              <div className="w-full max-w-2xl text-center">
                <p className={cn("text-[13px] font-semibold uppercase tracking-[0.1em]", phase === "LISTENING" ? "text-accent-ink" : "text-brand")} role="status" aria-live="polite">
                  {completed ? "Interview complete" : phaseLabel(phase)}
                </p>
                <p className="mt-3 min-h-[4.5rem] text-[19px] leading-relaxed text-ink sm:text-[21px]">
                  {phase === "PROCESSING" ? <span className="text-ink-3">Thinking about your answer…</span> : captions ? (lastAi?.text ?? "") : ""}
                </p>
              </div>
            </>
          )}

          {/* Controls */}
          {started && !completed && (
            <div className="mt-6 flex items-center gap-4">
              <button
                type="button"
                onClick={props.onToggleMic}
                disabled={mic.disabled}
                aria-label={micLabel}
                title={micLabel}
                className={cn(
                  "flex size-16 items-center justify-center rounded-full border transition-all disabled:cursor-not-allowed",
                  mic.state === "live" ? "border-accent bg-accent text-white shadow-pop" : mic.state === "muted" ? "border-line bg-sunken text-ink-3" : "border-brand bg-brand text-white shadow-card hover:bg-brand-hover",
                  mic.state === "starting" && "opacity-70",
                )}
              >
                {mic.state === "starting" ? <Loader2 className="size-6 animate-spin" aria-hidden /> : <MicIcon className="size-6" aria-hidden />}
              </button>
              <div className="w-56 text-left">
                <p className="text-sm font-medium text-ink">{mic.state === "muted" ? "Mic off while SIRI speaks" : mic.state === "live" ? "You're on the mic" : mic.state === "starting" ? "Starting microphone" : "Press to answer"}</p>
                <p className="mt-0.5 text-xs text-ink-3">{mic.state === "live" ? "Press again to finish your answer" : "It switches on automatically after SIRI"}</p>
              </div>
              <button type="button" onClick={() => setTranscriptOpen(true)} className="flex size-11 items-center justify-center rounded-full border border-line-strong bg-surface text-ink-2 hover:bg-sunken lg:hidden" aria-label="Open transcript">
                <ScrollText className="size-5" />
              </button>
            </div>
          )}

          {selfVideoRef && (
            <video ref={selfVideoRef} autoPlay playsInline muted className={cn("absolute bottom-4 left-4 hidden h-28 w-40 rounded-lg border border-line object-cover shadow-card sm:block", !started && "hidden sm:hidden")} aria-label="Your camera preview" />
          )}
        </main>

        {/* Transcript (desktop) */}
        <aside className="hidden w-[380px] shrink-0 flex-col border-l border-line bg-surface lg:flex">
          <div className="flex h-12 items-center border-b border-line px-5 text-sm font-medium text-ink">Transcript</div>
          <Transcript messages={messages} liveTranscript={liveTranscript} className="min-h-0 flex-1" />
        </aside>
      </div>

      {/* Transcript (mobile sheet) */}
      {transcriptOpen && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Transcript">
          <button type="button" className="absolute inset-0 bg-ink/30" aria-label="Close transcript" onClick={() => setTranscriptOpen(false)} />
          <div className="absolute inset-x-0 bottom-0 flex h-[70vh] flex-col rounded-t-xl border-t border-line bg-surface shadow-pop animate-fade-up">
            <div className="flex h-12 shrink-0 items-center justify-between border-b border-line px-5">
              <span className="text-sm font-medium text-ink">Transcript</span>
              <button type="button" onClick={() => setTranscriptOpen(false)} aria-label="Close transcript" className="rounded p-1 hover:bg-sunken">
                <X className="size-4" />
              </button>
            </div>
            <Transcript messages={messages} liveTranscript={liveTranscript} className="min-h-0 flex-1" />
          </div>
        </div>
      )}

      <Modal
        open={confirmEnd}
        onOpenChange={setConfirmEnd}
        size="sm"
        title="End the interview?"
        description="Your answers so far are kept and your report is built from them. You cannot resume this session afterwards."
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmEnd(false)}>
              Keep going
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                setConfirmEnd(false);
                props.onEnd();
              }}
            >
              End interview
            </Button>
          </>
        }
      />
    </div>
  );
}
