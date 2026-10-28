# CLAUDE.md — AI Interviewer Engineering Standards

## 1. Project Mission

Build and maintain a production-ready AI Interviewer platform using clean, maintainable, reusable, modular, secure, and scalable code.

Before implementing any feature, understand the existing codebase, identify the correct architectural layer, and follow established conventions unless there is a clear reason to improve them.

**Primary goals:**

- Clean, readable, self-documenting code.
- Reusable UI components, hooks, services, utilities, and business logic.
- Clear separation of concerns.
- Consistent naming conventions and predictable file organization.
- Strong TypeScript types and validation.
- Secure API and WebSocket communication.
- Testable, maintainable, and extensible architecture.
- Minimal duplication and minimal unnecessary dependencies.
- Preserve existing working functionality while making incremental improvements.

Do not sacrifice maintainability for implementation speed.

---

## 2. Mandatory Rules Before Making Changes

Before writing or modifying code:

1. Inspect the repository structure and existing `package.json` files.
2. Identify the frontend framework, backend framework, database, authentication strategy, WebSocket architecture, and external service integrations.
3. Read existing configurations, routing, shared components, API clients, database models, and service implementations relevant to the task.
4. Identify the current conventions and reuse existing patterns when appropriate.
5. Trace the complete data flow before changing functionality.
6. Identify dependencies between affected modules.
7. Create a short implementation plan for non-trivial tasks.
8. Check Git changes before editing files and never overwrite unrelated user work.

**Never assume a file, component, API, environment variable, or library exists without verifying it.**

Do not rewrite the entire application just to introduce a preferred architecture. Improve the codebase incrementally and preserve working functionality.

---

## 3. Architecture Principles

Apply these principles throughout the project:

### SOLID

- **Single Responsibility:** Each module, class, hook, component, and service should have one clear responsibility.
- **Open/Closed:** Extend behavior through appropriate abstractions rather than repeatedly modifying unrelated code.
- **Liskov Substitution:** Implementations of shared interfaces must remain interchangeable.
- **Interface Segregation:** Prefer focused interfaces over large interfaces that force unnecessary dependencies.
- **Dependency Inversion:** High-level business logic should depend on abstractions where doing so provides meaningful flexibility.

### Additional principles

- DRY: Avoid unnecessary duplication.
- KISS: Prefer straightforward solutions over unnecessary abstraction.
- YAGNI: Do not build speculative features.
- Composition over inheritance where appropriate.
- Explicit dependencies over hidden global dependencies.
- Keep business logic independent of presentation wherever practical.
- Separate infrastructure concerns from domain rules.
- Prefer pure functions for deterministic business logic.
- Use dependency injection when it improves testability or reduces coupling.

Do not create abstractions merely to demonstrate design patterns. Every abstraction must solve a real maintenance, reuse, or testing problem.

---

## 4. Folder Structure

First inspect the existing repository. Adapt the following structure to the actual framework and application boundaries rather than forcing an incompatible structure.

For a Next.js App Router frontend:

```text
src/
├── app/
│   ├── (auth)/
│   │   ├── login/
│   │   │   └── page.tsx
│   │   └── register/
│   │       └── page.tsx
│   ├── (dashboard)/
│   │   ├── layout.tsx
│   │   ├── interviews/
│   │   ├── candidates/
│   │   └── reports/
│   ├── api/                       # Only if Next.js API routes are used
│   ├── layout.tsx
│   ├── page.tsx
│   ├── error.tsx
│   ├── loading.tsx
│   └── not-found.tsx
│
├── components/
│   ├── ui/                        # Generic, reusable UI primitives
│   ├── layout/                    # Header, sidebar, navigation
│   ├── forms/                     # Shared form controls
│   └── feedback/                  # Loading, error, empty states
│
├── features/
│   ├── auth/
│   │   ├── components/
│   │   ├── hooks/
│   │   ├── services/
│   │   ├── schemas/
│   │   ├── types/
│   │   ├── utils/
│   │   └── index.ts
│   ├── interviews/
│   │   ├── components/
│   │   ├── hooks/
│   │   ├── services/
│   │   ├── schemas/
│   │   ├── types/
│   │   ├── utils/
│   │   └── index.ts
│   ├── candidates/
│   ├── resumes/
│   ├── assessments/
│   ├── evaluations/
│   ├── reports/
│   └── recruiter-dashboard/
│
├── hooks/                         # Truly application-wide hooks only
├── lib/                           # Framework and third-party integrations
├── services/                      # Shared infrastructure integrations only
├── config/                        # Validated application configuration
├── constants/
├── types/                         # Truly shared domain-independent types
├── utils/                          # Small, pure, reusable helpers
├── styles/
└── tests/
```

