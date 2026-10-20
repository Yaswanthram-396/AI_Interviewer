/**
 * The predefined interview templates. This file is seed *configuration*: the seeder writes it to MongoDB,
 * and from then on the database is the source of truth (the engine never reads this file at runtime).
 *
 * Time model (minutes): durationMinutes >= openingMinutes + sum(topic.allocatedMinutes) + transitions + closingMinutes,
 * where transitions = (topicCount - 1) * transitionSeconds / 60. Follow-ups spend the time of their parent topic.
 */
const { QUESTION_TYPES: T } = require("./constants");

/** Allocates `perQuestionMinutes` for each main question of the topic. */
const topic = (name, slug, description, questionCount, difficulty, weightage, questionTypes, evaluationCriteria, perQuestionMinutes) => ({
  name,
  slug,
  description,
  questionCount,
  difficulty,
  weightage,
  questionTypes,
  evaluationCriteria,
  allocatedMinutes: questionCount * perQuestionMinutes,
});

const COMMON_AI_INSTRUCTIONS =
  "Ask one spoken question at a time. Stay strictly inside the current topic. Probe the candidate's actual answer, never reveal expected answers, and prefer practical examples over trivia.";

const javascript = {
  slug: "javascript-developer",
  title: "JavaScript Developer Interview",
  category: "javascript",
  description:
    "A comprehensive technical interview designed to evaluate a candidate's understanding of JavaScript fundamentals, execution model, asynchronous programming, functions, closures, object-oriented concepts, and modern ES6+ features. The interview should assess both theoretical understanding and the ability to solve practical JavaScript problems.",
  durationMinutes: 30,
  difficulty: "INTERMEDIATE",
  followUpLimit: 2,
  timing: { openingMinutes: 1, closingMinutes: 1, transitionSeconds: 10, approxAnswerSeconds: 75 },
  evaluationCriteria: ["Technical accuracy", "Depth of conceptual understanding", "Ability to apply concepts to practical code", "Clarity of explanation"],
  aiInstructions: `${COMMON_AI_INSTRUCTIONS} Output-based questions describe short code aloud and ask for the result and the reason.`,
  topics: [
    topic("JavaScript Fundamentals", "javascript-fundamentals", "Data types, type coercion, equality, truthy and falsy values, primitives versus references, and core language behaviour.", 2, "BEGINNER", 10, [T.CONCEPTUAL, T.PRACTICAL], ["Knows the primitive and reference types", "Explains coercion and equality correctly"], 1.75),
    topic("Variables, Scope and Hoisting", "variables-scope-hoisting", "var, let and const, block and function scope, hoisting, the temporal dead zone and global scope.", 1, "BEGINNER", 8, [T.OUTPUT_BASED, T.CONCEPTUAL], ["Predicts hoisting results", "Explains the temporal dead zone"], 1.75),
    topic("Functions and Closures", "functions-and-closures", "Function declarations and expressions, arrow functions, this binding, call/apply/bind, closures, currying and higher-order functions.", 2, "INTERMEDIATE", 12, [T.CONCEPTUAL, T.PRACTICAL, T.OUTPUT_BASED], ["Explains lexical scope and closures", "Reasons about this binding"], 1.75),
    topic("Objects and Prototypes", "objects-and-prototypes", "Object creation, the prototype chain, inheritance, classes, property descriptors and object copying.", 2, "INTERMEDIATE", 12, [T.CONCEPTUAL, T.PRACTICAL], ["Explains the prototype chain", "Distinguishes shallow and deep copies"], 1.75),
    topic("Arrays and Important Methods", "arrays-and-methods", "map, filter, reduce, find, some, every, sort, flat, array mutation versus immutability and iteration patterns.", 1, "INTERMEDIATE", 8, [T.PRACTICAL, T.CODING], ["Chooses the right array method", "Knows which methods mutate"], 1.75),
    topic("ES6+ Features", "es6-plus-features", "Destructuring, spread and rest, template literals, modules, optional chaining, Map and Set, symbols, iterators and generators.", 1, "INTERMEDIATE", 8, [T.CONCEPTUAL, T.PRACTICAL], ["Uses modern syntax correctly", "Knows when to prefer Map and Set"], 1.75),
    topic("Event Loop and Asynchronous JavaScript", "event-loop-and-async", "The call stack, Web APIs, the microtask and macrotask queues, setTimeout, and the execution order of asynchronous code.", 2, "ADVANCED", 12, [T.CONCEPTUAL, T.OUTPUT_BASED], ["Explains call stack and queues", "Predicts asynchronous execution order"], 1.75),
    topic("Promises and Async/Await", "promises-and-async-await", "Promise states, chaining, error handling, Promise.all, allSettled, race and any, async/await and sequential versus parallel execution.", 2, "INTERMEDIATE", 12, [T.CONCEPTUAL, T.PRACTICAL, T.OUTPUT_BASED], ["Handles errors in async code", "Chooses the right Promise combinator"], 1.75),
    topic("DOM and Browser Concepts", "dom-and-browser", "DOM selection and manipulation, event bubbling, capturing and delegation, storage options, fetch, and rendering basics.", 1, "INTERMEDIATE", 6, [T.CONCEPTUAL, T.PRACTICAL], ["Explains event propagation", "Knows browser storage trade-offs"], 1.75),
    topic("Output-based and Problem-solving Questions", "output-and-problem-solving", "Predicting the output of tricky snippets and talking through the approach to small algorithmic problems.", 1, "INTERMEDIATE", 12, [T.OUTPUT_BASED, T.CODING], ["Traces code execution accurately", "Explains an approach before coding"], 1.75),
  ],
};

