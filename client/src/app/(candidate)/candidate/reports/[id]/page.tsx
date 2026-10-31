"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { ReportLoader } from "@/features/reports/components/ReportLoader";
import { useSession } from "@/features/session/useSession";

function CandidateReport() {
  const { id } = useParams<{ id: string }>();
  const fresh = useSearchParams().get("fresh") === "1";
  const { state } = useSession();
  const email = state.user?.email.toLowerCase();
  return (
    <>
      <Link href="/candidate/reports" className="mb-6 inline-flex items-center gap-1.5 text-[13px] text-ink-3 hover:text-ink no-print">
        <ArrowLeft className="size-3.5" /> My reports
      </Link>
      {/* A candidate can only open their own reports; anything else looks the same as "not found". */}
      <ReportLoader id={id} audience="candidate" awaitFresh={fresh} allow={(candidateEmail) => candidateEmail.toLowerCase() === email} backHref="/candidate/reports" backLabel="Back to my reports" />
    </>
  );
}

export default function CandidateReportPage() {
  return (
    <Suspense>
      <CandidateReport />
    </Suspense>
  );
}