If the repository uses a separate Express backend, keep backend responsibilities separate:

```text
server/
├── src/
│   ├── app.ts
│   ├── server.ts
│   ├── config/
│   ├── modules/
│   │   ├── auth/
│   │   │   ├── auth.routes.ts
│   │   │   ├── auth.controller.ts
│   │   │   ├── auth.service.ts
│   │   │   ├── auth.repository.ts
│   │   │   ├── auth.schema.ts
│   │   │   ├── auth.types.ts
│   │   │   └── auth.test.ts
│   │   ├── interviews/
│   │   ├── candidates/
│   │   ├── resumes/
│   │   ├── assessments/
│   │   └── reports/
│   ├── middleware/
│   ├── infrastructure/
│   │   ├── database/
│   │   ├── websocket/
│   │   ├── ai/
│   │   ├── speech/
│   │   ├── storage/
│   │   └── queue/
│   ├── shared/
│   │   ├── errors/
│   │   ├── validation/
│   │   ├── logger/
│   │   └── types/
│   └── tests/
└── package.json
```

These structures are architectural references, not mandatory file creation lists. If the current repository uses different directories, map responsibilities onto the existing structure and migrate incrementally.

### Folder organization rules

- Organize business features by domain, not just by file extension.
- Keep feature-specific components and logic inside their feature.
- Put a component in the shared UI directory only when it is genuinely reusable.
- Keep route files thin: they should compose pages or delegate work to the appropriate feature.
- Keep controllers thin and services focused on business operations.
- Keep database access out of UI components and HTTP controllers where a service/repository boundary is appropriate.
- Avoid deeply nested folders without a meaningful architectural reason.
- Do not create empty placeholder files or directories for hypothetical future features.
- Avoid multiple competing implementations of the same service or shared component.
- Use barrel exports selectively. Avoid barrels that create circular imports or obscure dependency boundaries.

---

## 5. React and Next.js Standards

### Component design

- Prefer small, focused, composable components.
- Keep UI rendering separate from complex business logic.
- Extract repeated UI patterns into shared components.
- Use feature-specific components for behavior unique to one feature.
- Prefer controlled component interfaces with explicit props.
- Define TypeScript prop types or interfaces.
- Avoid components with too many responsibilities or excessive conditional branches.
- Split a component when doing so improves readability, reuse, testing, or independent change.
- Do not split every few lines into a separate component without a real benefit.

Example:

```tsx
type InterviewStatus = "scheduled" | "in_progress" | "completed";

interface InterviewStatusBadgeProps {
  status: InterviewStatus;
}

const STATUS_LABELS: Record<InterviewStatus, string> = {
  scheduled: "Scheduled",
  in_progress: "In progress",
  completed: "Completed",
};

export function InterviewStatusBadge({ status }: InterviewStatusBadgeProps) {
  return <span data-status={status}>{STATUS_LABELS[status]}</span>;
}
```

Do not repeat status-label logic across pages. Reuse the shared component and its typed mapping.

### Hooks

- Extract reusable stateful behavior into custom hooks.
- Keep hooks focused on one coherent behavior.
- Follow the Rules of Hooks.
- Do not use effects for calculations that can happen during rendering.
- Do not use `useEffect` to synchronize state unnecessarily.
- Handle subscriptions, event listeners, and cleanup correctly.
- Avoid unnecessary memoization. Use `useMemo` and `useCallback` when there is a demonstrated performance or referential-stability reason.
- Keep WebSocket connection lifecycle logic separate from individual UI elements.

### Next.js conventions

