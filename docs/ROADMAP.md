# OnusAI Incremental Implementation Roadmap

Status: proposed plan. Phase 00 — Step 03, 27 November 2026. The foundation and documentation are the verified scope; no application phase below is verified complete. A dashboard scaffold appeared separately during this step and is preserved without validation. Inspect and reconcile it at the relevant approved step rather than overwriting it or assuming Phase 05 is complete.

## Execution rules

Each numbered row is a separately approved step, not authorization to implement an entire phase. Read `AGENTS.md`, inspect current files, agree on the step's scope, explain commands/dependencies/files, implement only that scope, verify it, record evidence and learning separately, then stop. Later requirements may refine this plan with approval.

Dependencies refer to step IDs. Within each phase, steps run in listed order unless stated otherwise. A phase's first step depends on the prior phase's final step in addition to any explicit dependency. The core path is sequential to keep it understandable. Optional Phase 15 is not a prerequisite for the interview MVP.

Use mocked providers and synthetic data for deterministic tests. Unauthenticated early services stay on loopback; no public exposure or real customer data before access controls. Tests accompany behavior from the first service step; Phase 13 strengthens delivery checks rather than postponing testing until the end.

## Phase 00 — Foundation and design

| Step | Deliverable | Dependency | Verification / exit condition |
| --- | --- | --- | --- |
| 00.01 | Inspect workspace and create project instructions | None | Workspace/Git inspection and readable `AGENTS.md`; completed previously |
| 00.02 | Git, root directories, README, and ignore rules | 00.01 | Directory inventory, preserved instructions, and tested ignore behavior; completed previously |
| 00.03 | Requirements, architecture, stack, roadmap, interview matrix, and progress | 00.02 | Six readable, consistent documents; checks recorded before completion |

A separately approved README-only initial commit/push followed 00.02. It does not constitute implementation of a product feature. This step creates no commit.

## Phase 01 — Node.js business service foundation

| Step | Deliverable | Dependency | Verification / exit condition |
| --- | --- | --- | --- |
| 01.01 | Minimal Node.js, Express, and TypeScript setup with validated local configuration and a health route | 00.03 and explicit approval | Type check and health response; invalid configuration fails clearly |
| 01.02 | Small route/service structure, request validation, safe error responses, correlation IDs, and shutdown handling | 01.01 | Invalid input/error path and graceful shutdown checks; no stack traces or secrets in public errors |
| 01.03 | Select proportionate test tooling and establish API tests | 01.02 | Health, validation, and failure tests run reproducibly; document each introduced dependency |

## Phase 02 — Python AI service foundation

| Step | Deliverable | Dependency | Verification / exit condition |
| --- | --- | --- | --- |
| 02.01 | Minimal FastAPI setup with typed settings and health route | 01.03 | Service starts locally; invalid settings fail explicitly |
| 02.02 | Validated mock AI request/response contract and safe errors | 02.01 | Schema, request size, and error tests; no LLM call yet |
| 02.03 | Minimal Python test tooling and async boundary checks | 02.02 | Deterministic tests pass; blocking and async responsibilities explained |

## Phase 03 — Backend integration and Gemini

| Step | Deliverable | Dependency | Verification / exit condition |
| --- | --- | --- | --- |
| 03.01 | Private Node-to-FastAPI HTTP contract, scoped service authentication, deadlines, and correlation IDs | 02.03 | Cross-language fixture tests; forged delegation, expired token, schema drift, and timeout rejected |
| 03.02 | Direct Gemini generation adapter, prompt version, and output/usage validation | 03.01 | Mocked provider success, quota, timeout, and malformed output tests; bounded calls |
| 03.03 | Explicit synthetic-data live-model smoke test and small baseline | 03.02 plus configured server-only credentials | Record actual result, model identifier, latency, and available usage; label generated answers as ungrounded until RAG exists |

No general provider factory or second provider is required. This local integration does not authorize public chat.

## Phase 04 — PostgreSQL, tenancy, and business configuration

