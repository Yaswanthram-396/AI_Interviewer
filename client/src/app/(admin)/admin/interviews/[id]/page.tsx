"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Archive, ArrowLeft, Copy, FileText, Pencil, Server, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/Badge";
import { Button, LinkButton } from "@/components/ui/Button";
import { Avatar, EmptyState, PageHeader, ScoreBar, SectionTitle, Surface } from "@/components/ui/display";
import { Modal } from "@/components/ui/Modal";
import { CandidateAssignment } from "@/features/admin/components/CandidateAssignment";
import { InterviewSummary } from "@/features/admin/components/InterviewSummary";
import { AssignCandidateForm } from "@/features/auth/components/AssignCandidateForm";
import { AssignmentStatusBadge, InterviewStatusBadge } from "@/features/interviews/components/StatusBadges";
import { useInterview, useInterviewCommands, useInterviewsStatus } from "@/features/data/DataProvider";
import type { Assignment } from "@/features/interviews/types";
import { useSession } from "@/features/session/useSession";
import { formatDate } from "@/lib/format";

export default function InterviewDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const record = useInterview(id);
  const commands = useInterviewCommands();
  const { status: loadStatus } = useInterviewsStatus();
  const { state } = useSession();
  const [adding, setAdding] = useState(false);
  const [pending, setPending] = useState<Assignment[]>([]);

  if (!record && loadStatus === "loading") return <p role="status" className="py-16 text-center text-sm text-ink-3">Loading interview…</p>;
  if (!record) {
    return (
      <Surface>
        <EmptyState
          icon={<FileText className="size-5" />}
          title="Interview not found"
          description="It may have been removed, or the link is wrong."
          action={<LinkButton href="/admin/interviews">Back to all interviews</LinkButton>}
        />
      </Surface>
    );
  }

  const saveCandidates = async () => {
    try {
      await commands.addAssignments(record.id, pending);
      toast.success(`${pending.length} candidate${pending.length === 1 ? "" : "s"} assigned`);
      setPending([]);
      setAdding(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not assign candidates.");
    }
  };

  const duplicate = async () => {
    try {
      const copy = await commands.duplicate(record.id);
      if (copy) {
        toast.success("Duplicated as a draft");
        router.push(`/admin/interviews/${copy.id}/edit`);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not duplicate.");
    }
  };

  const archive = async () => {
    try {
      await commands.archive(record.id);
      toast("Interview archived");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not archive.");
    }
  };

  const canAssignLive = Boolean(record.backendId) && state.status === "authenticated" && state.user.source === "live";

  return (
    <>
      <Link href="/admin/interviews" className="mb-5 inline-flex items-center gap-1.5 text-[13px] text-ink-3 hover:text-ink">
        <ArrowLeft className="size-3.5" /> All interviews
      </Link>

      <PageHeader
        eyebrow={
          <div className="flex flex-wrap items-center gap-2">
            <InterviewStatusBadge status={record.status} />
            <span className="font-mono text-xs text-ink-3">{record.code}</span>
            {record.backendId && (
              <Badge tone="brand">
                <Server className="size-3" aria-hidden /> Live backend
              </Badge>
            )}
          </div>
        }
        title={record.title}
        description={`${record.role} · ${record.department} · created ${formatDate(record.createdAt)}`}
        actions={
          <>
            <LinkButton href={`/admin/interviews/${record.id}/edit`} variant="secondary" icon={<Pencil className="size-4" />}>
              Edit
            </LinkButton>
            <Button variant="secondary" icon={<Copy className="size-4" />} onClick={duplicate}>
              Duplicate
            </Button>
            {record.status !== "archived" && (
              <Button variant="ghost" icon={<Archive className="size-4" />} onClick={archive}>
                Archive
              </Button>
            )}
          </>
        }
      />

      <div className="grid gap-10 xl:grid-cols-[1.25fr_1fr]">
        <section className="min-w-0">
          <SectionTitle
            title="Assigned candidates"
            description={`${record.assignments.length} assigned, ${record.assignments.filter((a) => a.status === "completed").length} completed`}
            action={
              <Button size="sm" variant="secondary" icon={<UserPlus className="size-3.5" />} onClick={() => setAdding(true)} disabled={record.status === "archived"}>
                Add candidates
              </Button>
            }
          />
          <Surface className="overflow-hidden">
            {record.assignments.length === 0 ? (
              <EmptyState icon={<UserPlus className="size-5" />} title="No candidates assigned" description="Add candidates so they can see this interview in their dashboard." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[520px] text-left text-sm">
                  <thead className="border-b border-line bg-canvas text-xs text-ink-3">
                    <tr>
                      <th className="px-4 py-3 font-medium">Candidate</th>
                      <th className="px-4 py-3 font-medium">Status</th>
                      <th className="px-4 py-3 font-medium">Progress</th>
                      <th className="px-4 py-3 text-right font-medium">Report</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {record.assignments.map((assignment) => (
                      <tr key={assignment.id}>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <Avatar name={assignment.name} size="sm" />
                            <div className="min-w-0">
                              <p className="truncate font-medium text-ink">{assignment.name}</p>
                              <p className="truncate text-xs text-ink-3">{assignment.email}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <AssignmentStatusBadge status={assignment.status} />
                        </td>
                        <td className="w-40 px-4 py-3">
                          {assignment.status === "completed" ? (
                            <span className="text-xs text-ink-3">{assignment.completedAt ? formatDate(assignment.completedAt) : "Done"}</span>
                          ) : assignment.status === "in_progress" && assignment.progress === undefined ? (
                            <span className="text-xs text-accent-ink">In the interview now</span>
                          ) : assignment.status === "in_progress" ? (
                            <div className="flex items-center gap-2">
                              <ScoreBar value={assignment.progress ?? 0} tone="accent" label="Interview progress" />
                              <span className="tnum w-9 text-xs text-ink-3">{assignment.progress ?? 0}%</span>
                            </div>
                          ) : (
                            <span className="text-xs text-ink-3">Not started</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {assignment.reportId ? (
                            <Link href={`/admin/reports/${assignment.reportId}`} className="text-[13px] font-medium text-brand hover:underline">
                              View report
                            </Link>
                          ) : (
                            <span className="text-xs text-ink-3">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Surface>

          {canAssignLive && (
            <div className="mt-6 rounded-lg border border-line bg-surface p-4">
              <p className="text-sm font-medium text-ink">Assign a registered candidate (live backend)</p>
              <p className="mt-1 text-xs text-ink-3">Gives a signed-up candidate account access to take this interview as a live voice session.</p>
              <AssignCandidateForm interviewId={record.backendId as string} />
            </div>
          )}
        </section>

        <section className="min-w-0">
          <SectionTitle title="Configuration" />
          <InterviewSummary config={record} />
        </section>
      </div>

      <Modal
        open={adding}
        onOpenChange={setAdding}
        size="lg"
        title="Add candidates"
        description="They will be marked Invited. Invitations are simulated in this prototype."
        footer={
          <>
            <Button variant="secondary" onClick={() => setAdding(false)}>
              Cancel
            </Button>
            <Button onClick={() => void saveCandidates()} disabled={pending.length === 0}>
              Assign {pending.length || ""} {pending.length === 1 ? "candidate" : "candidates"}
            </Button>
          </>
        }
      >
        <CandidateAssignment assignments={[...record.assignments, ...pending]} lockedIds={new Set(record.assignments.map((assignment) => assignment.id))} onChange={(all) => setPending(all.filter((assignment) => !record.assignments.some((existing) => existing.id === assignment.id)))} />
      </Modal>
    </>
  );
}