- Use Server Components by default where supported.
- Add `"use client"` only when browser APIs, client-side interactivity, or client hooks require it.
- Keep client component boundaries as small as practical.
- Never expose secrets in client-side code or `NEXT_PUBLIC_` variables.
- Use the repository's established routing and data-fetching conventions.
- Handle loading, error, and empty states explicitly.
- Avoid duplicating data-fetching logic across server and client components.
- Do not introduce a second backend API layer when the existing architecture already provides the required functionality without a clear reason.

### Forms

- Reuse form fields, labels, validation messages, and submit controls.
- Keep validation schemas separate from rendering where appropriate.
- Validate user input on both client and server.
- Show field-level errors and accessible error messages.
- Prevent duplicate submissions.
- Handle loading, success, and failure states.
- Do not treat client-side validation as a security boundary.

---

## 6. TypeScript Standards

- Use strict TypeScript wherever the existing build permits it.
- Prefer precise types over `any`.
- Never introduce `any` to silence an error without a documented, justified reason.
- Use `unknown` at untrusted boundaries and narrow the type through validation.
- Avoid unsafe type assertions and non-null assertions.
- Use discriminated unions for stateful workflows.
- Use literal unions or enums consistently with existing conventions.
- Use generics only when they improve type safety or reuse.
- Keep API request and response types explicit.
- Distinguish database models, API DTOs, and frontend view models when their contracts differ.
- Avoid duplicating types between packages when a safe shared contract already exists.
- Validate external API responses at runtime when their shape is not guaranteed.
- Do not assume a TypeScript type validates incoming runtime data.

Prefer:

```ts
interface CreateInterviewInput {
  candidateId: string;
  jobId: string;
  scheduledAt: string;
}
```

Avoid:

```ts
function createInterview(input: any): any {
  // ...
}
```

---

## 7. Backend and API Standards

Use the existing backend framework and established architecture.

### Layer responsibilities

- **Routes:** Define endpoints and attach middleware.
- **Controllers:** Translate HTTP requests into application calls and responses.
- **Services:** Implement business rules and coordinate operations.
- **Repositories:** Encapsulate database access when this abstraction adds value.
- **Schemas:** Validate incoming data and external boundaries.
- **Types/DTOs:** Define explicit data contracts.
- **Infrastructure adapters:** Integrate databases, AI providers, speech services, storage, and queues.

Do not add a layer that only forwards every argument without adding value.

### API requirements

- Use consistent response and error formats.
- Use appropriate HTTP status codes.
- Validate path parameters, query parameters, request bodies, and uploaded files.
- Centralize error handling.
- Avoid exposing stack traces, secrets, internal prompts, or sensitive provider responses to clients.
- Apply authentication and authorization to protected endpoints.
- Add rate limits where appropriate.
- Configure request size and timeout limits.
- Use structured logs with request or correlation IDs.
- Implement pagination for potentially large result sets.
- Avoid returning full database documents when a smaller response DTO is sufficient.
- Make retries safe; use idempotency where duplicate operations would be harmful.
- Do not silently swallow errors.

Example response contract:

```ts
interface ApiError {
  code: string;
  message: string;
  details?: unknown;
  requestId?: string;
}
```

Adapt the exact response shape to the existing API conventions rather than introducing incompatible formats.

---

## 8. WebSocket and Real-Time Audio Standards

The interview experience depends on reliable, low-latency real-time communication. Do not treat WebSocket handlers as ordinary fire-and-forget callbacks.

- Separate connection management, protocol handling, session management, and interview business logic.
- Define and validate message types using discriminated unions.
- Validate every inbound message and enforce payload limits.
- Authenticate connections and authorize access to interview sessions.
- Associate messages with the correct session and turn.
- Use turn IDs or correlation IDs to prevent stale or out-of-order responses.
- Prevent duplicate processing of the same turn.
- Define explicit connection, interview, and turn states.
- Handle disconnects, reconnects, timeouts, cancellation, and cleanup.
- Implement backpressure or bounded queues where needed.
- Add heartbeat and connection-liveness handling where supported by the protocol.
- Handle provider errors, quota limits, and transient failures.
- Avoid logging raw audio, access tokens, or unnecessary transcript content.
- Measure end-of-speech-to-transcript, model latency, TTS latency, and end-to-end time to audible response.
- Keep provider-specific code behind focused adapters when multiple providers or test doubles justify it.
- Do not create a new WebSocket server or replace the current audio pipeline without first tracing the existing one.

