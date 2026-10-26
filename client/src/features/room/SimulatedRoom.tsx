"use client";

import { useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useInterviewCommands } from "@/features/data/DataProvider";
import type { InterviewRecord } from "@/features/interviews/types";
import type { CandidateReport } from "@/features/reports/types";
import { useSession } from "@/features/session/useSession";
import { RoomView } from "./RoomView";
import { useSimulatedInterview } from "./useSimulatedInterview";

/** The interview room for interviews without a live backend: same UI, scripted SIRI, simulated report. */
export function SimulatedRoom({ interview }: { interview: InterviewRecord }) {
  const router = useRouter();
  const commands = useInterviewCommands();
  const { state } = useSession();
  const user = state.status === "authenticated" ? state.user : null;
  const candidate = useMemo(() => ({ name: user?.name ?? "Candidate", email: (user?.email ?? "candidate@example.com").toLowerCase() }), [user?.name, user?.email]);
  const assignment = interview.assignments.find((item) => item.email.toLowerCase() === candidate.email);

  const onFinished = useCallback(
    (report: CandidateReport | null) => {
      if (!report) {
        toast("Interview ended before any answers were given, so no report was created.");
        router.replace(`/candidate/interviews/${interview.id}`);
        return;
      }
      commands.recordSimulatedReport(report);
      if (assignment) commands.patchAssignment(interview.id, assignment.id, { status: "completed", progress: 100, completedAt: report.completedAt, reportId: report.id });
      toast.success("Report ready", { description: "Opening your performance report." });
      setTimeout(() => router.replace(`/candidate/reports/${report.id}`), 1600);
    },
    [assignment, interview.id, router, commands],
  );

  const session = useSimulatedInterview({ interview, candidate, onFinished });

  const start = () => {
    if (assignment && assignment.status !== "completed") commands.patchAssignment(interview.id, assignment.id, { status: "in_progress", progress: 0 });
    session.start();
  };

  return (
    <RoomView
      title={interview.title}
      subtitle={`${interview.role} · simulated with sample questions`}
      mode="simulated"
      phase={session.phase}
      connection="connected"
      started={session.started}
      completed={session.completed}
      messages={session.messages}
      liveTranscript={session.liveTranscript}
      remainingSeconds={session.remainingSeconds}
      totalSeconds={session.totalSeconds}
      question={session.question}
      mic={{ state: session.micState, level: session.micLevel, disabled: session.micState !== "live" }}
      error={null}
      onStart={start}
      onToggleMic={session.toggleMic}
      onEnd={session.end}
    />
  );
}
