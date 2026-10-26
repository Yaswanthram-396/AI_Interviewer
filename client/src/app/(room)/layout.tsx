"use client";

import type { ReactNode } from "react";
import { RequireRole } from "@/features/session/RequireRole";

/** The interview room is full-screen (no sidebar) but still candidate-only. */
export default function RoomLayout({ children }: { children: ReactNode }) {
  return <RequireRole portal="candidate">{children}</RequireRole>;
}