const frontend = {
  slug: "frontend-developer",
  title: "Frontend Developer — JavaScript, React and Scenarios",
  category: "frontend",
  description:
    "An interview designed to evaluate frontend development skills, focusing on JavaScript, React, component architecture, state management, rendering behavior, performance optimization, browser fundamentals, and practical frontend engineering scenarios. Candidates should demonstrate the ability to build maintainable, performant and responsive user interfaces and solve real-world frontend problems.",
  durationMinutes: 45,
  difficulty: "INTERMEDIATE",
  followUpLimit: 2,
  timing: { openingMinutes: 1, closingMinutes: 1, transitionSeconds: 10, approxAnswerSeconds: 90 },
  evaluationCriteria: ["Technical accuracy", "Component and architecture thinking", "Awareness of performance and accessibility", "Practical problem-solving"],
  aiInstructions: `${COMMON_AI_INSTRUCTIONS} Scenario questions describe a realistic production situation and ask how the candidate would approach it.`,
  topics: [
    topic("JavaScript Fundamentals", "javascript-fundamentals", "Types, scope, closures, this, equality and core language behaviour.", 1, "BEGINNER", 6, [T.CONCEPTUAL, T.OUTPUT_BASED], ["Core language accuracy"], 2.25),
    topic("Advanced JavaScript", "advanced-javascript", "The event loop, promises and async/await, prototypes, modules, debouncing, throttling and memory management.", 2, "ADVANCED", 9, [T.CONCEPTUAL, T.OUTPUT_BASED, T.PRACTICAL], ["Explains asynchronous behaviour", "Knows debounce and throttle"], 2.25),
    topic("HTML5 and CSS3 Fundamentals", "html5-css3", "Semantic HTML, accessibility, the box model, flexbox, grid, positioning, specificity, responsive design and media queries.", 2, "INTERMEDIATE", 9, [T.CONCEPTUAL, T.PRACTICAL], ["Writes semantic accessible markup", "Chooses flexbox or grid appropriately"], 2.25),
    topic("React Fundamentals", "react-fundamentals", "JSX, the virtual DOM, reconciliation, keys, controlled and uncontrolled components and the React mental model.", 1, "BEGINNER", 7, [T.CONCEPTUAL], ["Explains reconciliation and keys"], 2.25),
    topic("Components, Props and State", "components-props-state", "Component composition, props flow, lifting state up, derived state, children and reusable component design.", 2, "INTERMEDIATE", 9, [T.CONCEPTUAL, T.PRACTICAL, T.DESIGN_BASED], ["Designs reusable components", "Places state at the right level"], 2.25),
    topic("Hooks and Lifecycle", "hooks-and-lifecycle", "useState, useEffect, useRef, useMemo, useCallback, custom hooks, dependency arrays, cleanup and the rules of hooks.", 2, "INTERMEDIATE", 10, [T.CONCEPTUAL, T.PRACTICAL, T.OUTPUT_BASED], ["Uses effects and cleanup correctly", "Understands dependency arrays"], 2.25),
    topic("State Management", "state-management", "Local versus global state, Context, Redux and Redux Toolkit, Zustand, server state caching and choosing between them.", 1, "INTERMEDIATE", 8, [T.CONCEPTUAL, T.DESIGN_BASED], ["Chooses a state solution with trade-offs"], 2.25),
    topic("React Rendering and Performance Optimization", "react-rendering-performance", "When components re-render, memo, useMemo, useCallback, code splitting, lazy loading, list virtualization and profiling.", 2, "ADVANCED", 10, [T.CONCEPTUAL, T.PRACTICAL, T.SCENARIO_BASED], ["Diagnoses unnecessary renders", "Applies memoization appropriately"], 2.25),
    topic("API Integration and Error Handling", "api-integration-error-handling", "fetch and axios, loading and error states, race conditions, retries, cancellation, caching and handling API failures in the UI.", 1, "INTERMEDIATE", 8, [T.PRACTICAL, T.SCENARIO_BASED], ["Handles loading, error and race conditions"], 2.25),
    topic("Routing and Application Architecture", "routing-and-architecture", "Client-side routing, protected routes, code splitting by route, folder structure, separation of concerns and scalable architecture.", 1, "INTERMEDIATE", 6, [T.CONCEPTUAL, T.DESIGN_BASED], ["Structures a scalable frontend"], 2.25),
    topic("Frontend Security", "frontend-security", "XSS, CSRF, token storage, content security policy, input sanitization, CORS and secure handling of third-party scripts.", 1, "INTERMEDIATE", 6, [T.CONCEPTUAL, T.SCENARIO_BASED], ["Identifies common frontend vulnerabilities"], 2.25),
    topic("Scenario-based Problem Solving", "scenario-problem-solving", "Real-world situations: unnecessary re-renders, concurrent API calls, debouncing and throttling, auth and protected routes, API failures, reusable components, global state, large lists, WebSockets and debugging production UI issues.", 2, "ADVANCED", 12, [T.SCENARIO_BASED, T.DESIGN_BASED], ["Structured diagnosis of a realistic problem", "Weighs trade-offs"], 2.25),
  ],
};

