"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, FlaskConical, Lock, Mic, Play } from "lucide-react";
import { LinkButton } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { EmptyState, PageHeader, Surface } from "@/components/ui/display";
import { AssignmentStatusBadge } from "@/features/interviews/components/StatusBadges";
import { InterviewBrief } from "@/features/interviews/components/InterviewBrief";
import { useCandidateInterviews } from "@/features/data/DataProvider";

export default function CandidateInterviewPage() {
  const { id } = useParams<{ id: string }>();
  const { find, status, mode } = useCandidateInterviews();
  const found = find(id);

  if (!found && status === "loading") return <p role="status" className="py-16 text-center text-sm text-ink-3">Loading interview…</p>;

  // The same screen for "does not exist" and "not yours", so ids cannot be probed.
  if (!found) {
    return (
      <Surface>
        <EmptyState
          icon={<Lock className="size-5" />}
          title="Interview not available"
          description="This interview does not exist or has not been assigned to you."
          action={<LinkButton href="/candidate">Back to my interviews</LinkButton>}
        />
      </Surface>
    );
  }

  const { interview, assignment } = found;
  const live = Boolean(interview.backendId);
  const done = assignment.status === "completed";

  return (
    <>
      <Link href="/candidate" className="mb-5 inline-flex items-center gap-1.5 text-[13px] text-ink-3 hover:text-ink">
        <ArrowLeft className="size-3.5" /> My interviews
      </Link>

      <PageHeader
        eyebrow={
          <div className="flex flex-wrap items-center gap-2">
            <AssignmentStatusBadge status={assignment.status} />
            <span className="text-xs text-ink-3">
              {interview.role} · {interview.company || interview.department}
            </span>
          </div>
        }
        title={interview.title}
        actions={
          done && assignment.reportId ? (
            <LinkButton href={`/candidate/reports/${assignment.reportId}`} size="lg">
              View your report
            </LinkButton>
          ) : (
            <>
              <LinkButton href={`/candidate/interviews/${interview.id}/room`} size="lg" icon={live ? <Mic className="size-4" /> : <Play className="size-4" />}>
                {assignment.status === "in_progress" ? "Resume interview" : live ? "Start live interview" : "Start interview"}
              </LinkButton>
              {live && mode === "demo" && (
                <LinkButton href={`/candidate/interviews/${interview.id}/room?mode=simulated`} variant="secondary" size="lg" icon={<FlaskConical className="size-4" />}>
                  Try simulated
                </LinkButton>
              )}
            </>
          )
        }
      />

      <InterviewBrief config={interview} />

      <div className="mt-8 flex flex-wrap items-center gap-2 text-xs text-ink-3">
        <Badge tone={live ? "brand" : "accent"}>{live ? "Live voice interview" : "Simulated interview"}</Badge>
        {live ? "Runs on the SIRI backend with real speech recognition and AI evaluation." : "Uses sample questions and a scripted SIRI. Nothing is scored by a model."}
      </div>
    </>
  );
}
