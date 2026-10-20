import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { groupAssigned, liveCandidateInterviews } from "../candidateView";
import { fromBackend, type RawInterview } from "./mapping";

/**
 * Integration check on REAL backend responses. Set SIRI_REAL_PAYLOAD to a JSON file of
 * { interviews, reports } captured from GET /api/interviews and GET /api/reports (see docs/regression-audit.md).
 * Skipped otherwise, so the normal suite never depends on a running backend.
 */
const file = process.env.SIRI_REAL_PAYLOAD;

describe.skipIf(!file)("candidate dashboard from real API responses", () => {
  const payload = JSON.parse(file ? readFileSync(file, "utf8") : "{}") as { interviews: RawInterview[]; reports: { id: string; interviewId: string; interviewTitle: string; candidate: { name: string; email: string } }[] };
  const records = (payload.interviews ?? []).map(fromBackend);
  const me = { name: "Yash", email: "yash@e2e.test" };

  it("maps every real interview, including ones without settings or assignments", () => {
    expect(records.length).toBeGreaterThan(0);
    for (const record of records) expect(record).toMatchObject({ title: expect.any(String), id: expect.any(String), status: expect.stringMatching(/active|completed|draft|archived/) });
  });

  it("shows the candidate every interview the backend returned, with the right state", () => {
    const items = liveCandidateInterviews(records, me, payload.reports);
    const byTitle = Object.fromEntries(items.map((item) => [item.interview.title, item.assignment.status]));
    console.log("dashboard would show:", JSON.stringify(byTitle));
    expect(items.map((i) => i.interview.id).sort()).toEqual(records.filter((r) => r.status !== "draft" && r.status !== "archived").map((r) => r.id).sort());
    const groups = groupAssigned(items);
    expect(groups.upcoming.length + groups.inProgress.length + groups.completed.length).toBe(items.length);
    expect(groups.upcoming.map((i) => i.interview.title)).toContain("Legacy Payload Interview"); // the one the old filter hid
  });
});
