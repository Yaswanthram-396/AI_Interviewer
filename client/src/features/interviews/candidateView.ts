import type { Assignment, InterviewRecord } from "./types";

export interface AssignedInterview {
  interview: InterviewRecord;
  assignment: Assignment;
}

/**
 * The interviews a candidate may see: only ones assigned to their email, and only once published.
 * Drafts and archived interviews are never exposed to candidates, even if they were assigned.
 */
export function assignedTo(interviews: readonly InterviewRecord[], email: string | undefined): AssignedInterview[] {
  if (!email) return [];
  const wanted = email.trim().toLowerCase();
  return interviews.flatMap((interview) => {
    if (interview.status !== "active" && interview.status !== "completed") return [];
    const assignment = interview.assignments.find((item) => item.email.trim().toLowerCase() === wanted);
    return assignment ? [{ interview, assignment }] : [];
  });
}

export function groupAssigned(items: readonly AssignedInterview[]) {
  return {
    inProgress: items.filter((item) => item.assignment.status === "in_progress"),
    upcoming: items.filter((item) => item.assignment.status === "invited" || item.assignment.status === "not_started"),
    completed: items.filter((item) => item.assignment.status === "completed"),
  };
}

export function findAssigned(interviews: readonly InterviewRecord[], email: string | undefined, interviewId: string): AssignedInterview | undefined {
  return assignedTo(interviews, email).find((item) => item.interview.id === interviewId);
}

export interface ReportRef {
  interviewId: string;
  id: string;
  candidate: { email: string };
}

/**
 * What a signed-in candidate sees from the *live API*. The backend already decides which interviews a
 * candidate may see: when auth is enforced it returns only their assigned, published interviews, and
 * when it is not enforced it returns everything (the original open behaviour). Re-filtering here by
 * "assigned to my email" would hide every interview that has no assignment record, so the client only
 * drops drafts and archived ones and attaches the candidate's own assignment (or a neutral one).
 *
 * A finished interview is recognised by their own assignment, or by a report that belongs to them.
 */
export function liveCandidateInterviews(
  interviews: readonly InterviewRecord[],
  user: { name: string; email: string } | undefined,
  reports: readonly ReportRef[],
): AssignedInterview[] {
  if (!user) return [];
  const email = user.email.trim().toLowerCase();
  return interviews
    .filter((interview) => interview.status === "active" || interview.status === "completed")
    .map((interview) => {
      const own = interview.assignments.find((item) => item.email.trim().toLowerCase() === email);
      if (own) return { interview, assignment: own };
      const report = reports.find((item) => item.interviewId === interview.id && item.candidate.email.trim().toLowerCase() === email);
      const assignment: Assignment = {
        id: `self-${interview.id}`,
        name: user.name,
        email,
        status: report ? "completed" : "not_started",
        invitedAt: interview.createdAt,
        reportId: report?.id,
      };
      return { interview, assignment };
    });
}
