"use client";

import { FileText, Loader2, Lock } from "lucide-react";
import { LinkButton } from "@/components/ui/Button";
import { EmptyState, Surface } from "@/components/ui/display";
import { useReportDetail } from "@/features/data/DataProvider";
import { ReportView } from "./ReportView";

interface ReportLoaderProps {
  id: string;
  audience: "candidate" | "admin";
  /** Just finished an interview: the report is written asynchronously, so keep looking for a few seconds. */
  awaitFresh?: boolean;
  /** Extra check once loaded (e.g. a candidate may only open their own report). */
  allow?: (candidateEmail: string) => boolean;
  backHref: string;
  backLabel: string;
}

/** Loads one report and shows it, or a plain explanation of why there is none. */
export function ReportLoader({ id, audience, awaitFresh, allow, backHref, backLabel }: ReportLoaderProps) {
  const detail = useReportDetail(id, { awaitFresh });

  if (detail.status === "loading") {
    return (
      <div role="status" className="flex flex-col items-center gap-3 py-24 text-center text-sm text-ink-3">
        <Loader2 className="size-5 animate-spin" aria-hidden />
        {awaitFresh ? "SIRI is preparing your report…" : "Loading report…"}
      </div>
    );
  }
  if (detail.status === "error") {
    return (
      <Surface>
        <EmptyState icon={<FileText className="size-5" />} title="Could not load the report" description={detail.message} action={<LinkButton href={backHref}>{backLabel}</LinkButton>} />
      </Surface>
    );
  }
  if (detail.status === "missing" || (allow && !allow(detail.report.candidate.email))) {
    return (
      <Surface>
        <EmptyState
          icon={<Lock className="size-5" />}
          title="Report not available"
          description={awaitFresh ? "There were not enough scored answers to build a report for this interview." : "This report does not exist or belongs to someone else."}
          action={<LinkButton href={backHref}>{backLabel}</LinkButton>}
        />
      </Surface>
    );
  }
  return <ReportView report={detail.report} audience={audience} />;
}