| Step | Deliverable | Dependency | Verification / exit condition |
| --- | --- | --- | --- |
| 04.01 | Select database/migration tooling; create tenant, user, and membership schema | 03.03 | Migrations and tenant-consistent constraints verified against PostgreSQL |
| 04.02 | Staff sessions, owner/operator permissions, and tenant-aware access layer | 04.01 | Two-tenant allow/deny tests, expired/revoked session, CSRF checks where applicable |
| 04.03 | Business profile and location CRUD, timezone/hours validation | 04.02 | FR-01/FR-03 positive and cross-tenant rejection checks |
| 04.04 | Versioned assistant configuration, tool scopes, knowledge visibility, and public branding configuration in `packages/` | 04.03 | FR-04 validation; assistant/location ownership and centralized brand usage verified |
| 04.05 | Persistent conversation/message records and basic retention/deletion contract | 04.04 | FR-08 tests for ownership, pagination, idempotency, and restart persistence |

Isolation is enforced from the first stored feature. Add/test row-level security before public release in 13.01; it supplements application checks.

## Phase 05 — React dashboard

| Step | Deliverable | Dependency | Verification / exit condition |
| --- | --- | --- | --- |
| 05.01 | Minimal React/TypeScript dashboard with shared branding, accessible shell, and approved build tooling | 04.05 | Build/type check and keyboard/navigation checks |
| 05.02 | Sign-in and business/location/assistant forms connected to Node.js | 05.01 | Authorized CRUD, validation, session expiry, loading, and failure states checked |
| 05.03 | Local staff-only playground using current AI endpoint and persisted test conversations | 05.02 | FR-06 tests; ungrounded mode labeled; no production tool side effects |

## Phase 06 — Documents, ingestion, and chunking

| Step | Deliverable | Dependency | Verification / exit condition |
| --- | --- | --- | --- |
| 06.01 | Text/Markdown upload metadata and bounded text storage with version/state transitions | 05.03 | FR-05 size/type/encoding/access tests; upload is not marked indexed prematurely |
| 06.02 | Durable PostgreSQL job records through Node.js; Python leases/processes jobs | 06.01 | Restart, lease expiry, duplicate delivery, retry, and failed-job recovery verified |
| 06.03 | Versioned normalization/chunking, source metadata, and dashboard processing status | 06.02 | Boundary/overlap tests and deterministic chunk IDs; same input/version reproduces expected chunks |

## Phase 07 — Embeddings, Qdrant, semantic search, and RAG

| Step | Deliverable | Dependency | Verification / exit condition |
| --- | --- | --- | --- |
| 07.01 | Select embedding model/dimensions and create versioned Qdrant indexing path | 06.03 | Vector compatibility, idempotent upserts, mandatory tenant/audience/version filters, and failed-index tests |
| 07.02 | Query embedding and scoped semantic search with candidate validation | 07.01 | Small labeled retrieval dataset; cross-tenant, inactive-version, and forbidden-visibility candidates excluded |
| 07.03 | Explicit RAG prompt, citations, output validation, and abstention | 07.02 | Supported/unsupported questions, valid citations, retrieved injection, and dependency-outage cases evaluated |
| 07.04 | Document replace/delete, source validation, cache invalidation contract, and cleanup retries | 07.03 | Superseded/deleted knowledge stops answering even during partial Qdrant cleanup |
| 07.05 | Update playground to show grounded answers, citations, and safe diagnostics | 07.04 | FR-05/FR-06 end-to-end checks; no unauthorized source text in browser |

Keep a small local evaluation dataset from 07.02 onward. Hosted evaluation tooling follows later; quality checking does not wait for it.

## Phase 08 — LangChain, deterministic business operations, and tool calling

| Step | Deliverable | Dependency | Verification / exit condition |
| --- | --- | --- | --- |
| 08.01 | Introduce only useful LangChain model/retrieval/tool primitives | 07.05 | Compare against direct RAG baseline; explain each retained abstraction |
| 08.02 | Node.js lead capture with consent, fixed appointment slots, and pending booking requests | 08.01 | FR-09 validation/idempotency tests; tenant/resource/slot constraints established; no unapproved final booking |
| 08.03 | Gemini function schemas and read-only availability tool | 08.02 | Unknown tool, malformed arguments, foreign resources, loop limits, and tool timeout tests |
| 08.04 | Tool proposals for consented lead capture and pending booking creation | 08.03 | FR-11: policy and schema validation; no booking execution before Phase 09 approval path |

