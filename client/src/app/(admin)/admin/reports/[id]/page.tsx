"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { ReportLoader } from "@/features/reports/components/ReportLoader";

export default function AdminReportPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <>
      <Link href="/admin/reports" className="mb-6 inline-flex items-center gap-1.5 text-[13px] text-ink-3 hover:text-ink no-print">
        <ArrowLeft className="size-3.5" /> Candidate reports
      </Link>
      <ReportLoader id={id} audience="admin" backHref="/admin/reports" backLabel="Back to reports" />
    </>
  );
}
