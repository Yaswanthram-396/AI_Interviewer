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

## Not implemented (no code exists)

Streaming LLM responses, streaming TTS, incremental audio playback (investigated, see [interview-lifecycle.md](interview-lifecycle.md)); user authentication and authorization (no user model exists; REST endpoints are still unauthenticated); resume upload/parsing/RAG; ATS analysis; adaptive difficulty; multi-evaluator scoring; speech analytics; coding environment and sandboxed execution; recruiter dashboard and job management; PDF reports; video analysis; integrity monitoring; learning roadmaps; background job queue; Mermaid diagrams for features that do not exist yet; docs `ai-pipeline`, `database-schema`, `api`, `security`, `deployment`.

## Blockers / decisions needed before Milestone C onward

- **Authentication model.** Nothing in the repo identifies a user. Recruiter/candidate authorization, resume access control and cross-candidate isolation all depend on this. Decide: adopt the platform's existing identity provider (the package name mentions EarlyJobs) or build JWT auth here.
- **Vector store.** Pick MongoDB Atlas Vector Search (no new infra if the cluster is Atlas) vs. a dedicated store. Needs the deployment target.
- **Embedding provider and credentials** (Vertex text-embedding vs. another).
- **Code-execution backend** (hosted service such as Judge0 vs. self-hosted container sandbox). Must not run in the Express process.
- **Queue** (BullMQ needs Redis; not present today).

## Next milestone

Run the stabilized flow against real credentials and record a baseline (see [performance.md](performance.md)), then resolve the auth decision, then Milestone C.
