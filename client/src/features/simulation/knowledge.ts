/**
 * Offline interview content used by the *simulated* interview and the sample reports. It is
 * authored text, not model output: nothing here is produced by SIRI's evaluation pipeline.
 */
import type { ReportDifficulty } from "@/features/reports/types";

export interface KnowledgeQuestion {
  text: string;
  difficulty: ReportDifficulty;
  /** What a strong answer sounds like. */
  strongAnswer: string;
  /** A realistic partial answer. */
  partialAnswer: string;
  /** Concepts the partial answer gets right. */
  correct: string[];
  /** Concepts it leaves out. */
  missing: string[];
  betterApproach: string;
  feedback: string;
}

export interface TopicKnowledge {
  questions: KnowledgeQuestion[];
  strength: { title: string; explanation: string };
  improvement: { missing: string; whyItMatters: string; actions: string[] };
  roadmap: { objective: string; steps: string[]; resources: string[]; hours: number };
}

export const KNOWLEDGE: Record<string, TopicKnowledge> = {
  JavaScript: {
    questions: [
      {
        text: "Can you explain how the JavaScript event loop handles promises and timers?",
        difficulty: "intermediate",
        strongAnswer:
          "JavaScript runs on one call stack. When the stack is empty the event loop first drains the microtask queue, where promise callbacks live, and only then takes the next macrotask such as a setTimeout callback. That is why a resolved promise logs before a zero-delay timer.",
        partialAnswer: "The event loop lets JavaScript do async work. Promises run after the current code and timers run after their delay.",
        correct: ["JavaScript is single-threaded", "Async callbacks run after the current code finishes"],
        missing: ["Microtasks drain completely before the next macrotask", "Why a resolved promise runs before setTimeout(0)", "The role of the call stack"],
        betterApproach: "Walk through the call stack, then the microtask queue, then the macrotask queue, and use a tiny snippet to show the ordering.",
        feedback: "Good starting point. Practise predicting output order for mixed promises and timers.",
      },
      {
        text: "What is the difference between Promise.all() and Promise.allSettled()?",
        difficulty: "intermediate",
        strongAnswer:
          "Promise.all resolves with every result but rejects immediately when any promise rejects. Promise.allSettled always waits for every promise and returns an array of status objects, so I use it when I need each outcome, such as batch uploads.",
        partialAnswer: "Promise.all runs promises together and returns the results.",
        correct: ["Promise.all handles several promises concurrently"],
        missing: ["Promise.all rejects as soon as one promise rejects", "allSettled waits for all and reports each status", "When to choose each"],
        betterApproach: "State the failure behaviour of each first, then give a use case for each.",
        feedback: "Good starting point. Focus on failure handling when running multiple asynchronous operations.",
      },
      {
        text: "What is a closure, and where have you used one in real code?",
        difficulty: "beginner",
        strongAnswer:
          "A closure is a function that keeps access to variables from the scope where it was created, even after that scope has returned. I use them for private state, like a counter factory, and for memoizing expensive calls.",
        partialAnswer: "A closure is a function inside another function that can use its variables.",
        correct: ["Inner functions can read outer variables"],
        missing: ["The variables stay alive after the outer function returns", "A concrete use such as private state or memoization"],
        betterApproach: "Define it in one sentence, then show a counter factory to make the retained state obvious.",
        feedback: "Correct idea. Add a practical example to show you have used it.",
      },
    ],
    strength: {
      title: "Strong JavaScript fundamentals",
      explanation: "You explained scope, closures and asynchronous behaviour accurately and tied them to how code actually runs.",
    },
    improvement: {
      missing: "Your explanation of the event loop and the microtask queue was incomplete.",
      whyItMatters: "Execution order questions are common in interviews and the same model explains many real-world async bugs.",
      actions: ["Understand the call stack", "Study the task queue and the microtask queue", "Practise Promise and async/await execution-order exercises"],
    },
    roadmap: {
      objective: "Predict asynchronous execution order with confidence",
      steps: ["Understand execution contexts and the call stack", "Study microtasks versus macrotasks", "Practise output-based questions", "Complete 10 event loop exercises"],
      resources: ["MDN: Concurrency model and the event loop", "Jake Archibald: Tasks, microtasks, queues and schedules", "javascript.info: Event loop"],
      hours: 6,
    },
  },
  React: {
    questions: [
      {
        text: "How do props and state differ, and when would you lift state up?",
        difficulty: "beginner",
        strongAnswer:
          "Props are read-only inputs passed from a parent, state is data a component owns and can change. When two siblings need the same data I lift the state to their closest common parent and pass it down, so there is one source of truth.",
        partialAnswer: "Props come from the parent and state is inside the component.",
        correct: ["Props flow down from parents", "State belongs to the component"],
        missing: ["Props are immutable from the child's side", "Lifting state to a common parent for shared data"],
        betterApproach: "Contrast ownership and mutability, then use a two-sibling example to justify lifting state.",
        feedback: "Solid basics. Add the lifting-state scenario to show practical judgement.",
      },
      {
        text: "Why do list items need stable keys in React?",
        difficulty: "intermediate",
        strongAnswer:
          "Keys let React match elements between renders. With stable keys it can reorder and update the right DOM nodes and preserve state; using array indexes breaks that when the list order changes, causing wrong state and extra re-renders.",
        partialAnswer: "Keys help React know which items changed in a list.",
        correct: ["Keys help identify items between renders"],
        missing: ["Why indexes are a poor key when order changes", "Effects on preserved component state"],
        betterApproach: "Explain reconciliation briefly, then show the reorder bug that index keys cause.",
        feedback: "Right idea. Be ready to explain the failure that index keys cause.",
      },
    ],
    strength: {
      title: "Practical React knowledge",
      explanation: "You showed a good grasp of component composition, props and state with realistic examples.",
    },
    improvement: {
      missing: "Rendering behaviour, keys and memoisation were described only at a surface level.",
      whyItMatters: "Understanding reconciliation helps you avoid subtle state bugs and unnecessary re-renders.",
      actions: ["Read how reconciliation and keys work", "Profile a component with React DevTools", "Practise when memoisation helps and when it does not"],
    },
    roadmap: {
      objective: "Explain how React decides what to re-render",
      steps: ["Study reconciliation and keys", "Learn when effects run and how to clean up", "Profile re-renders with DevTools"],
      resources: ["React docs: Preserving and resetting state", "React docs: You might not need an effect"],
      hours: 5,
    },
  },
  "Node.js": {
    questions: [
      {
        text: "How does Node.js handle many concurrent requests on a single thread?",
        difficulty: "intermediate",
        strongAnswer:
          "Node uses an event-driven, non-blocking model. I/O is delegated to the operating system or the libuv thread pool and callbacks are queued when it completes, so the main thread is free to serve other requests. CPU-heavy work should move to worker threads.",
        partialAnswer: "Node is asynchronous so it can handle many requests without waiting.",
        correct: ["Node uses asynchronous, non-blocking I/O"],
        missing: ["libuv and the thread pool", "Why CPU-bound work blocks the loop", "Worker threads or clustering"],
        betterApproach: "Name the event loop and libuv, then mention what blocks it and how to avoid that.",
        feedback: "Good start. Learn where this model breaks down for CPU-bound tasks.",
      },
      {
        text: "What are streams in Node.js and when would you use them?",
        difficulty: "advanced",
        strongAnswer:
          "Streams process data in chunks instead of loading it all in memory, with backpressure to keep producers and consumers balanced. I use them for large file uploads and for piping a database cursor to an HTTP response.",
        partialAnswer: "Streams let you read data piece by piece, like reading a file.",
        correct: ["Streams handle data in pieces"],
        missing: ["Backpressure", "Memory benefits for large payloads", "Piping and composition"],
        betterApproach: "Lead with the memory benefit and backpressure, then give an upload or export example.",
        feedback: "Right concept. Backpressure is the detail interviewers look for.",
      },
    ],
    strength: {
      title: "Good Node.js understanding",
      explanation: "You described the non-blocking model correctly and connected it to how servers scale.",
    },
    improvement: {
      missing: "Detail on libuv, CPU-bound work and streaming was limited.",
      whyItMatters: "Knowing the limits of the event loop is key to building reliable, performant services.",
      actions: ["Study libuv and the event loop phases", "Try worker threads on a CPU-heavy task", "Build a streaming file upload"],
    },
    roadmap: {
      objective: "Understand what blocks the Node.js event loop and how to avoid it",
      steps: ["Study event loop phases", "Offload CPU work to worker threads", "Practise streams with backpressure"],
      resources: ["Node.js docs: Event loop, timers and nextTick", "Node.js docs: Backpressuring in streams"],
      hours: 5,
    },
  },
  "Express.js": {
    questions: [
      {
        text: "What is middleware in Express, and how would you use it for authentication?",
        difficulty: "intermediate",
        strongAnswer:
          "Middleware are functions with access to the request, response and next. They run in order, so I mount an auth middleware that verifies the token, attaches the user to the request and calls next, or responds with 401. Error-handling middleware takes four arguments and goes last.",
        partialAnswer: "Middleware runs between the request and the response. For auth you check the token in a middleware.",
        correct: ["Middleware sits between request and response", "Auth can be checked in middleware"],
        missing: ["Order of middleware matters", "Calling next() versus ending the response", "Error-handling middleware signature"],
        betterApproach: "Describe the request pipeline, then show the verify-attach-next pattern and where error handling goes.",
        feedback: "Good understanding. Mention middleware ordering and error handling.",
      },
    ],
    strength: {
      title: "Good backend routing and middleware",
      explanation: "You explained the role of Express middleware and applied it to authentication workflows.",
    },
    improvement: {
      missing: "Error handling and middleware ordering were not covered in depth.",
      whyItMatters: "Most production bugs in Express services come from ordering and unhandled errors.",
      actions: ["Learn centralised error handling", "Practise ordering middleware correctly", "Add request validation middleware"],
    },
    roadmap: {
      objective: "Structure an Express API with predictable middleware",
      steps: ["Centralise error handling", "Validate input in middleware", "Add structured request logging"],
      resources: ["Express docs: Error handling", "Express docs: Writing middleware"],
      hours: 3,
    },
  },
  MongoDB: {
    questions: [
      {
        text: "How do indexes improve query performance in MongoDB?",
        difficulty: "intermediate",
        strongAnswer:
          "Without an index MongoDB scans the whole collection. An index is a B-tree on the fields, so lookups and sorts jump straight to matching documents. Compound indexes follow the equality, sort, range order, and I check explain() to confirm an index scan instead of a collection scan.",
        partialAnswer: "Indexes make queries faster by helping MongoDB find documents quicker.",
        correct: ["Indexes speed up reads"],
        missing: ["Collection scan versus index scan", "Compound index field order", "Using explain() to verify"],
        betterApproach: "Contrast a collection scan with an index scan, then show a compound index and how to verify it with explain().",
        feedback: "You know the goal. Practise reading query execution plans.",
      },
      {
        text: "When would you use the aggregation pipeline instead of multiple queries?",
        difficulty: "advanced",
        strongAnswer:
          "When I need to filter, group and reshape data on the database side. A pipeline of $match, $group and $project runs in one round trip and can use indexes in the early stages, which is cheaper than pulling documents into the application.",
        partialAnswer: "The aggregation pipeline is for more complex queries like grouping.",
        correct: ["Aggregation handles grouping"],
        missing: ["Doing the work server-side in one round trip", "Putting $match early to use indexes"],
        betterApproach: "Explain the cost of fetching everything to the app, then show a $match then $group example.",
        feedback: "Right direction. Link pipeline stages to performance.",
      },
    ],
    strength: {
      title: "Working knowledge of MongoDB",
      explanation: "You described CRUD and data modelling choices clearly and with practical context.",
    },
    improvement: {
      missing: "You could not clearly explain how indexes improve query performance or how to verify it.",
      whyItMatters: "Indexing is the most common lever for database performance and a frequent interview topic.",
      actions: ["Understand B-tree indexes", "Learn compound index ordering", "Practise reading query execution plans"],
    },
    roadmap: {
      objective: "Design and verify indexes for real query patterns",
      steps: ["Learn how B-tree indexes work", "Study compound indexes and the ESR rule", "Practise aggregation pipelines", "Analyse slow queries with explain()"],
      resources: ["MongoDB University: Indexing Design Fundamentals", "MongoDB docs: ESR rule for compound indexes"],
      hours: 8,
    },
  },
  "REST APIs": {
    questions: [
      {
        text: "What does it mean for an HTTP method to be idempotent, and which REST methods are?",
        difficulty: "intermediate",
        strongAnswer:
          "An idempotent request has the same effect whether it is sent once or many times. GET, PUT and DELETE are idempotent while POST is not, which is why payment endpoints take an idempotency key so retries are safe.",
        partialAnswer: "Idempotent means you can call it again and nothing breaks. GET is idempotent.",
        correct: ["Repeated calls should be safe", "GET is idempotent"],
        missing: ["PUT and DELETE are idempotent, POST is not", "Idempotency keys for safe retries"],
        betterApproach: "Define it by effect, list the methods, then explain how to make a POST retry-safe.",
        feedback: "Good start. Tie idempotency to retries and failure handling.",
      },
    ],
    strength: {
      title: "Clear REST API design",
      explanation: "You used resources, methods and status codes consistently when describing APIs.",
    },
    improvement: {
      missing: "Versioning, pagination and idempotency strategies were not discussed.",
      whyItMatters: "These decisions determine whether an API can evolve and be retried safely.",
      actions: ["Study pagination strategies", "Learn API versioning approaches", "Practise designing retry-safe endpoints"],
    },
    roadmap: {
      objective: "Design APIs that are easy to evolve and safe to retry",
      steps: ["Compare pagination styles", "Design idempotent endpoints", "Choose a versioning strategy"],
      resources: ["Microsoft REST API guidelines", "Stripe docs: Idempotent requests"],
      hours: 3,
    },
  },
  Authentication: {
    questions: [
      {
        text: "What are the trade-offs between session cookies and JWTs for authentication?",
        difficulty: "intermediate",
        strongAnswer:
          "Sessions keep state on the server so they are easy to revoke, while JWTs are stateless and scale across services but are hard to revoke before expiry. I use short-lived access tokens with rotating refresh tokens in an HttpOnly cookie to get both.",
        partialAnswer: "JWTs are stateless and sessions are stored on the server.",
        correct: ["JWTs are stateless", "Sessions are stored server-side"],
        missing: ["Revocation is the main JWT weakness", "Short-lived access plus refresh tokens", "Where to store tokens safely"],
        betterApproach: "Compare revocation, scaling and storage, then describe the hybrid access plus refresh token pattern.",
        feedback: "Good comparison. Mention revocation and token storage.",
      },
    ],
    strength: {
      title: "Sound authentication fundamentals",
      explanation: "You separated authentication from authorisation and understood token-based flows.",
    },
    improvement: {
      missing: "Token revocation and secure storage were not covered.",
      whyItMatters: "Authentication flaws are a leading cause of real security incidents.",
      actions: ["Study refresh token rotation", "Learn about HttpOnly and SameSite cookies", "Review the OWASP authentication cheat sheet"],
    },
    roadmap: {
      objective: "Implement and defend a secure token-based authentication flow",
      steps: ["Study refresh token rotation", "Learn cookie security attributes", "Review the OWASP authentication cheat sheet"],
      resources: ["OWASP Authentication Cheat Sheet", "OWASP Session Management Cheat Sheet"],
      hours: 4,
    },
  },
  "System Design": {
    questions: [
      {
        text: "How would you scale a read-heavy API to ten times its current traffic?",
        difficulty: "advanced",
        strongAnswer:
          "First measure where the time goes. Then add a cache such as Redis for hot reads with a clear invalidation rule, put a CDN in front of static and cacheable responses, add read replicas for the database, and scale the stateless API horizontally behind a load balancer.",
        partialAnswer: "I would add more servers and maybe a cache to make it faster.",
        correct: ["Adding servers helps", "Caching can reduce load"],
        missing: ["Measuring before optimising", "Cache invalidation strategy", "Read replicas and trade-offs", "Load balancing a stateless tier"],
        betterApproach: "Start with measurement, then layer cache, replicas and horizontal scaling while naming the trade-offs of each.",
        feedback: "A reasonable start. Practise explaining trade-offs, not only components.",
      },
    ],
    strength: {
      title: "Systems thinking",
      explanation: "You reasoned about components and their interactions rather than only individual technologies.",
    },
    improvement: {
      missing: "Your answers on scalability, caching and database trade-offs lacked depth.",
      whyItMatters: "Design discussions separate strong candidates from good ones at most levels.",
      actions: ["Learn caching strategies and invalidation", "Understand load balancing", "Practise API scalability questions"],
    },
    roadmap: {
      objective: "Reason about scalability and trade-offs in a design discussion",
      steps: ["Learn caching strategies and invalidation", "Understand load balancing and replication", "Practise API scalability questions"],
      resources: ["System Design Primer (GitHub)", "Designing Data-Intensive Applications, chapters 1 to 3"],
      hours: 10,
    },
  },
};

