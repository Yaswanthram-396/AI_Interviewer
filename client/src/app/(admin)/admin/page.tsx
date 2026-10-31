"use client";

import Link from "next/link";
import { ArrowRight, CheckCircle2, ClipboardList, FileText, PlayCircle, Plus, Users } from "lucide-react";
import { LinkButton } from "@/components/ui/Button";
import { Avatar, EmptyState, PageHeader, SectionTitle, Stat, StatStrip, Surface } from "@/components/ui/display";
import { InterviewStatusBadge } from "@/features/interviews/components/StatusBadges";
import { summarize } from "@/features/interviews/interviewActions";
import { useInterviews, useInterviewsStatus, useReportsStatus } from "@/features/data/DataProvider";
import { LoadError } from "@/components/ui/LoadError";
import { INTERVIEW_TEMPLATES } from "@/features/interviews/templates";
import { PerformanceBadge } from "@/features/reports/components/PerformanceBadge";
import { useReports } from "@/features/data/DataProvider";
import { formatDate, pluralize } from "@/lib/format";

export default function AdminOverviewPage() {
  const interviews = useInterviews();
  const reports = useReports();
  const stats = summarize(interviews);
  const { status, error, refresh } = useInterviewsStatus();
  const { status: reportsStatus } = useReportsStatus();

  const recentlyCreated = [...interviews].filter((record) => record.status !== "archived").sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 5);
  const recentlyCompleted = [...reports].sort((a, b) => b.completedAt.localeCompare(a.completedAt)).slice(0, 5);

  return (
    <>
      <PageHeader
        title="Overview"
        description="Create interviews, assign candidates and review the reports SIRI produces."
        actions={
          <LinkButton href="/admin/interviews/new" icon={<Plus className="size-4" />}>
            Create interview
          </LinkButton>
        }
      />

      {status === "error" && <LoadError what="interviews" message={error} onRetry={() => void refresh()} />}
      {reportsStatus === "error" && <LoadError what="reports" />}
      {status === "loading" && <p role="status" className="mb-4 text-sm text-ink-3">Loading from the SIRI backend…</p>}

      <StatStrip>
        <Stat label="Interviews created" value={stats.total} icon={<ClipboardList className="size-4" />} hint="Excluding archived" />
        <Stat label="Active interviews" value={stats.active} icon={<PlayCircle className="size-4" />} hint="Open to candidates" />
        <Stat label="Completed interviews" value={stats.completed} icon={<CheckCircle2 className="size-4" />} hint="All candidates finished" />
        <Stat label="Total candidates" value={stats.candidates} icon={<Users className="size-4" />} hint="Across all interviews" />
      </StatStrip>

      <div className="mt-10 grid gap-10 lg:grid-cols-2">
        <section>
          <SectionTitle
            title="Recently created"
            action={
              <Link href="/admin/interviews" className="inline-flex items-center gap-1 text-[13px] font-medium text-brand hover:underline">
                View all <ArrowRight className="size-3.5" />
              </Link>
            }
          />
          <Surface>
            {recentlyCreated.length === 0 ? (
              <EmptyState icon={<ClipboardList className="size-5" />} title="No interviews yet" description="Create your first interview to get started." />
            ) : (
              <ul className="divide-y divide-line">
                {recentlyCreated.map((record) => (
                  <li key={record.id}>
                    <Link href={`/admin/interviews/${record.id}`} className="flex items-center justify-between gap-4 px-4 py-3.5 transition-colors hover:bg-canvas">
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium text-ink">{record.title}</span>
                        <span className="mt-0.5 block text-xs text-ink-3">
                          {record.role} · {pluralize(record.assignments.length, "candidate")} · {formatDate(record.createdAt)}
                        </span>
                      </span>
                      <InterviewStatusBadge status={record.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Surface>
        </section>

        <section>
          <SectionTitle
            title="Recently completed"
            action={
              <Link href="/admin/reports" className="inline-flex items-center gap-1 text-[13px] font-medium text-brand hover:underline">
                All reports <ArrowRight className="size-3.5" />
              </Link>
            }
          />
          <Surface>
            {recentlyCompleted.length === 0 ? (
              <EmptyState icon={<FileText className="size-5" />} title="No completed interviews yet" description="Reports appear here as candidates finish." />
            ) : (
              <ul className="divide-y divide-line">
                {recentlyCompleted.map((report) => (
                  <li key={report.id}>
                    <Link href={`/admin/reports/${report.id}`} className="flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-canvas">
                      <Avatar name={report.candidate.name} size="sm" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-ink">{report.candidate.name}</span>
                        <span className="block truncate text-xs text-ink-3">
                          {report.interviewTitle} · {formatDate(report.completedAt)}
                        </span>
                      </span>
                      <span className="tnum text-sm font-semibold text-ink">{report.overall}</span>
                      <PerformanceBadge score={report.overall} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Surface>
        </section>
      </div>

      <section className="mt-10">
        <SectionTitle title="Start from a template" description="Pre-filled configurations you can adjust before publishing." />
        <div className="grid gap-3 sm:grid-cols-3">
          {INTERVIEW_TEMPLATES.map((template) => (
            <Link
              key={template.id}
              href={`/admin/interviews/new?template=${template.id}`}
              className="group rounded-lg border border-line bg-surface p-4 transition-colors hover:border-brand/50"
            >
              <p className="text-sm font-medium text-ink group-hover:text-brand">{template.name}</p>
              <p className="mt-1 text-xs leading-relaxed text-ink-3">{template.summary}</p>
            </Link>
          ))}
        </div>
      </section>
    </>
  );
}
