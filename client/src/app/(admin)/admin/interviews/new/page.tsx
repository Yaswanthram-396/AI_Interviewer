import { Suspense } from "react";
import type { Metadata } from "next";
import { CreateInterviewForm } from "@/features/admin/components/CreateInterviewForm";

export const metadata: Metadata = { title: "Create interview" };

export default function NewInterviewPage() {
  // useSearchParams (for ?template=) needs a Suspense boundary.
  return (
    <Suspense>
      <CreateInterviewForm />
    </Suspense>
  );
}
