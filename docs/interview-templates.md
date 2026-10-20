# Interview templates

Predefined interview blueprints stored in MongoDB. The backend owns topic progression, main-question counts, follow-up limits, timing and session state; Vertex AI only phrases questions and evaluates answers inside the plan the backend gives it.

## The four seeded templates

| Template (slug) | Duration | Main questions | Topics | Follow-ups |
| --- | ---: | ---: | ---: | --- |
| JavaScript Developer Interview (`javascript-developer`) | 30 min | 15 | 10 | max 2 per main question |
| Frontend Developer — JavaScript, React and Scenarios (`frontend-developer`) | 45 min | 18 | 12 | max 2 |
| MERN Stack Full-Stack Developer Interview (`mern-stack-developer`) | 60 min | 24 | 14 | max 2 |
| Database Engineering — SQL and NoSQL Interview (`database-sql-nosql`) | 45 min | 18 | 14 | max 2 |

These are defaults stored in the database, not runtime constants: editing a template changes the interviews that start afterwards.
The definitions live in `server/interviews/templates/definitions.js` (seed configuration only). Question banks are in `server/interviews/templates/questions/`.

### Time model

`durationMinutes >= openingMinutes + sum(topic.allocatedMinutes) + transitions + closingMinutes`, with `transitions = (topics - 1) * transitionSeconds / 60`. Follow-ups spend the time of their parent topic. Every template and every API write is validated against this, against `sum(topic.questionCount) == totalQuestions` and against topic weightage totalling 100 (`interviews/templates/validate.js`).

## Data model (MongoDB)

| Collection | Purpose | Key indexes |
| --- | --- | --- |
| `interviewtemplates` | title, slug, description, category, version, duration, totalQuestions, difficulty, difficultyDistribution, `topics` (ids), followUpLimit, timing, evaluationCriteria, aiInstructions, status | unique `slug`; `(status, category)` |
| `interviewtopics` | one per topic: name, slug, description, questionCount, allocatedMinutes, difficulty, weightage, sequence, questionTypes, evaluationCriteria | unique `(templateId, sequence)`, unique `(templateId, slug)` |
| `interviewquestionbanks` | reference questions with expectedConcepts, evaluationCriteria, suggestedAnswerPoints (answer key), tags, isActive | `(templateId, topicId, isActive, questionType, difficulty)`; unique `(topicId, contentHash)` |

Templates, topics and questions reference each other by id; the bank is never embedded. Question types: `CONCEPTUAL, PRACTICAL, OUTPUT_BASED, CODING, SCENARIO_BASED, DESIGN_BASED`.

Related changes: `Interview.templateId`; `InterviewSession.interviewDetails.template` (frozen configuration), `templateId`, `templateVersion`; `InterviewAnswer` gained `questionKind, bankQuestionId, followUpIndex, evaluationCriteria, timing`.

## Seeding

```
npm run seed:templates        # node scripts/seed-interview-templates.js
```

Idempotent: templates match by slug, topics by (template, slug), questions by (topic, content hash). Re-running with unchanged definitions changes nothing. A changed definition updates the template and bumps `version`. It never deletes interviews, sessions, answers or evaluations; a custom template that already uses a seeded slug is skipped; a question an admin deactivated stays deactivated; reworded or removed seed questions are retired (`isActive: false`), not deleted. Definitions and banks are validated before anything is written.

## How an interview runs

1. `POST /api/interviews/create-interview` with `{ "templateId": "<id or slug>", "assignments": [...] }` creates a normal interview (assignments, scoping, reports and the room all work unchanged). Title, description, duration, topics, weights, question counts and the follow-up limit come from the template. Such an interview's `settings` cannot be edited (409): edit the template.
2. When a candidate connects, `hello` reads the template **at that moment** and the session stores a frozen copy (`interviewDetails.template`, with `templateVersion`). Reconnecting restores that copy and the engine state, so counters and topic progress survive. Later template edits only affect sessions that start afterwards.
3. For every main question the engine (not the model) decides the topic (first topic in sequence with questions left), the question type (rotating through the topic's types), the difficulty (the topic's, moved at most one step by sustained performance) and picks up to three unused reference questions from the bank (shuffled within best-fit tiers, so candidates differ).
4. The model receives that plan plus the rolling summary, previously asked questions and remaining minutes, and returns structured JSON (`question, topic, difficulty, questionType, evaluationCriteria, isFollowUp, parentQuestionId, referenceId`). The backend rejects it unless the topic is the planned topic, it is not a follow-up and it is not a repeat; a type outside the topic's types is corrected. After two failures the bank question itself is asked. Provider outages are not masked.
5. Follow-ups come from the evaluation call (they must react to the actual answer). The backend caps them per main question, tracks them per topic, links them to the parent and never counts them as main questions.
6. The model never writes the next main question in a template interview and cannot end the interview early or add questions.

