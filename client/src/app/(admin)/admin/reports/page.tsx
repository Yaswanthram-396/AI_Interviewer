"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { FileText, Search } from "lucide-react";
import { Avatar, EmptyState, PageHeader, Surface } from "@/components/ui/display";
import { Badge } from "@/components/ui/Badge";
import { Input, Select } from "@/components/ui/form";
import { PerformanceBadge } from "@/features/reports/components/PerformanceBadge";
import { useReports, useReportsStatus } from "@/features/data/DataProvider";
import { LoadError } from "@/components/ui/LoadError";
import { useScoringSettings } from "@/features/reports/reportStore";
import { LEVEL_LABEL, performanceLevel, type PerformanceLevel } from "@/features/reports/scoring";
import { SOURCE_LABEL } from "@/features/reports/types";
import { formatDate } from "@/lib/format";

export default function AdminReportsPage() {
  const reports = useReports();
  const { thresholds } = useScoringSettings();
  const { status } = useReportsStatus();
  const [query, setQuery] = useState("");
  const [interview, setInterview] = useState("all");
  const [level, setLevel] = useState<"all" | PerformanceLevel>("all");

  const interviews = useMemo(() => [...new Map(reports.map((report) => [report.interviewId, report.interviewTitle])).entries()], [reports]);

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return reports
      .filter((report) => interview === "all" || report.interviewId === interview)
      .filter((report) => level === "all" || performanceLevel(report.overall, thresholds) === level)
      .filter((report) => !needle || `${report.candidate.name} ${report.candidate.email} ${report.interviewTitle}`.toLowerCase().includes(needle))
      .sort((a, b) => b.completedAt.localeCompare(a.completedAt));
  }, [reports, query, interview, level, thresholds]);

  return (
    <>
      <PageHeader title="Candidate reports" description="Detailed AI evaluations for every completed interview." />

      {status === "error" && <LoadError what="reports" />}
      {status === "loading" && <p role="status" className="mb-4 text-sm text-ink-3">Loading reports…</p>}
      <div className="mb-4 grid gap-3 sm:grid-cols-[1fr_220px_180px]">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" aria-hidden />
          <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search candidate or interview" aria-label="Search reports" className="pl-9" />
        </div>
        <Select value={interview} onChange={(event) => setInterview(event.target.value)} aria-label="Filter by interview">
          <option value="all">All interviews</option>
          {interviews.map(([id, title]) => (
            <option key={id} value={id}>
              {title}
            </option>
          ))}
        </Select>
        <Select value={level} onChange={(event) => setLevel(event.target.value as typeof level)} aria-label="Filter by performance level">
          <option value="all">All levels</option>
          {(Object.keys(LEVEL_LABEL) as PerformanceLevel[]).map((key) => (
            <option key={key} value={key}>
              {LEVEL_LABEL[key].replace(" Performance", "")}
            </option>
          ))}
        </Select>
      </div>

      <Surface className="overflow-hidden">
        {rows.length === 0 ? (
          <EmptyState icon={<FileText className="size-5" />} title="No reports match" description="Adjust the search or filters." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="border-b border-line bg-canvas text-xs text-ink-3">
                <tr>
                  <th className="px-4 py-3 font-medium">Candidate</th>
                  <th className="px-4 py-3 font-medium">Interview</th>
                  <th className="px-4 py-3 text-right font-medium">Score</th>
                  <th className="px-4 py-3 font-medium">Level</th>
                  <th className="px-4 py-3 font-medium">Completed</th>
                  <th className="px-4 py-3 text-right font-medium" />
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((report) => (
                  <tr key={report.id} className="transition-colors hover:bg-canvas/70">
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-3">
                        <Avatar name={report.candidate.name} size="sm" />
                        <div className="min-w-0">
                          <p className="truncate font-medium text-ink">{report.candidate.name}</p>
                          <p className="truncate text-xs text-ink-3">{report.candidate.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="max-w-[240px] px-4 py-3.5">
                      <p className="truncate text-ink-2">{report.interviewTitle}</p>
                      {report.source !== "backend" && (
                        <Badge tone="outline" className="mt-1">
                          {SOURCE_LABEL[report.source].label}
                        </Badge>
                      )}
                    </td>
                    <td className="tnum px-4 py-3.5 text-right text-base font-semibold text-ink">{report.overall}</td>
                    <td className="px-4 py-3.5">
                      <PerformanceBadge score={report.overall} />
                    </td>
                    <td className="whitespace-nowrap px-4 py-3.5 text-ink-3">{formatDate(report.completedAt)}</td>
                    <td className="px-4 py-3.5 text-right">
                      <Link href={`/admin/reports/${report.id}`} className="text-[13px] font-medium text-brand hover:underline">
                        View report
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Surface>
    </>
  );
}