Function calling proposes an operation; business execution remains deterministic Node.js code.

## Phase 09 — LangGraph, memory, and human-in-the-loop

| Step | Deliverable | Dependency | Verification / exit condition |
| --- | --- | --- | --- |
| 09.01 | One bounded intent/retrieve/tool-proposal graph with explicit state and decision summaries | 08.04 | FR-12 branch tests; max steps/time/tool calls and fallback verified |
| 09.02 | Tenant/conversation-scoped checkpoints and bounded short-term message memory | 09.01 | Restart/resume and ownership checks; context limits and deletion verified; no hidden reasoning persisted |
| 09.03 | Durable approvals, authorized resume, and transactional final booking | 09.02 | FR-10/FR-13 expiry, argument mutation, replay, duplicate resume, and concurrent-slot conflict tests |
| 09.04 | Operator approval/handoff UI, operator replies, and explicit return to AI | 09.03 | Pending/denied/confirmed states match database; AI remains paused during human ownership |

Long-term cross-session preferences and multi-agent teams remain optional. Planning/decision-making means observable bounded choices, not unbounded autonomous execution.

## Phase 10 — Redis, semantic caching, MCP, and asynchronous integrations

| Step | Deliverable | Dependency | Verification / exit condition |
| --- | --- | --- | --- |
| 10.01 | Shared Redis rate limits and scoped exact caching | 09.04 | Tenant isolation, TTL, invalidation, concurrency, outage behavior, and duplicate-work protection tested |
| 10.02 | Evaluate and add semantic caching for safe informational answers only | 10.01 | Qdrant candidates plus Redis values; threshold dataset, version/deletion invalidation, and personalized/tool-query bypass verified |
| 10.03 | One allowlisted MCP tool adapter around existing Node.js operations | 10.02 | FR-11 permission parity with direct tools, scoped delegation, malformed tool output, and server outage tests |
| 10.04 | Versioned REST integration contract and durable outbound webhook delivery to a local mock receiver | 10.03 | Signed payload, delivery ID, retry/backoff, replay/duplicate handling, and failed-delivery status verified |

Use existing PostgreSQL job state for asynchronous work until measured needs justify a queue dependency. A local mock demonstrates SaaS integration patterns; real CRM/ERP OAuth credentials and external writes are future commercial scope.

## Phase 11 — LangSmith, evaluation, guardrails, and analytics

| Step | Deliverable | Dependency | Verification / exit condition |
| --- | --- | --- | --- |
| 11.01 | Redacted LangSmith traces for model, retrieval, graph, tool, and approval-resume operations | 10.04 | FR-15 trace correlation, privacy review, and nonblocking telemetry failure tests |
| 11.02 | Versioned evaluation dataset, reproducible experiments, and regression report | 11.01 and 07.02 baseline | Groundedness, retrieval, citation validity, abstention, tool accuracy, tenant leakage, and cache false-hit checks; record evaluator limits |
| 11.03 | Strengthen guardrails from observed failures; measure latency/token/cost tradeoffs | 11.02 | Adversarial and timeout cases; agree numerical quality/performance budgets from baseline before release |
| 11.04 | Basic tenant analytics and evaluation summary in dashboard | 11.03 | FR-14 counts agree with fixture records; playground excluded by default; no private traces exposed |

Input limits, permission checks, groundedness checks, and approvals start in earlier phases. This phase consolidates evidence; it does not introduce safety for the first time.

## Phase 12 — Chat widget and demo website

| Step | Deliverable | Dependency | Verification / exit condition |
| --- | --- | --- | --- |
| 12.01 | Installation configuration and scoped visitor-session API | 11.04 | FR-07 copied ID, forged/expired token, conversation ownership, origin, quota, and public-knowledge checks |
| 12.02 | Minimal React widget with accessible chat, citations, consent, handoff, and booking status | 12.01 | Loading/retry/error, keyboard, host-style isolation, and safe rendering checks |
| 12.03 | Synthetic demo website embedding widget | 12.02 | Full two-tenant demo from requirements, including failure, approval, and isolation cases; local-only until release gate |

