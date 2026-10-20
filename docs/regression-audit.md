# Regression audit: original app (Git HEAD) vs. the redesigned UI

Baseline: the committed version (`d7df4f8`) had `GET /api/interviews` (everything, no auth), `POST /api/interviews/create-interview`, a "Start Interview" button to `/interviews/:id`, and the WebSocket interview room. Everything else (auth, scoping, roles) was added afterwards and is uncommitted.

## Root cause of the empty candidate dashboard
The candidate dashboard re-filtered the API response on the client by "assigned to my email". Interviews created the original way (and the one in your database, `MERN stack developer intern`) have no assignment record, and `AUTH_ENFORCED` is not set, so the API correctly returned them but the client dropped every one. The original page showed everything the API returned.

**Fix (client mapping layer, no backend contract change):** `liveCandidateInterviews()` trusts the backend's own scoping for real sessions (enforced: only the candidate's assigned, published interviews; not enforced: the original open list), drops drafts/archived, attaches the candidate's own assignment or a neutral "not started" one, and marks an interview completed when a report of theirs exists. The demo session keeps its client-side filter for its sample data.

## Other regressions found and fixed
| # | Found | Fix |
| --- | --- | --- |
| 1 | Admin overview and both report lists showed an "empty" state when the API failed (silent failure). | `LoadError` banner with retry, and loading text, on all three. |
| 2 | With `AUTH_ENFORCED` unset the backend ignored the signed-in candidate's token on the WebSocket, so their session, assignment status and report were never attributed to them. | A valid token is honoured when present; anonymous clients and invalid tokens still work as before. |

## Checklist (verified against a real backend started like yours: `AUTH_ENFORCED` unset, throwaway MongoDB, real Gemini and Google TTS)
Script: request -> response -> database record. All 29 checks passed.

| Original / required feature | Verified how |
| --- | --- |
| `GET /api/interviews` returns `{success, interviews[]}` without a token | A1 |
| `POST create-interview` with the **original** payload (`interviewDate`/`interviewTime`) | A2 |
| `GET /api/interviews/:id`, 404 for unknown id, 400 for missing title | A3, A4 |
| Created interview appears in the list (default status active) | A5 |
| Register, login, invalid credentials, `/me` with the Bearer token, refresh-cookie persistence | B1 to B5 |
| Admin login returns the admin role (drives the redirect), admin creates a recruiter | B6, B7 |
| Admin: save draft, publish validation, edit and publish, assign candidates, persisted in MongoDB | C1 to C5 |
| Legacy `POST /:id/assign` | C6: needs an authenticated user, so returns 401 when `AUTH_ENFORCED` is off. Unchanged and not used by the new UI (assignment is by email). |
| What a signed-in candidate's request returns (the dashboard bug) | D1, plus the client mapping run on the real payloads (`realPayload.test.ts`): legacy interview -> "upcoming", finished one -> "completed" with its report |
| AI interview, original anonymous protocol still works | E1: 520 KB of real TTS audio received |
| AI interview signed in: `session_ready`, resume token, `tts_audio`, follow-ups and next questions from Vertex, completion | E2, E3 |
| Persistence: session bound to the user, answers with transcript and evaluation, final evaluation | F1 to F3 |
| Assignment moves to completed; others untouched | F4, F5 |
| Reports: list with the candidate's email, detail is the real backend report, anonymous session unattributed | F6 to F8 |

Server suite: 228 tests. Client: 117 tests (+2 integration tests that run when `SIRI_REAL_PAYLOAD` points at captured API responses), type-check, lint, production build.

## Not verified, and remaining limits
- **Nothing was viewed in a browser** (the extension was unavailable). The room's browser-side code (microphone capture, Deepgram streaming, audio playback) is the unchanged `interviewBot.tsx` logic; the audit exercised the server side of the same protocol over a WebSocket with typed answers, so **speech-to-text (Deepgram) and microphone audio were not exercised** (no Deepgram key in this environment).
- Pagination: the original API had none.
- Per-user scoping, "your reports only" and assignment-only visibility are enforced by the **backend only when `AUTH_ENFORCED=true`**. With it unset the API is open, as originally, and a candidate sees every published interview.
- Interview "history" and "user profile" endpoints did not exist in the original app; the UI shows the candidate's identity from the auth token and history from the assignments and reports above.

## Addendum: starting a live interview on an interview created before the redesign
**Symptom (reported):** the room's WebSocket answered `hello` with `{"type":"error","code":"INTERNAL"}` for the existing interview `6ae193794bdffe26d40cd395`.

**Root cause:** when a signed-in candidate starts an interview, the backend marks their assignment "in progress" with an array update. Interviews created before assignments existed have no `assignments` field, and MongoDB rejects an array update on a missing path (`The path 'assignments' must exist in the document in order to apply array updates.`). The error was not caught, so the whole `hello` failed. The first audit missed it because every interview in its fixtures had been created by the new code.

**Fix:** the update now only applies when a matching assignment exists (`$elemMatch` filter), and this bookkeeping can no longer block an interview: a failure is logged and counted (`assignment.update_failed`) and the candidate still starts.

**Verified:** reproduced on a throwaway database with a document containing only the original fields; with the fix, `hello` returns `session_ready`, the opening plays real TTS audio, Vertex generates a question and a follow-up, and the evaluation is persisted with the candidate's identity. Regression test added (`interview.assignments.test.js`); server suite is 229 tests.

**Lesson recorded:** audit fixtures must include interviews in their original shape.