Avoid blocking an entire turn on unrelated work when the architecture can safely perform those operations independently. However, preserve required ordering for transcript persistence, evaluation, and response generation.

---

## 9. AI, LLM, RAG, and Speech Integrations

Keep external AI and speech providers behind clearly defined service interfaces where useful.

Suggested responsibilities:

- `QuestionGenerationService`
- `InterviewEvaluationService`
- `ResumeParsingService`
- `ResumeRetrievalService`
- `SpeechToTextService`
- `TextToSpeechService`
- `LLMProvider`
- `ReportGenerationService`

These are examples, not instructions to create every file immediately.

Requirements:

- Keep prompts out of UI components and unrelated controllers.
- Store prompts as versioned templates or focused modules when they need independent maintenance.
- Separate prompt construction, provider invocation, output validation, and persistence.
- Validate structured LLM output before using it.
- Handle timeouts, retries, quotas, and provider failures.
- Do not retry non-idempotent operations blindly.
- Avoid sending unnecessary personal data to external providers.
- Use retrieval when relevant context is required; do not add a vector database just because the application uses AI.
- Track model, prompt version, latency, and usage where appropriate.
- Keep evaluation criteria explicit, consistent, and testable.
- Treat model output as untrusted input.
- Avoid presenting speculative psychological inferences as factual assessments.
- Use provider-independent abstractions only where they genuinely reduce coupling.

---

## 10. Database and Data Integrity

- Keep database schemas and models organized by domain.
- Define validation, indexes, and constraints based on actual access patterns.
- Avoid N+1 query patterns and unbounded queries.
- Use pagination for large collections.
- Use transactions when multiple database writes must succeed or fail together and the database supports the required guarantees.
- Use explicit projections to avoid loading unnecessary fields.
- Keep sensitive data access restricted.
- Avoid exposing internal database fields in public API responses.
- Define retention and deletion behavior for audio, transcripts, resumes, and reports.
- Do not store redundant copies of data unless there is a clear purpose.
- Avoid adding indexes without considering write cost and query patterns.
- Make migrations or schema changes backward-compatible when possible.

For MongoDB/Mongoose, use typed schemas, appropriate indexes, validated inputs, and explicit projections. Do not assume Mongoose validation alone covers every application-level invariant.

---

## 11. Naming Conventions

Follow the repository's existing conventions consistently. If no convention exists, use:

- React components: `PascalCase.tsx`
- Hooks: `useSomething.ts`
- Utilities: `camelCase.ts`
- Services: `interview.service.ts` or the established project convention
- Controllers: `interview.controller.ts`
- Routes: `interview.routes.ts`
- Schemas: `interview.schema.ts`
- Tests: `interview.service.test.ts` or the established test convention
- Types and interfaces: descriptive `PascalCase`
- Constants: `UPPER_SNAKE_CASE` for true constants
- Boolean variables: meaningful prefixes such as `is`, `has`, or `can`

Names must describe intent, not implementation accidents.

Avoid vague names such as:

- `data`
- `result`
- `temp`
- `helper`
- `common`
- `manager`
- `misc`

These are acceptable only when their meaning is genuinely clear from the local context.

Avoid abbreviations unless they are widely understood in the project domain.

---

## 12. Reusable Component Rules

Before creating a new component, hook, utility, or service:

1. Search for existing implementations.
2. Determine whether the existing implementation can be extended safely.
3. Identify whether the behavior is feature-specific or genuinely shared.
4. Define a minimal, clear interface.
5. Ensure the abstraction does not introduce unnecessary dependencies.

Create shared components for repeated patterns such as:

- Buttons, inputs, selects, modals, badges, tooltips.
- Loading indicators, error states, and empty states.
- Page headers, breadcrumbs, and common layout elements.
- Form fields and validation messages.
- Tables, pagination, and reusable filters where requirements overlap.

Do not make every component configurable through dozens of props. Prefer composition and focused variants.

Avoid:

- Duplicated business logic in multiple components.
- Giant universal components that handle unrelated workflows.
- Feature-specific logic in generic UI primitives.
- Copy-pasted fetch logic.
- Multiple API clients with inconsistent behavior.
- Global state for data that belongs locally to one component.
- Premature abstraction based on only one unstable use case.

