/**
 * Mirrors a published interview into the SIRI backend through its existing endpoint, so the
 * candidate can take it as a *live* voice interview. Best-effort and kept apart from the local
 * store: if the backend is unreachable the interview still exists locally and the UI says so.
 */
import { authSession } from "@/features/auth/services/authSession.instance";
import type { InterviewRecord } from "./types";

export type SyncResult = { ok: true; backendId: string } | { ok: false; reason: string };

const BACKEND_DIFFICULTY: Record<InterviewRecord["difficulty"], "Beginner" | "Intermediate" | "Advanced"> = {
  beginner: "Beginner",
  intermediate: "Intermediate",
  advanced: "Advanced",
  adaptive: "Intermediate", // the backend adapts on its own; it only knows the three starting levels
};

interface CreateResponse {
  interview?: { _id?: string };
}

const isObjectId = (value: unknown): value is string => typeof value === "string" && /^[a-f0-9]{24}$/i.test(value);

export async function syncInterviewToBackend(record: InterviewRecord): Promise<SyncResult> {
  const now = new Date();
  try {
    const response = await authSession.request<CreateResponse>("/api/interviews/create-interview", {
      method: "POST",
      body: JSON.stringify({
        title: record.title,
        description: record.description,
        difficulty: BACKEND_DIFFICULTY[record.difficulty],
        timeLimit: record.durationMinutes,
        interviewDate: now.toISOString().slice(0, 10),
        interviewTime: now.toISOString().slice(11, 16),
      }),
    });
    const backendId = response.interview?._id;
    if (!isObjectId(backendId)) return { ok: false, reason: "The backend did not return an interview id." };
    return { ok: true, backendId };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : "The SIRI backend is unreachable." };
  }
}