Streaming is optional after a reliable completed-response path; if approved, verify disconnects, partial answers, cancellation, and that actions cannot be confirmed from partial text.

## Phase 13 — Testing, Docker, CI/CD, and deployment

| Step | Deliverable | Dependency | Verification / exit condition |
| --- | --- | --- | --- |
| 13.01 | Consolidate API/contract/end-to-end tests, RLS defense in depth, privacy/retention decisions, and security checks | 12.03 | FR-16 release checks, cross-store deletion, secret checks, and adversarial isolation suite pass |
| 13.02 | Approved service Dockerfiles and local multi-service setup | 13.01 | Reproducible build/start, health checks, private data-service ports, non-root service users, and persistent-data behavior |
| 13.03 | GitHub Actions checks and reproducible build artifacts | 13.02 | Type/lint/tests/build pipeline verified with least-privilege permissions; no exposed credentials |
| 13.04 | Choose one deployment target and document staging, migrations, backups, rollback, and protected delivery | 13.03 | Restore/rollback drill, health checks, configuration/secret validation, and agreed budget measurements |
| 13.05 | Review MVP acceptance evidence and learning evidence independently | 13.04 | Requirements demo and evaluation report recorded; no unsupported production-readiness claims |

Publishing/deploying requires approval of the concrete result. Do not deploy merely because it appears on this roadmap. AWS, Azure, and Google Cloud are comparison topics until one target is selected; Kubernetes is not required.

## Phase 14 — Optional commercial applications

| Step | Deliverable | Dependency | Verification / exit condition |
| --- | --- | --- | --- |
| 14.01 | Public product website with approved content, responsive UI, and onboarding entry | 13.05 and commercial scope approval | Branding, accessibility, rendering/search needs, and claims reviewed against actual capabilities |
| 14.02 | Separate platform-admin permissions and audited operational APIs | 14.01 | Platform/staff boundary tests; support access explicitly scoped and logged |
| 14.03 | Minimal super-admin UI for approved operations | 14.02 | Privilege escalation and unintended transcript exposure checks |
| 14.04 | Select next commercial requirement from FR-01 through FR-16 | 14.03 | Separate acceptance scope for billing, connectors, calendars, enterprise controls, or other chosen feature |

## Phase 15 — Optional advanced learning experiments

These can be proposed independently after the interview MVP. Their order is not a production architecture commitment.

| Step | Deliverable | Dependency | Verification / exit condition |
| --- | --- | --- | --- |
| 15.01 | Compare one-agent workflow with a bounded two-role LangGraph workflow | 13.05 and explicit experiment approval | Measure quality, latency, token use, tool authority, and loop termination; retain only if useful |
| 15.02 | Consent-based, tenant-scoped long-term memory | 09.02, 13.05, and explicit scope approval | Provenance, correction, deletion, TTL, and no cross-tenant/session leakage |
| 15.03 | One real CRM/ERP/calendar integration using scoped OAuth 2.0 when appropriate | 10.04, 13.05, and provider-specific approval | Refresh/revocation, scopes, webhook signatures, idempotency, and external-write confirmation |
| 15.04 | Evaluate fine-tuning only for a measured problem not solved by prompts/RAG | 11.02 and explicit experiment approval | Data rights/privacy, baseline comparison, cost, and regression assessment before adoption |

CrewAI, AutoGen, alternative databases/providers, Django, .NET, and Kubernetes remain conceptual study topics rather than parallel implementations. Practice data structures and algorithms alongside each phase without expanding the product stack; see [JD coverage](JD_COVERAGE.md).

## Per-step evidence and learning

Record in [PROGRESS.md](PROGRESS.md): approved scope, changed files, commands/dependencies explained, checks executed and their results, known limitations, and the next proposed step. Track implementation as not started/in progress/verified separately from learning as not assessed/studied/demonstrated. Learning is demonstrated through explanation, a tradeoff discussion, and a small exercise or debugging walkthrough; generated documentation alone does not prove understanding.
