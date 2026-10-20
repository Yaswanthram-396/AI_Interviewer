import { describe, expect, it } from "vitest";
import { assignedTo, findAssigned, groupAssigned, liveCandidateInterviews } from "./candidateView";
import { DEMO_CANDIDATE_EMAIL, seedInterviews } from "./seed";

describe("assignedTo", () => {
  it("returns only interviews assigned to that email, case-insensitively", () => {
    const items = assignedTo(seedInterviews(), "  ARJUN.Mehta@example.com ");
    expect(items.map((item) => item.interview.id).sort()).toEqual(["int_mern_01", "int_node_03", "int_react_02"]);
  });

  it("never shows someone else's interviews", () => {
    expect(assignedTo(seedInterviews(), "nobody@example.com")).toEqual([]);
    expect(assignedTo(seedInterviews(), undefined)).toEqual([]);
    const mia = assignedTo(seedInterviews(), "mia.chen@example.com");
    expect(mia.every((item) => item.assignment.email === "mia.chen@example.com")).toBe(true);
  });

  it("hides drafts and archived interviews even when the candidate was assigned", () => {
    const interviews = seedInterviews().map((record) => (record.id === "int_react_02" ? { ...record, status: "draft" as const } : record.id === "int_node_03" ? { ...record, status: "archived" as const } : record));
    expect(assignedTo(interviews, DEMO_CANDIDATE_EMAIL).map((item) => item.interview.id)).toEqual(["int_mern_01"]);
  });
});

describe("groupAssigned", () => {
  it("splits the demo candidate's interviews into the three dashboard groups", () => {
    const groups = groupAssigned(assignedTo(seedInterviews(), DEMO_CANDIDATE_EMAIL));
    expect(groups.completed.map((i) => i.interview.id)).toEqual(["int_mern_01"]);
    expect(groups.upcoming.map((i) => i.interview.id)).toEqual(["int_react_02"]);
    expect(groups.inProgress.map((i) => i.interview.id)).toEqual(["int_node_03"]);
  });
});

describe("findAssigned", () => {
  it("is how pages enforce access: unassigned ids resolve to nothing", () => {
    expect(findAssigned(seedInterviews(), DEMO_CANDIDATE_EMAIL, "int_mern_01")).toBeDefined();
    expect(findAssigned(seedInterviews(), DEMO_CANDIDATE_EMAIL, "int_junior_05")).toBeUndefined();
  });
});

describe("liveCandidateInterviews (real API data)", () => {
  const me = { name: "Yash", email: "Yash@Example.com" };
  const legacy = { ...seedInterviews()[0], id: "6ae1", status: "active" as const, assignments: [] }; // like the real "MERN stack developer intern": no assignments

  it("shows an interview that has no assignment record (the regression: it used to be hidden)", () => {
    const items = liveCandidateInterviews([legacy], me, []);
    expect(items).toHaveLength(1);
    expect(items[0].assignment).toMatchObject({ status: "not_started", email: "yash@example.com" });
  });

  it("trusts the backend scoping and does not re-filter by assignment", () => {
    const otherAssigned = { ...legacy, id: "x", assignments: [{ id: "a", name: "Someone", email: "someone@x.io", status: "invited" as const, invitedAt: "" }] };
    expect(liveCandidateInterviews([legacy, otherAssigned], me, []).map((i) => i.interview.id)).toEqual(["6ae1", "x"]);
  });

  it("still hides drafts and archived interviews", () => {
    const hidden = [{ ...legacy, id: "d", status: "draft" as const }, { ...legacy, id: "a", status: "archived" as const }];
    expect(liveCandidateInterviews(hidden, me, [])).toEqual([]);
  });

  it("uses the candidate's own assignment when there is one", () => {
    const mine = { ...legacy, assignments: [{ id: "m", name: "Yash", email: "yash@example.com", status: "in_progress" as const, invitedAt: "" }] };
    expect(liveCandidateInterviews([mine], me, [])[0].assignment).toMatchObject({ id: "m", status: "in_progress" });
  });

  it("marks an interview completed when a report of theirs exists, so the report is reachable", () => {
    const items = liveCandidateInterviews([legacy], me, [{ id: "sess_1", interviewId: "6ae1", candidate: { email: "YASH@example.com" } }, { id: "sess_2", interviewId: "6ae1", candidate: { email: "other@x.io" } }]);
    expect(items[0].assignment).toMatchObject({ status: "completed", reportId: "sess_1" });
  });

  it("shows nothing when nobody is signed in", () => {
    expect(liveCandidateInterviews([legacy], undefined, [])).toEqual([]);
  });
});
