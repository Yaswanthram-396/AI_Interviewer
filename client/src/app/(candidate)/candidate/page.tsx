"use client";

import Link from "next/link";
import { ArrowRight, CalendarClock, CheckCircle2, ClipboardList, PlayCircle } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { LinkButton } from "@/components/ui/Button";
import { EmptyState, PageHeader, ScoreBar, SectionTitle, Stat, StatStrip, Surface } from "@/components/ui/display";
import { groupAssigned, type AssignedInterview } from "@/features/interviews/candidateView";
import { useCandidateInterviews, useReports } from "@/features/data/DataProvider";
import { PerformanceBadge } from "@/features/reports/components/PerformanceBadge";
import { useSession } from "@/features/session/useSession";
import { formatDate, formatDuration } from "@/lib/format";

function InterviewRow({ item, cta, href }: { item: AssignedInterview; cta: string; href: string }) {
  const { interview, assignment } = item;
  return (
    <li className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <Link href={`/candidate/interviews/${interview.id}`} className="block truncate text-[15px] font-medium text-ink hover:text-brand">
          {interview.title}
        </Link>
        <p className="mt-1 text-[13px] text-ink-3">
          {interview.role} · {formatDuration(interview.durationMinutes)} · {interview.mainQuestions} questions
        </p>
        {assignment.status === "in_progress" && assignment.progress !== undefined && (
          <div className="mt-2.5 flex max-w-xs items-center gap-2.5">
            <ScoreBar value={assignment.progress ?? 0} tone="accent" label="Your progress" />
            <span className="tnum text-xs text-ink-3">{assignment.progress ?? 0}%</span>
          </div>
        )}
      </div>
      <LinkButton href={href} variant={assignment.status === "in_progress" ? "accent" : "primary"} size="sm" icon={<ArrowRight className="size-3.5" />}>
        {cta}
      </LinkButton>
    </li>
  );
}

export default function CandidateDashboardPage() {
  const { state } = useSession();
  const reports = useReports();
  const { items, status, error, refresh } = useCandidateInterviews();
  const user = state.user;

  const groups = groupAssigned(items);
  const myReports = reports.filter((report) => report.candidate.email.toLowerCase() === user?.email.toLowerCase()).sort((a, b) => b.completedAt.localeCompare(a.completedAt));
  const average = myReports.length ? Math.round(myReports.reduce((sum, report) => sum + report.overall, 0) / myReports.length) : null;
  const firstName = user?.name.split(" ")[0] ?? "";

  return (
    <>
      <PageHeader title={`Welcome back${firstName ? `, ${firstName}` : ""}`} description="Your assigned interviews and how you have been doing." />

      <StatStrip>
        <Stat label="Upcoming" value={groups.upcoming.length} icon={<CalendarClock className="size-4" />} hint="Ready to start" />
        <Stat label="In progress" value={groups.inProgress.length} icon={<PlayCircle className="size-4" />} hint="Pick up where you left off" />
        <Stat label="Completed" value={groups.completed.length} icon={<CheckCircle2 className="size-4" />} hint="With reports" />
        <Stat label="Average score" value={average ?? "—"} icon={<ClipboardList className="size-4" />} hint={average === null ? "No reports yet" : `Across ${myReports.length} ${myReports.length === 1 ? "interview" : "interviews"}`} />
      </StatStrip>

      {status === "loading" ? (
        <p role="status" className="mt-10 text-center text-sm text-ink-3">Loading your interviews…</p>
      ) : status === "error" ? (
        <Surface className="mt-10">
          <EmptyState icon={<ClipboardList className="size-5" />} title="Could not load your interviews" description={error ?? undefined} action={<button type="button" onClick={() => void refresh()} className="text-sm font-medium text-brand hover:underline">Try again</button>} />
        </Surface>
      ) : items.length === 0 ? (
        <Surface className="mt-10">
          <EmptyState icon={<ClipboardList className="size-5" />} title="No interviews assigned yet" description="When a recruiter assigns you an interview it will appear here." />
        </Surface>
      ) : (
        <div className="mt-10 space-y-10">
          {groups.inProgress.length > 0 && (
            <section>
              <SectionTitle title="In progress" />
              <Surface>
                <ul className="divide-y divide-line">
                  {groups.inProgress.map((item) => (
                    <InterviewRow key={item.interview.id} item={item} cta="Resume" href={`/candidate/interviews/${item.interview.id}`} />
                  ))}
                </ul>
              </Surface>
            </section>
          )}

          {groups.upcoming.length > 0 && (
            <section>
              <SectionTitle title="Upcoming" />
              <Surface>
                <ul className="divide-y divide-line">
                  {groups.upcoming.map((item) => (
                    <InterviewRow key={item.interview.id} item={item} cta="View and start" href={`/candidate/interviews/${item.interview.id}`} />
                  ))}
                </ul>
              </Surface>
            </section>
          )}

          {groups.completed.length > 0 && (
            <section>
              <SectionTitle title="Completed" action={<Link href="/candidate/reports" className="text-[13px] font-medium text-brand hover:underline">All reports</Link>} />
              <Surface>
                <ul className="divide-y divide-line">
                  {groups.completed.map(({ interview, assignment }) => {
                    const report = reports.find((item) => item.id === assignment.reportId);
                    return (
                      <li key={interview.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0">
                          <p className="truncate text-[15px] font-medium text-ink">{interview.title}</p>
                          <p className="mt-1 text-[13px] text-ink-3">Completed {assignment.completedAt ? formatDate(assignment.completedAt) : ""}</p>
                        </div>
                        {report && (
                          <div className="flex items-center gap-4">
                            <span className="tnum text-xl font-semibold text-ink">{report.overall}</span>
                            <PerformanceBadge score={report.overall} />
                            <LinkButton href={`/candidate/reports/${report.id}`} variant="secondary" size="sm">
                              View report
                            </LinkButton>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </Surface>
            </section>
          )}

          {myReports.length > 0 && (
            <section>
              <SectionTitle title="Recent performance" description="Your latest scores, newest first." />
              <ul className="space-y-3">
                {myReports.slice(0, 4).map((report) => (
                  <li key={report.id} className="grid items-center gap-3 sm:grid-cols-[260px_1fr_auto]">
                    <Link href={`/candidate/reports/${report.id}`} className="truncate text-sm text-ink-2 hover:text-brand">
                      {report.interviewTitle}
                    </Link>
                    <ScoreBar value={report.overall} label={`${report.interviewTitle} score`} />
                    <span className="flex items-center gap-2">
                      <span className="tnum w-8 text-right text-sm font-semibold text-ink">{report.overall}</span>
                      {report.source !== "backend" && <Badge tone="outline">{report.source === "demo" ? "Sample" : "Simulated"}</Badge>}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </>
  );
}
