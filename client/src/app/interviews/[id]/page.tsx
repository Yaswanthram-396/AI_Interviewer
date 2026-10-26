"use client";

import { useParams } from "next/navigation";
import { LiveRoom } from "@/features/room/LiveRoom";
import { RequireRole } from "@/features/session/RequireRole";

/**
 * Legacy deep link to a *backend* interview id. It opens the same live room used by published
 * interviews, so existing links keep working.
 */
export default function LegacyLiveInterviewPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <RequireRole portal="candidate">
      <LiveRoom backendId={typeof id === "string" ? id : ""} />
    </RequireRole>
  );
}