const mern = {
  slug: "mern-stack-developer",
  title: "MERN Stack Full-Stack Developer Interview",
  category: "fullstack",
  description:
    "A full-stack technical interview designed to evaluate a candidate's ability to develop end-to-end web applications using MongoDB, Express.js, React.js and Node.js. The interview should assess frontend development, backend architecture, REST API design, database modeling, authentication, asynchronous programming, system integration, and practical full-stack problem-solving.",
  durationMinutes: 60,
  difficulty: "INTERMEDIATE",
  followUpLimit: 2,
  timing: { openingMinutes: 1, closingMinutes: 1, transitionSeconds: 10, approxAnswerSeconds: 90 },
  evaluationCriteria: ["Full-stack technical accuracy", "API and data-model design quality", "Security awareness", "Ability to reason about integration and scale"],
  aiInstructions: `${COMMON_AI_INSTRUCTIONS} Scenario and design questions describe a realistic full-stack situation and ask how the candidate would approach it end to end.`,
  topics: [
    topic("JavaScript Fundamentals", "javascript-fundamentals", "Closures, scope, this, prototypes, asynchronous JavaScript and ES6+ features used across the stack.", 2, "BEGINNER", 6, [T.CONCEPTUAL, T.OUTPUT_BASED], ["Core language accuracy"], 2.25),
    topic("React.js", "react-js", "Components, props, state, JSX, reconciliation, keys, forms, conditional rendering and component composition.", 2, "INTERMEDIATE", 7, [T.CONCEPTUAL, T.PRACTICAL], ["Builds correct, composable components"], 2.25),
    topic("React Hooks and State Management", "react-hooks-state", "useState, useEffect, useRef, useMemo, custom hooks, Context, Redux and server-state libraries.", 2, "INTERMEDIATE", 7, [T.CONCEPTUAL, T.PRACTICAL, T.OUTPUT_BASED], ["Uses hooks correctly", "Picks the right state strategy"], 2.25),
    topic("Node.js Architecture", "nodejs-architecture", "The event loop in Node, libuv, streams, buffers, clustering, worker threads, modules, error handling and non-blocking I/O.", 2, "INTERMEDIATE", 7, [T.CONCEPTUAL, T.PRACTICAL], ["Explains the Node event loop and non-blocking I/O"], 2.25),
    topic("Express.js and Middleware", "express-and-middleware", "Routing, the middleware chain, error-handling middleware, request validation, project structure and common middleware such as cors and helmet.", 2, "INTERMEDIATE", 7, [T.CONCEPTUAL, T.PRACTICAL], ["Understands the middleware pipeline"], 2.25),
    topic("REST API Design", "rest-api-design", "Resource modelling, HTTP methods and status codes, idempotency, pagination, filtering, versioning and API error formats.", 2, "INTERMEDIATE", 7, [T.CONCEPTUAL, T.DESIGN_BASED, T.PRACTICAL], ["Designs consistent REST APIs"], 2.25),
    topic("Authentication and Authorization", "authentication-authorization", "Sessions versus JWT, access and refresh tokens, password hashing, role-based access, OAuth basics and securing cookies.", 2, "INTERMEDIATE", 8, [T.CONCEPTUAL, T.DESIGN_BASED, T.SCENARIO_BASED], ["Designs secure authentication"], 2.25),
    topic("MongoDB and Mongoose", "mongodb-and-mongoose", "Documents and collections, schemas and validation, CRUD operations, population, indexes, middleware and lean queries.", 2, "INTERMEDIATE", 8, [T.CONCEPTUAL, T.PRACTICAL], ["Uses Mongoose effectively"], 2.25),
    topic("Database Modeling and Aggregation", "database-modeling-aggregation", "Embedding versus referencing, schema design for access patterns, the aggregation pipeline, indexing strategies and query optimization.", 2, "ADVANCED", 8, [T.DESIGN_BASED, T.PRACTICAL, T.SCENARIO_BASED], ["Models data for access patterns", "Writes sensible aggregations"], 2.25),
    topic("SQL vs NoSQL Databases", "sql-vs-nosql", "Trade-offs between relational and document databases, consistency, joins, scaling and choosing a database for a use case.", 1, "INTERMEDIATE", 4, [T.CONCEPTUAL, T.SCENARIO_BASED], ["Compares SQL and NoSQL with trade-offs"], 2.25),
    topic("Backend Error Handling and Security", "backend-error-handling-security", "Centralized error handling, validation, injection attacks, rate limiting, secrets management, CORS, helmet and logging.", 1, "INTERMEDIATE", 6, [T.CONCEPTUAL, T.SCENARIO_BASED], ["Identifies and mitigates common backend risks"], 2.25),
    topic("API Integration", "api-integration", "Calling APIs from React and Node, concurrent requests, retries and timeouts, error propagation, file uploads and debugging frontend-backend issues.", 1, "INTERMEDIATE", 5, [T.PRACTICAL, T.SCENARIO_BASED], ["Handles concurrency and failure in integrations"], 2.25),
    topic("WebSockets and Real-time Communication", "websockets-realtime", "WebSockets versus polling and server-sent events, Socket.IO, rooms, reconnection, scaling real-time servers and message ordering.", 1, "INTERMEDIATE", 6, [T.CONCEPTUAL, T.SCENARIO_BASED], ["Designs reliable real-time communication"], 2.25),
    topic("Full-stack Architecture and Scenario-based Questions", "fullstack-scenarios", "End-to-end scenarios: authentication design, concurrent requests, MongoDB schemas, slow queries, pagination, transactions, file uploads, real-time features and debugging integration issues.", 2, "ADVANCED", 14, [T.SCENARIO_BASED, T.DESIGN_BASED], ["Structured end-to-end reasoning", "Weighs trade-offs and failure modes"], 2.25),
  ],
};

