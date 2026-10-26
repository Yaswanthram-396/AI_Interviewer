"use client";

import { Suspense } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { Lock } from "lucide-react";
import { LinkButton } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/display";
import { useCandidateInterviews } from "@/features/data/DataProvider";
import { LiveRoom } from "@/features/room/LiveRoom";
import { SimulatedRoom } from "@/features/room/SimulatedRoom";

function Room() {
  const { id } = useParams<{ id: string }>();
  const mode = useSearchParams().get("mode");
  const { find, status, mode: dataMode } = useCandidateInterviews();
  const found = find(id);

  if (!found && status === "loading") return <div role="status" className="flex min-h-screen items-center justify-center text-sm text-ink-3">Loading interview…</div>;

  if (!found) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas">
        <EmptyState icon={<Lock className="size-5" />} title="Interview not available" description="This interview does not exist or has not been assigned to you." action={<LinkButton href="/candidate">Back to my interviews</LinkButton>} />
      </div>
    );
  }

  const { interview } = found;
  // Interviews synced to the backend run live unless the candidate chose the simulated session.
  if (interview.backendId && (mode !== "simulated" || dataMode === "live")) return <LiveRoom interview={interview} backendId={interview.backendId} />;
  return <SimulatedRoom interview={interview} />;
}

export default function RoomPage() {
  return (
    <Suspense>
      <Room />
    </Suspense>
  );
}
