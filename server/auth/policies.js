/**
 * Pure authorization rules. `user` is { id, role, email }. Resources carry ownership ids as strings.
 * Callers should still scope database queries by owner; these are for single-resource checks.
 */
const ROLES = Object.freeze({ CANDIDATE: "candidate", RECRUITER: "recruiter", ADMIN: "admin" });

const hasRole = (user, ...roles) => !!user && roles.includes(user.role);
const same = (a, b) => a != null && b != null && String(a) === String(b);
const lower = (v) => String(v ?? "").trim().toLowerCase();

/** Candidates may only reach published interviews, never drafts or archived ones. */
const isPublished = (interview) => !interview?.status || interview.status === "active" || interview.status === "completed";

/**
 * The candidate's own assignment on an interview, matched by account id (once bound) or by the
 * email the interview was assigned to. Also honours the legacy single `candidateId`.
 */
function assignmentFor(user, interview) {
  if (!hasRole(user, ROLES.CANDIDATE) || !interview) return null;
  const found = (interview.assignments || []).find((a) => same(a.userId, user.id) || (user.email && lower(a.email) === lower(user.email)));
  if (found) return found;
  return same(interview.candidateId, user.id) ? { legacy: true } : null;
}

/** Recruiters manage interviews/jobs they own; admins may manage any. */
const canManageInterview = (user, interview) =>
  !!interview && (hasRole(user, ROLES.ADMIN) || (hasRole(user, ROLES.RECRUITER) && same(interview.ownerId, user.id)));

/** Managers, plus a candidate the (published) interview is assigned to. */
const canViewInterview = (user, interview) => canManageInterview(user, interview) || (isPublished(interview) && !!assignmentFor(user, interview));

/** Only an assigned candidate may take a published interview. */
const canTakeInterview = (user, interview) => isPublished(interview) && !!assignmentFor(user, interview);

/** Mongo filter limiting interviews to those the user may see; null means no access. */
const interviewScope = (user) => {
  if (hasRole(user, ROLES.ADMIN)) return {};
  if (hasRole(user, ROLES.RECRUITER)) return { ownerId: String(user.id) };
  if (hasRole(user, ROLES.CANDIDATE)) {
    const mine = [{ candidateId: String(user.id) }, { "assignments.userId": String(user.id) }];
    if (user.email) mine.push({ "assignments.email": lower(user.email) });
    return { status: { $nin: ["draft", "archived"] }, $or: mine }; // $nin so interviews created before `status` existed stay visible
  }
  return null;
};

/** What a candidate may see of an interview: their own assignment only, never other candidates. */
function forCandidate(user, interview) {
  const { assignments: _all, ownerId: _owner, candidateId: _legacy, ...rest } = interview;
  void _all;
  void _owner;
  void _legacy;
  const mine = assignmentFor(user, interview);
  return { ...rest, assignments: mine && !mine.legacy ? [mine] : [] };
}

module.exports = { interviewScope, ROLES, hasRole, canManageInterview, canViewInterview, canTakeInterview, assignmentFor, forCandidate, isPublished };
