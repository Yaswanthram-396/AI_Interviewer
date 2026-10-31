"use client";

import Link from "next/link";
import { FileText } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { EmptyState, PageHeader, ScoreBar, Surface } from "@/components/ui/display";
import { PerformanceBadge } from "@/features/reports/components/PerformanceBadge";
import { useReports, useReportsStatus } from "@/features/data/DataProvider";
import { LoadError } from "@/components/ui/LoadError";
import { SOURCE_LABEL } from "@/features/reports/types";
import { useSession } from "@/features/session/useSession";
import { formatDate } from "@/lib/format";

export default function CandidateReportsPage() {
  const { state } = useSession();
  const { status } = useReportsStatus();
  const reports = useReports()
    .filter((report) => report.candidate.email.toLowerCase() === state.user?.email.toLowerCase())
    .sort((a, b) => b.completedAt.localeCompare(a.completedAt));

  return (
    <>
      <PageHeader title="My reports" description="Detailed feedback from every interview you have completed." />
      {status === "error" && <LoadError what="your reports" />}
      <Surface>
        {status === "loading" ? (
          <p role="status" className="px-6 py-14 text-center text-sm text-ink-3">Loading your reports…</p>
        ) : reports.length === 0 ? (
          <EmptyState icon={<FileText className="size-5" />} title="No reports yet" description="Complete an interview and your report will appear here." />
        ) : (
          <ul className="divide-y divide-line">
            {reports.map((report) => (
              <li key={report.id}>
                <Link href={`/candidate/reports/${report.id}`} className="grid items-center gap-3 px-5 py-4 transition-colors hover:bg-canvas sm:grid-cols-[1fr_180px_auto]">
                  <span className="min-w-0">
                    <span className="block truncate text-[15px] font-medium text-ink">{report.interviewTitle}</span>
                    <span className="mt-1 flex items-center gap-2 text-[13px] text-ink-3">
                      {formatDate(report.completedAt)}
                      {report.source !== "backend" && <Badge tone="outline">{SOURCE_LABEL[report.source].label}</Badge>}
                    </span>
                  </span>
                  <span className="flex items-center gap-3">
                    <ScoreBar value={report.overall} label="Overall score" />
                  </span>
                  <span className="flex items-center gap-3">
                    <span className="tnum text-xl font-semibold text-ink">{report.overall}</span>
                    <PerformanceBadge score={report.overall} />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Surface>
    </>
  );
}