---

## 13. Error Handling, Logging, and Observability

- Use explicit error types or stable error codes where useful.
- Handle expected failures at the appropriate boundary.
- Propagate unexpected failures to centralized handlers.
- Never use empty `catch` blocks.
- Do not expose internal errors to end users.
- Use structured logging rather than scattered debug statements.
- Remove temporary debug logs before completing a task.
- Never log credentials, access tokens, secrets, raw audio, or sensitive personal data.
- Include request IDs and turn IDs where appropriate.
- Record performance metrics for latency-sensitive operations.
- Distinguish recoverable provider errors from invalid user input and internal bugs.

Do not silently return fake success responses or empty data to hide failures.

---

## 14. Security and Privacy

- Never hardcode API keys, credentials, private URLs, or secrets.
- Read secrets from validated environment configuration.
- Maintain a safe `.env.example` without real credentials.
- Validate and sanitize untrusted inputs.
- Enforce authentication and resource-level authorization.
- Apply least-privilege access.
- Protect against injection, insecure direct object references, path traversal, and unsafe file uploads.
- Use secure cookie and token handling consistent with the existing authentication model.
- Restrict CORS and WebSocket origins to intended clients.
- Do not trust client-supplied user IDs, roles, scores, or ownership claims.
- Apply appropriate retention, access controls, and deletion policies to resumes, transcripts, and recordings.
- Obtain appropriate consent for audio or video capture.
- Never execute submitted interview code directly inside the API server process. Use a properly isolated execution environment if coding assessments are implemented.

Review security-sensitive changes explicitly before considering a task complete.

---

## 15. Testing Standards

Every meaningful change should have appropriate tests.

- Unit-test pure functions and business rules.
- Test service behavior and error paths.
- Integration-test API endpoints and database interactions where appropriate.
- Test authentication and authorization boundaries.
- Test WebSocket protocol validation, turn correlation, disconnections, duplicate events, and concurrency.
- Test audio pipeline state transitions and provider failure handling.
- Test critical frontend interactions and form validation.
- Include regression tests for fixed bugs.
- Mock external providers in unit tests.
- Do not rely exclusively on mocks for critical integration behavior.
- Keep tests deterministic and independent.
- Avoid tests that merely duplicate implementation details.

Use the test framework already installed. Do not add a new testing framework without a clear reason.

---

## 16. Performance and Maintainability

- Measure before optimizing.
- Avoid unnecessary renders, repeated network requests, and redundant database queries.
- Use lazy loading or code splitting where it materially improves the user experience.
- Avoid oversized client bundles.
- Keep audio processing and streaming responsive.
- Use streaming where it is supported and beneficial, without breaking the current protocol.
- Avoid loading entire collections or full histories unnecessarily.
- Configure bounded concurrency and timeouts for external calls.
- Use caching only with clear invalidation rules.
- Avoid introducing microservices, queues, or distributed infrastructure without a demonstrated requirement.

Optimize for correctness and observability first, then use measurements to guide performance work.

---

## 17. Code Quality Restrictions

Do not:

- Put the entire feature into one large component or service.
- Mix UI rendering, database access, provider calls, and business rules in one file.
- Duplicate code that should have one maintained implementation.
- Create circular dependencies.
- use `any` to bypass TypeScript errors.
- Add dependencies without evaluating existing alternatives.
- Introduce unnecessary design patterns or abstraction layers.
- Suppress lint or compiler errors without justification.
- Disable tests to make a build pass.
- Change unrelated behavior while implementing a feature.
- Rename or move many files without a migration plan.
- Replace a working implementation merely because another approach is fashionable.
- Commit secrets, credentials, or generated artifacts.
- Claim tests passed without running them.
- Claim a feature is complete when required behavior is still missing.

If a deliberate exception is necessary, explain why and limit its scope.

---

## 18. Environment and Configuration

- Keep environment-specific configuration out of business logic.
- Validate required environment variables at startup.
- Provide safe example configuration in `.env.example`.
- Never print secret values in logs.
- Separate development, test, and production configuration.
- Avoid scattering `process.env` access throughout the codebase.
- Preserve existing deployment conventions