### Follow-up guidance given to the model

Incomplete answer: ask about one missing concept. Correct: at most one deeper practical follow-up, if time allows. Incorrect: one clarification (not scored) before concluding anything. Excellent (9-10): move on. No follow-ups under time pressure.

### Time management (backend clock)

* The interview start time is stored in the engine state; remaining time is sent to the model with each request.
* Time is charged to the topic of the question being answered (a pause longer than 5 minutes is capped).
* **Time pressure** (no more follow-ups): the remaining minutes are not more than `remainingMainQuestions * (approxAnswerSeconds + transitionSeconds) / 60 + closingMinutes`, or the current topic used its whole allocation.
* A topic that used `INTERVIEW_TOPIC_OVERRUN_FACTOR` (default 1.5) times its allocation is moved past; its unasked questions are asked later if nothing else is left, so the distribution still holds.
* When the duration expires the interview completes after the answer in progress (there is no timer that cuts a candidate off mid-answer).
* Per answer: `timing.responseMs` (time since the question was asked, which includes AI speech), `evaluationMs`, `generationMs`.

## API

| Method and path | Who | Purpose |
| --- | --- | --- |
| `GET /api/interview-templates` | any signed-in user | List templates (candidates see active ones only) |
| `GET /api/interview-templates/:idOrSlug` | any | Details, topics, difficulty distribution, bank sizes (managers) |
| `GET /api/interview-templates/:idOrSlug/topics` | any | Topic configuration |
| `GET /api/interview-templates/:idOrSlug/topics/:topicId/questions?difficulty=&type=&page=&limit=` | recruiter, admin | Question bank page, **including the answer key** |
| `POST /api/interview-templates` | admin | Create a template (created as `draft`) |
| `PUT /api/interview-templates/:idOrSlug` | admin | Replace configuration, bump version, optional `status` |
| `POST /api/interviews/create-interview` `{templateId}` | recruiter, admin | **Existing endpoint, extended**: initialize an interview from a template |
| `GET /api/interview-sessions/:sessionId/progress` | owner / manager | Current topic, questions asked and remaining (topic and interview), follow-ups, elapsed and remaining time |
| WebSocket `hello` / `start_interview` / `user_turn` | candidate | **Existing**: starts the session, generates the next question, submits and evaluates answers |
| `GET /api/reports`, `GET /api/reports/:sessionId` | **existing** | Final results (topic-wise scores weighted by the template's weightage) |

When `AUTH_ENFORCED` is unset the API is open, as for interviews today; the role gates above apply once it is enforced.

## Prompt changes

New prompts, versioned `interview-v2-template` (stored on each answer); the non-template prompts (`interview-v1`) are unchanged. See `server/realtime/interview/prompts.js`:

* `TEMPLATE_QUESTION_SYSTEM`: write one main question for `plan` (topic, description, type, difficulty, reference questions, remaining minutes), adapt a reference when possible, return `referenceId`, never repeat, spoken-length limits, never ask the candidate to type.
* `TEMPLATE_ANALYSIS_ADDENDUM`: backend owns topics and counts, how to choose the next action by answer quality, no follow-ups under time pressure, private scoring guide from the question's expected concepts and criteria.

## Known limits

* Writes to templates are not transactional (a standalone MongoDB has no transactions); the seeder and `PUT` re-sequence topics in a safe order and the seed fingerprint is written last, so an interrupted run is redone.
* Template durations are copied onto the interview (`timeLimit`) for display; the running session always uses the template's current duration at start.
* There is no template picker in the client yet; use the API (the admin UI's own form is unchanged).
* Questions the candidate must "type" (full coding) are out of scope for a voice interview; output-based and coding questions are asked as spoken walkthroughs.
