"use client";

import { Suspense } from "react";
import { useParams } from "next/navigation";
import { FileText } from "lucide-react";
import { LinkButton } from "@/components/ui/Button";
import { EmptyState, Surface } from "@/components/ui/display";
import { CreateInterviewForm } from "@/features/admin/components/CreateInterviewForm";
import { useInterview, useInterviewsStatus } from "@/features/data/DataProvider";

export default function EditInterviewPage() {
  const { id } = useParams<{ id: string }>();
  const record = useInterview(id);
  const { status } = useInterviewsStatus();

  if (!record && status === "loading") return <p role="status" className="py-16 text-center text-sm text-ink-3">Loading interview…</p>;

  if (!record) {
    return (
      <Surface>
        <EmptyState icon={<FileText className="size-5" />} title="Interview not found" action={<LinkButton href="/admin/interviews">Back to all interviews</LinkButton>} />
      </Surface>
    );
  }
  // Keyed by id so switching interviews resets the form state.
  return (
    <Suspense>
      <CreateInterviewForm key={record.id} record={record} />
    </Suspense>
  );
}