/** Fallback so any admin-defined topic still produces a coherent question and feedback. */
export function knowledgeFor(topic: string): TopicKnowledge {
  const known = KNOWLEDGE[topic];
  if (known) return known;
  return {
    questions: [
      {
        text: `Walk me through how you have used ${topic} on a real project and a decision you would make differently.`,
        difficulty: "intermediate",
        strongAnswer: `On a recent project I used ${topic} to solve a concrete problem. I compared two options, chose one for a stated reason, and later changed my approach after measuring the result.`,
        partialAnswer: `I have used ${topic} in a few projects and it worked well for what we needed.`,
        correct: [`Some hands-on exposure to ${topic}`],
        missing: ["The specific problem that was solved", "Alternatives considered and the trade-offs", "A decision revisited with hindsight"],
        betterApproach: "Describe the problem, the options, your choice and what you learned, in that order.",
        feedback: "A fair start. Use a concrete example with a trade-off to make the answer memorable.",
      },
    ],
    strength: { title: `Good grasp of ${topic}`, explanation: `You explained ${topic} concepts accurately and with relevant context.` },
    improvement: {
      missing: `More depth on ${topic} trade-offs and real examples would strengthen the answers.`,
      whyItMatters: `${topic} depth is a common differentiator in technical interviews.`,
      actions: [`Review core ${topic} concepts`, `Build a small project that exercises ${topic}`, "Practise explaining trade-offs aloud"],
    },
    roadmap: {
      objective: `Deepen practical understanding of ${topic}`,
      steps: [`Review ${topic} fundamentals`, "Build a small project", "Practise explaining your design choices"],
      resources: [`Official ${topic} documentation`, "A hands-on tutorial project"],
      hours: 4,
    },
  };
}

/** Candidate answers that are not tied to a topic bank (introductions and generic replies). */
export const INTRO_ANSWER =
  "Hi, I'm a full stack developer with about two years of experience. I mostly build React front ends and Node and MongoDB back ends, and I recently shipped an internal dashboard used by our support team.";
