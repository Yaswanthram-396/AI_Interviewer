# Implementation status

Last updated: 2026-10-28. This file only claims what exists in the repository and what was actually run.

## Done (Milestones A and B)

| Item | State | Evidence |
| --- | --- | --- |
| Repository audit | Done | [architecture.md](architecture.md) "Audit findings" |
| Turn / session state machine, `turnId` correlation | Implemented | `server/realtime/session.js`; integration tests |
| Duplicate-event idempotency, per-session serialization | Implemented | tests: duplicate, in-flight duplicate, concurrent, BUSY |
| WS handshake (`hello`), origin check, validation, payload cap, rate limit, heartbeat | Implemented | tests in `realtime.integration.test.js` |
| Session recovery (resume token, replay of undelivered replies, restore from MongoDB) | Implemented | tests: resume, replay, restart, hijack, expiry |
| Interruption / cancellation | Implemented (server + client) | integration test; client behavior **not** exercised in a browser |
| Provider timeouts, bounded retry, typed errors | Implemented (Vertex, TTS); Deepgram has error + keepalive | `units.test.js` |
| TTS failure degrades to text-only | Implemented | test |
| Persistence moved off the audio path | Implemented | tests (slow and failing persistence) |
| End-of-turn strategy replacing the fixed 5 s browser debounce | Implemented server-side, configurable | `endOfTurn.js` + tests |
| Structured logging, latency histograms, `GET /api/metrics` | Implemented | percentiles withheld until enough samples |
| `.env.example`, hardcoded Vertex IDs moved to env | Done | **breaking config change, see below** |

## Verification actually run

- `npm test` (server): 60 tests passing (unit + in-process WebSocket integration with **mocked** Vertex / TTS / Deepgram).
- Mutation check: disabling the idempotency check and the turn-serialization guard made 4 tests fail; restored, all pass.
- `tsc --noEmit` (client): no errors in `interviewBot.tsx`; 29 pre-existing errors remain in files this work did not touch (missing modules such as `next-themes`, `sonner`, `../hooks/*` under `components/ui`).
- ESLint on `interviewBot.tsx`: 0 errors, 5 warnings (unused imports/variable that predate this work).
- **Not run:** `next build`, any real Deepgram/Vertex/Google TTS call, any real MongoDB call, any browser session. The new client code and the real provider adapters are therefore unverified end to end.

## Breaking / action required

1. Set `VERTEX_PROJECT_NUMBER` and `VERTEX_ENDPOINT_ID` (previously hardcoded as `949170828684` / `736262672772759552`). Without them every LLM call returns `LLM_CONFIG`.
2. Set `WS_TOKEN_SECRET` in production (the server refuses to start without it when `NODE_ENV=production`).
3. The WebSocket protocol changed (`hello` first; `start_interview` / `user_turn` replace `tts_request`). The bundled client is updated; any other client must be updated.
4. `google-auth-library` is imported directly but was only a transitive dependency; add it to `server/package.json` before deploying.

## Auth (step 1 of `auth-design.md`)

Implemented in `server/auth/`: register (candidate only), login with lockout, JWT access tokens (15 min, `tokenVersion` revocation), rotating hashed refresh tokens in an `HttpOnly` cookie with reuse detection, logout, `/me`, admin-only creation of recruiter/admin accounts, role gate middleware, pure ownership policies, `scripts/create-admin.js`. 29 tests (in-memory repository + supertest); mutation check on token-version and reuse-detection logic caught both. **Not verified against a real MongoDB** (the Mongo repository and models are untested), and `create-admin.js` was not run.

**Step 2 (with `AUTH_ENFORCED=true`):** interview listing is scoped in the query (recruiter: own; candidate: assigned; admin: all); `GET /api/interviews/:id` and `POST /:id/assign` return 404 to non-owners; candidates are assigned by email (invitations are step 3). The WebSocket `hello` requires an `accessToken`; only the assigned candidate may start a session (recruiters, other candidates and missing interviews all get the same `INTERVIEW_NOT_FOUND`); sessions and resume tokens are bound to the user, and resume re-checks the assignment. 104 server tests pass; a mutation check removing the query scope, the 404 ownership check and the resume user-binding made tests fail. The REST controller was tested against a fake Interview model and the WebSocket against fake auth/stores, **not against real MongoDB**; `backfill-interview-owner.js` was not run.

