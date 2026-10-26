"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import InterviewBot from "@/app/components/interviewBot";
import type { InterviewRecord } from "@/features/interviews/types";

/**
 * The real thing: the existing WebSocket / Deepgram / Vertex / TTS session, shown in the new room.
 * `backendId` is the backend's interview id. When the interview ends the candidate goes to the
 * report SIRI just produced (its id is the session id); it is written a moment later, so the page waits for it.
 */
export function LiveRoom({ interview, backendId }: { interview?: InterviewRecord; backendId: string }) {
  const router = useRouter();
  const back = interview ? `/candidate/interviews/${interview.id}` : "/candidate";
  return (
    <InterviewBot
      id={backendId}
      title={interview?.title ?? "Live interview"}
      subtitle={interview ? `${interview.role} · live voice interview` : "Live voice interview"}
      durationMinutes={interview?.durationMinutes ?? 15}
      onFinished={(reason, sessionId) => {
        toast.success(reason === "completed" ? "Interview complete" : "Interview ended", { description: "Preparing your report." });
        router.replace(sessionId ? `/candidate/reports/${sessionId}?fresh=1` : back);
      }}
    />
  );
}