const database = {
  slug: "database-sql-nosql",
  title: "Database Engineering — SQL and NoSQL Interview",
  category: "database",
  description:
    "A database-focused technical interview designed to evaluate candidates' understanding of relational and non-relational databases, SQL queries, database design, normalization, indexing, transactions, aggregation, performance optimization, and the trade-offs between SQL and NoSQL database systems.",
  durationMinutes: 45,
  difficulty: "INTERMEDIATE",
  followUpLimit: 2,
  timing: { openingMinutes: 1, closingMinutes: 1, transitionSeconds: 10, approxAnswerSeconds: 90 },
  evaluationCriteria: ["Correctness of SQL and data-model reasoning", "Understanding of performance and indexing", "Understanding of transactions and consistency", "Ability to justify design trade-offs"],
  aiInstructions: `${COMMON_AI_INSTRUCTIONS} Query-writing questions are answered verbally: ask the candidate to describe the query clause by clause.`,
  topics: [
    topic("DBMS Fundamentals", "dbms-fundamentals", "What a DBMS provides, keys, constraints, schemas, data independence, storage basics and the role of the query planner.", 1, "BEGINNER", 5, [T.CONCEPTUAL], ["Knows core DBMS concepts"], 2.25),
    topic("Relational Database Concepts", "relational-concepts", "Tables, primary and foreign keys, referential integrity, relationships, constraints, views and relational algebra basics.", 1, "BEGINNER", 5, [T.CONCEPTUAL, T.PRACTICAL], ["Models relationships and integrity correctly"], 2.25),
    topic("SQL Joins", "sql-joins", "Inner, left, right, full and cross joins, self joins, join conditions, duplicates from joins and anti-joins.", 2, "INTERMEDIATE", 8, [T.PRACTICAL, T.CODING, T.CONCEPTUAL], ["Chooses and writes the right join"], 2.25),
    topic("Subqueries and CTEs", "subqueries-and-ctes", "Correlated and uncorrelated subqueries, EXISTS versus IN, common table expressions and recursive CTEs.", 1, "INTERMEDIATE", 6, [T.PRACTICAL, T.CODING], ["Uses subqueries and CTEs appropriately"], 2.25),
    topic("Window Functions", "window-functions", "ROW_NUMBER, RANK, DENSE_RANK, LAG and LEAD, running totals, PARTITION BY and frame clauses.", 1, "ADVANCED", 6, [T.PRACTICAL, T.CODING], ["Applies window functions to ranking and running totals"], 2.25),
    topic("Aggregation and Grouping", "aggregation-and-grouping", "GROUP BY, HAVING versus WHERE, aggregate functions, NULL handling in aggregates and conditional aggregation.", 1, "INTERMEDIATE", 6, [T.PRACTICAL, T.CODING], ["Aggregates and filters groups correctly"], 2.25),
    topic("Database Normalization", "database-normalization", "First, second and third normal form, BCNF, functional dependencies, anomalies and when to denormalize.", 1, "INTERMEDIATE", 6, [T.CONCEPTUAL, T.DESIGN_BASED], ["Normalizes a design and justifies denormalization"], 2.25),
    topic("Indexing and Query Optimization", "indexing-and-optimization", "B-tree indexes, composite and covering indexes, selectivity, reading execution plans, index costs and fixing slow queries.", 2, "ADVANCED", 10, [T.CONCEPTUAL, T.PRACTICAL, T.SCENARIO_BASED], ["Chooses indexes from query patterns", "Reads execution plans"], 2.25),
    topic("ACID Properties and Transactions", "acid-and-transactions", "Atomicity, consistency, isolation, durability, isolation levels, locking, deadlocks and anomalies such as dirty and phantom reads.", 2, "ADVANCED", 10, [T.CONCEPTUAL, T.SCENARIO_BASED], ["Explains isolation levels and anomalies"], 2.25),
    topic("SQL vs NoSQL", "sql-vs-nosql", "Consistency models, the CAP theorem, schema flexibility, joins, scaling patterns and choosing between SQL and NoSQL.", 1, "INTERMEDIATE", 6, [T.CONCEPTUAL, T.SCENARIO_BASED], ["Compares systems with trade-offs"], 2.25),
    topic("MongoDB Architecture and Aggregation", "mongodb-architecture-aggregation", "Documents, replica sets, sharding, WiredTiger, the aggregation pipeline stages, lookups and index usage.", 1, "INTERMEDIATE", 8, [T.CONCEPTUAL, T.PRACTICAL], ["Understands MongoDB architecture and pipelines"], 2.25),
    topic("Data Modeling", "data-modeling", "Entity relationship modelling, one-to-many and many-to-many designs, embedding versus referencing, modelling for access patterns.", 1, "INTERMEDIATE", 8, [T.DESIGN_BASED, T.PRACTICAL], ["Models data for given requirements"], 2.25),
    topic("Database Scaling and Replication", "scaling-and-replication", "Vertical and horizontal scaling, replication modes, read replicas, partitioning and sharding, failover and consistency lag.", 1, "ADVANCED", 6, [T.CONCEPTUAL, T.SCENARIO_BASED], ["Reasons about scale and replication trade-offs"], 2.25),
    topic("Real-world Database Design Scenarios", "real-world-design-scenarios", "Practical scenarios: schema design, indexing, transactions and zero-downtime migrations for realistic products.", 2, "ADVANCED", 10, [T.SCENARIO_BASED, T.DESIGN_BASED], ["End-to-end design with trade-offs"], 2.25),
  ],
};

// Scenario-heavy topics need a larger bank: the interview lists many distinct situations to cover.
for (const [tpl, slug] of [[frontend, "scenario-problem-solving"], [mern, "fullstack-scenarios"]]) tpl.topics.find((t) => t.slug === slug).minBank = 10;

/** Order matters only for display. */
const TEMPLATE_DEFINITIONS = [javascript, frontend, mern, database];

module.exports = { TEMPLATE_DEFINITIONS };
