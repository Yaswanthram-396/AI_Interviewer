import { Badge, type Tone } from "@/components/ui/Badge";
import { ASSIGNMENT_LABEL, STATUS_LABEL, type AssignmentStatus, type InterviewStatus } from "../types";

const INTERVIEW_TONE: Record<InterviewStatus, Tone> = { draft: "neutral", active: "brand", completed: "outline", archived: "neutral" };
const ASSIGNMENT_TONE: Record<AssignmentStatus, Tone> = { invited: "neutral", not_started: "outline", in_progress: "accent", completed: "brand" };

export function InterviewStatusBadge({ status }: { status: InterviewStatus }) {
  return (
    <Badge tone={INTERVIEW_TONE[status]} dot={status === "active"}>
      {STATUS_LABEL[status]}
    </Badge>
  );
}

export function AssignmentStatusBadge({ status }: { status: AssignmentStatus }) {
  return (
    <Badge tone={ASSIGNMENT_TONE[status]} dot={status === "in_progress"}>
      {ASSIGNMENT_LABEL[status]}
    </Badge>
  );
}
