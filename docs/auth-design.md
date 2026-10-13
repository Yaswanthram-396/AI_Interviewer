# Authentication and authorization design

Status: **steps 1, 2 and 4 of 4 implemented** (step 3, invitations, is skipped) (see "Implementation order"). Step 3 (invitations) is still proposed. Step 2 assigns candidates by email through `POST /api/interviews/:id/assign` instead of invitations. Everything below is enforced only when `AUTH_ENFORCED=true`; otherwise REST routes and WebSocket sessions stay anonymous.

## Decision to confirm

**Build identity in-repo (email + password, JWT) behind an `AuthProvider` interface, so an external OIDC provider can replace it later.**

Why: `bcryptjs`, `jsonwebtoken` and `express-validator` are already dependencies, nothing in the repo points at an existing identity provider, and a thin interface keeps the migration path open. If you already have an IdP (the package description mentions EarlyJobs), say so and Phase 1 becomes "verify its tokens" instead of "issue tokens"; everything from the roles section down is unchanged.

## Roles and ownership

| Role | Can do |
| --- | --- |
| `candidate` | Own profile, resumes, interviews they are invited to or started, own reports and roadmaps |
| `recruiter` | Create/manage **their own** jobs; invite candidates to those jobs; view candidates/assessments/reports for those jobs only |
| `admin` | Manage users and org settings; no implicit read of candidate content without an audit entry |

Ownership is by data, not by role alone: `Job.ownerId`, `Interview.jobId` / `candidateId`, `Resume.candidateId`. A recruiter's access to a candidate exists only through an `Interview` (or application) on a job they own. Optional `orgId` on users and jobs lets several recruiters share jobs later; not required for v1.

## Tokens and sessions

- **Access token:** JWT, 15 min, in memory on the client, sent as `Authorization: Bearer`. Claims: `sub`, `role`, `ver` (user `tokenVersion`, lets us revoke all tokens on password change).
- **Refresh token:** opaque random value, 14 days, `HttpOnly; Secure; SameSite=Lax` cookie scoped to `/api/auth`, stored **hashed** in a `RefreshToken` collection, rotated on every use; reuse of a rotated token revokes the whole family.
- Because only `/api/auth/refresh` reads the cookie and all other routes use the header, there is no ambient-cookie CSRF surface on data routes. `refresh` additionally checks `Origin` against `CORS_ORIGIN`.
- Secrets (`JWT_SECRET`) from env only; startup fails in production if missing.

## Endpoints (v1)

`POST /api/auth/register` (candidate self-signup; recruiters are created by admin or invite), `POST /api/auth/login`, `POST /api/auth/refresh`, `POST /api/auth/logout`, `GET /api/auth/me`, `POST /api/auth/password/forgot|reset`, `POST /api/auth/verify-email`.

Controls: stricter rate limit on auth routes keyed by IP + email; progressive lockout (not permanent); min 10-char passwords checked against a small breached/common list; bcrypt cost 12; identical responses for unknown email vs wrong password; email verification before a recruiter can invite anyone.

## Authorization enforcement

- One middleware `requireAuth(roles?)` sets `req.user`. One `policies` module holds pure functions (`canViewInterview(user, interview)`, …) that tests can hit directly.
- **Scope in the query, not after it:** `Interview.find({ jobId: { $in: ownedJobIds } })`, never fetch-then-check. Unauthorized single-resource access returns **404** (don't confirm existence); role mismatches return 403.
- Every route declares its policy; a test fails the build if a route is registered without one (allow-list for `health` and `auth/*`).

## Candidate access to an interview

1. Recruiter invites by email → `Invitation` (`interviewId`, `email`, hashed single-use token, expiry 7 days).
2. Candidate follows the link, signs in or registers (email must match), and the invitation binds `Interview.candidateId`.
3. **WebSocket:** `hello` carries the access token; the server checks `canStartInterview(user, interview)`. The session records `userId`, the resume token includes it, and resume is refused if the presenting user differs. This closes the remaining gap in the current design where anyone who knows an `interviewId` can start a session.
4. Browsers cannot set headers on WebSockets, so the token goes in the first `hello` message (never in the URL, which ends up in logs).

## Data model changes

- New: `User` (`email` unique-lowercased, `passwordHash`, `role`, `emailVerifiedAt`, `tokenVersion`, `failedLogins`, `lockedUntil`), `RefreshToken` (`userId`, `familyId`, `tokenHash`, `expiresAt`, `revokedAt`; TTL index), `Invitation`, `AuditLog` (actor, action, resource, ts; recruiter reads of candidate content and admin actions).
- Changed: `Interview` gains `ownerId`, `jobId?`, `candidateId?`; `InterviewSession` gains `userId`. Index `{ownerId:1,createdAt:-1}`, `{candidateId:1}`.

## Migration

Existing interviews have no owner. Backfill them to a designated admin account in a one-off script. Roll out behind `AUTH_ENFORCED` (default off in dev, **on** in production): with it off, the old anonymous behavior and bundled client keep working while the login UI is built; flip it on once the client sends tokens.

## Client

Login/register pages, an in-memory token store with silent refresh, a fetch wrapper that attaches the token and retries once on 401, route guards by role, and the `hello` message sending the token. The existing `NEXT_PUBLIC_API_URL` pattern is reused.

## Tests required before this is called done

Unit: password policy, token issue/verify/expiry, refresh rotation and reuse detection, every policy function. Integration: register/login/logout/lockout; candidate cannot read another candidate's interview or session; recruiter A cannot read recruiter B's jobs or candidates (404); expired/tampered/`ver`-stale tokens rejected; WebSocket `hello` without or with a wrong-user token refused; resume token presented by a different user refused; route-without-policy check.

## Out of scope for v1

SSO/OIDC, MFA, org/team management UI, fine-grained permission editing. All fit behind the same interfaces.

## Implementation order

1. **Done:** `User`, auth routes, `requireAuth`, policies, tests (no client change; flag off). Not included: email verification and password forgot/reset (no mail transport is configured), and the `AuditLog` collection.
2. **Done:** owner/candidate fields, `scripts/backfill-interview-owner.js`, owner-scoped `GET /api/interviews`, `GET /:id` (404 for non-owners), `POST /:id/assign`, and WebSocket `hello` carrying `accessToken` with `canTakeInterview`, user-bound sessions and resume tokens.
3. Invitations + WebSocket binding.
4. **Done:** client login/register pages, in-memory access token with silent refresh (`features/auth/`), role-aware route guards, `accessToken` in the WebSocket `hello`, recruiter UI to assign a candidate by email. The flag is still off by default; turn it on after the checklist in `implementation-status.md`.