**Step 4 (client):** `client/src/features/auth/` holds a framework-agnostic `authSession` (in-memory access token, silent refresh from the `HttpOnly` cookie, one refresh at a time, Web Locks across tabs, one retry on 401), an `AuthProvider`/`useAuth`, `RequireAuth` guards, sign-in/sign-up pages under `app/(auth)/`, a user menu with sign-out, and an assign-candidate form for recruiters. `interviewBot` now sends the access token in `hello`; the interview list and create form use the authenticated client. 32 vitest tests cover the session logic and form validators (mutation check on refresh de-duplication and 401 retry caught both). `tsc` is clean outside the 29-ish pre-existing `components/ui/*` errors and ESLint shows 0 errors. **Browser run (2026-10-28, isolated stack: server :5101/WS :8181 against a throwaway local MongoDB, client :3100, `AUTH_ENFORCED=true`):** signed-out visit redirected to `/login?next=…`; client-side validation messages; candidate registration redirected to `next`; reload restored the session via `refresh` (200); candidate blocked from `/createinterview`; sign-out; wrong password showed the generic error; recruiter login; create interview (found and fixed the pre-existing "Easy" difficulty bug, which returned a silent 500); assign unknown email (404 message) and a real candidate; candidate saw only the assigned interview; the interview page connected over the WebSocket with the access token (`session_ready`, Start enabled); the greeting turn failed with `LLM_CONFIG` as expected because Vertex IDs are not configured, and the UI showed a generic message. Over the WebSocket directly: anonymous got `UNAUTHENTICATED`, an unassigned candidate got `INTERVIEW_NOT_FOUND`.
**Still not verified:** `next build` (failed with `EPERM` on `.next/trace`, probably the dev server's file lock), microphone/camera capture (blocked in the browser pane), STT/LLM/TTS with real credentials (none configured; the audio loop has never run end to end), and production-mode redirects (in dev, the first navigation to a not-yet-compiled route was dropped once after login; a second click worked).

**Before setting `AUTH_ENFORCED=true`:** create an admin (`scripts/create-admin.js`), create recruiter accounts via `POST /api/auth/users`, run `scripts/backfill-interview-owner.js`, assign candidates, set `JWT_SECRET`/`WS_TOKEN_SECRET`, and make sure the client and API share a registrable domain (the refresh cookie is `SameSite=Lax`; a client on `a.vercel.app` calling an API on a different site will not send it, so sign-in would not persist across reloads. Proxy `/api` through the client origin or use sibling subdomains).

Remaining limits: the interview page's non-auth UI placeholders (hardcoded participant badge, inert video/screen-share buttons) are unchanged. The create form's difficulty default is now "Beginner" and failures are shown in the form. Recruiters cannot preview their own interviews over the WebSocket (candidate-only by policy). Legacy interviews without `candidateId` cannot be taken under enforcement until assigned. Resume tokens issued before enforcement is switched on are rejected. Email verification and password reset are not implemented. The global `xss-clean` middleware rewrites request bodies, including passwords containing `<` or `>`; it should be removed before real users register.

## Interview engine (structured mode)

Implemented in `server/realtime/interview/` and wired into `session.js`; documented in [interview-lifecycle.md](interview-lifecycle.md#interview-engine-structured-mode-default). Structured evaluation + decision (one model call per answer), backend-enforced policy (follow-up/clarification/repeat limits, early-end rejection, question and time budgets, duplicate rejection, gradual difficulty), rule-based candidate intents, conversation state machine, per-answer idempotent persistence, deterministic final evaluation, recovery of the interview position from MongoDB. Rollback: `INTERVIEW_ENGINE=freeform`.

**Verified:** 161 server tests pass (46 engine unit tests, 5 WebSocket end-to-end tests with a scripted model, plus the earlier suites). Mutation checks: allowing the model to end early, committing engine state before a turn succeeds, and disabling turn idempotency each made tests fail. **Real model:** the engine was run once against live Gemini (`gemini-3.5-flash-lite`, `global`, JSON mode): valid structured output, a prompt-injection answer was scored 0 and its attempted early end was overridden, repeat/"I don't know" worked. That run found and fixed one bug (clarified answers were still scored).
**Not verified:** a real browser interview, the audio path (mic → Deepgram → TTS; no Deepgram key configured), `next build`, real MongoDB for the new models/store methods (`InterviewAnswer`, `InterviewEvaluation`, `saveEngineState`), evaluation quality and difficulty thresholds against real candidates. Prompts (`interview-v1`) are first drafts.
**Behaviour change:** structured mode is now the default; the interviewer opens with a fixed greeting and asks a bounded number of questions, then ends the interview and stores a final evaluation.

## Turn-taking, cancellation and race handling

Implemented across `server/realtime/session.js`, `interview/engine.js`, `interview/candidateTurn.js`, `util.js` (`raceAbort`) and `client/src/features/interview/`; documented in [interview-lifecycle.md](interview-lifecycle.md#turn-taking-cancellation-and-races). Generation ids, a single commit point (a cancelled generation changes no state and writes nothing), answers that supersede each other with their text merged, strict turn-taking with server-side enforcement, playback acknowledgement tied to the generation, watchdog, idempotent `start_stt`, and a client turn machine plus microphone controller.

**Behaviour changes:** overlapping answers no longer queue (the newest supersedes and absorbs the older); `WS_MAX_QUEUED_TURNS` was removed and `BUSY` now only means "a greeting while another turn is active"; the AI keeps the floor until the client reports playback finished (`playback_ended`); strict mode drops mic audio while the AI speaks (set `INTERVIEW_BARGE_IN=true` to keep the old barge-in); the interview, history and database advance only after the reply (LLM and TTS) is complete.

**Verified:** 187 server tests (23 race/cancellation tests in `cancellation.test.js`, one per scenario you listed, plus lifecycle and `raceAbort` units) and 32 new client tests (21 turn machine, 11 microphone controller with fakes; 64 client tests in total). Mutation checks: removing the abort race around TTS, committing before TTS, ignoring generation ids on acks, disabling strict turn-taking, dropping carried text, writing on behalf of a stale generation, allowing duplicate `start_stt` reopen, and removing the one-active-turn invariant each made tests fail. One mutation (removing the second staleness check after TTS) is **not** caught because `raceAbort` already guarantees the same thing; the check is kept as a defensive assertion. **Live run** against the running server with real Gemini, real Google TTS and real MongoDB: opening audio (first real TTS call), a superseded answer got no reply and was stored as `SUPERSEDED` with its text merged, an interrupted turn got no reply, the playback ack returned the floor. That run found and fixed two real bugs (clarified answers counted as 0 in the final evaluation; interrupted answers left `PENDING`).
**Not verified:** the browser microphone and AudioWorklet path, auto-listening and the phase label in a real browser; speech-to-text (no Deepgram key), so strict mode's STT filtering was only unit-tested. **Cancellation is invalidation, not termination, for Google TTS** (no SDK support), and for Vertex only the HTTP request is aborted.

## Not implemented (no code exists)

Streaming LLM responses, streaming TTS, incremental audio playback (investigated, see [interview-lifecycle.md](interview-lifecycle.md)); resume upload/parsing/RAG; ATS analysis; adaptive difficulty; multi-evaluator scoring; speech analytics; coding environment and sandboxed execution; recruiter dashboard and job management; PDF reports; video analysis; integrity monitoring; learning roadmaps; background job queue; Mermaid diagrams for features that do not exist yet; docs `ai-pipeline`, `database-schema`, `api`, `security`, `deployment`.

## Blockers / decisions needed before Milestone C onward

- ~~Authentication model~~ decided: in-repo JWT, step 1 built.
- **Vector store.** Pick MongoDB Atlas Vector Search (no new infra if the cluster is Atlas) vs. a dedicated store. Needs the deployment target.
- **Embedding provider and credentials** (Vertex text-embedding vs. another).
- **Code-execution backend** (hosted service such as Judge0 vs. self-hosted container sandbox). Must not run in the Express process.
- **Queue** (BullMQ needs Redis; not present today).

## Next milestone

Run the stabilized flow against real credentials and record a baseline (see [performance.md](performance.md)), then resolve the auth decision, then Milestone C.
