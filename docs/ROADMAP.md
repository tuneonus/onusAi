# OnusAI Incremental Implementation Roadmap

Status: reorganized backend-first, AI-first plan (27 November 2026). This plan preserves all existing requirements (`FR-01`–`FR-16`), verified foundations, architecture boundaries, technology stack, and pending features. Completed status is recorded only where verified in [PROGRESS.md](PROGRESS.md); incomplete work remains explicitly marked as pending. A separate `dashboard/` scaffold that appeared earlier remains unverified and is deferred to Phase 11 for inspection and reconciliation.

## Execution rules

Each numbered row is a separately approved step, not authorization to implement an entire phase. Read `AGENTS.md`, inspect current files, agree on the step's scope, explain commands/dependencies/files, implement only that scope, verify it, record evidence and learning separately, then stop. Later requirements may refine this plan with approval.

Dependencies refer to step IDs. Within each phase, steps run in listed order unless stated otherwise. Because backend persistence and tenancy (`Phase 04`) were implemented and verified before completing the remaining Phase 02/03 AI integration steps, the remaining roadmap follows a **backend-first, AI-first, dependency-based learning sequence**: internal service authentication, LLM integration, document ingestion, RAG, LangChain, LangGraph, Agentic AI, MCP, and observability/evaluation precede frontend applications (`Phase 11` and `Phase 12`). Optional Phases 14 and 15 are not prerequisites for the interview MVP.

Use mocked providers and synthetic data for deterministic tests. Keep unexposed internal services on loopback and enforce authentication/tenant checks at every boundary. Tests accompany behavior from the first service step; Phase 13 strengthens delivery checks rather than postponing testing until the end.

## Phase 00 — Foundation and design (Verified)

| Step | Deliverable | Dependency | Status & verification condition |
| --- | --- | --- | --- |
| 00.01 | Inspect workspace and create project instructions | None | **Verified** in [PROGRESS.md](PROGRESS.md) |
| 00.02 | Git, root directories, README, and ignore rules | 00.01 | **Verified** in [PROGRESS.md](PROGRESS.md) |
| 00.03 | Requirements, architecture, stack, roadmap, interview matrix, and progress | 00.02 | **Verified** in [PROGRESS.md](PROGRESS.md) |

## Phase 01 — Node.js business service foundation (Verified)

| Step | Deliverable | Dependency | Status & verification condition |
| --- | --- | --- | --- |
| 01.01 | Minimal Node.js, Express, and TypeScript setup with validated local configuration and a health route | 00.03 | **Verified** |
| 01.02 | Small route/service structure, request validation, safe error responses, correlation IDs, and shutdown handling | 01.01 | **Verified**: routing, validation, safe errors, shutdown, and `X-Request-Id` correlation IDs verified in `03.02` |
| 01.03 | Select proportionate test tooling and establish API tests | 01.02 | **Verified** using Node.js native test runner |

## Phase 02 — Python AI service foundation (Verified)

| Step | Deliverable | Dependency | Status & verification condition |
| --- | --- | --- | --- |
| 02.01 | Minimal FastAPI setup with typed settings and health route | 01.03 | **Verified** |
| 02.02 | Validated AI request/response contract and safe errors | 02.01 | **Verified** in `03.02` (`/api/v1/internal/respond`, `413`/`422`/`504` safe error guards, mock mode without LLM) |
| 02.03 | Minimal Python test tooling and async boundary checks | 02.02 | **Verified** in `03.02` (`unittest` suite, `run_cpu_bound` thread offloading, `run_with_deadline` cancellation) |

## Phase 04 — PostgreSQL, tenancy, and business configuration (Verified ahead of AI integration)

| Step | Deliverable | Dependency | Status & verification condition |
| --- | --- | --- | --- |
| 04.01 | PostgreSQL pool, migration runner (`schema_migrations`), and core tenant, user, membership, and location schema (`0001`–`0005`) | 01.03 | **Verified** against Docker PostgreSQL |
| 04.02 | Staff sessions, owner/operator permissions, CSRF protection, lockouts, and tenant-aware access layer (`0006`–`0008`) | 04.01 | **Verified** |
| 04.03 | Business profile and location CRUD, IANA timezone and opening-hours validation, and soft-archival (`0009`–`0010`) | 04.02 | **Verified** (`FR-01`, `FR-03`) |
| 04.04 | Versioned assistant configuration, tool scopes, knowledge visibility, and centralized branding in `packages/branding/` (`0011`–`0012`) | 04.03 | **Verified** (`FR-04`) |
| 04.05 | Persistent conversation/message records and retention/deletion contract (`0013`–`0015`) | 04.04 | **Verified** (`FR-08`); automated retention purge job, cross-store cleanup, RLS (`13.01`), and visitor sessions (`12.01`) remain deferred |

PostgreSQL isolation is enforced in application queries and composite foreign keys. Row-level security is added and verified before public release in `13.01`.

## Phase 03 — Internal service auth, AI contracts, and Google Gemini (Verified)

| Step | Deliverable | Dependency | Verification / exit condition |
| --- | --- | --- | --- |
| 03.01 | Secure internal service authentication between Node.js and FastAPI, validated auth configuration, short-lived scoped tokens with expiration, and safe error handling | 02.01 and explicit approval | **Verified** in [PROGRESS.md](PROGRESS.md) |
| 03.02 | Private Node-to-FastAPI AI request/response contract, request correlation IDs across both services (completing `01.02`), scoped delegation fields, deadlines, and FastAPI async-boundary checks (completing `02.02` and `02.03`) | 03.01 | **Verified** in [PROGRESS.md](PROGRESS.md) |
| 03.03 | Direct Google Gemini generation adapter, prompt versioning, output/usage validation, and Node.js backend AI turn orchestration connected to persisted conversations/assistants | 03.02 and 04.05 | **Verified** in [PROGRESS.md](PROGRESS.md) (mocked SDK tests; live-model smoke test verified in `03.04`) |
| 03.04 | Explicit synthetic-data live-model smoke test and small baseline | 03.03 plus configured server-only credentials | **Verified** in [PROGRESS.md](PROGRESS.md) (`gemini-3.5-flash-lite` 2-turn baseline, token usage, latency, and `grounded: false` recorded) |

No general provider factory or second provider is required. This backend-only integration does not authorize public widget chat.

## Phase 05 — Documents, ingestion, and chunking (Backend + AI Worker)

| Step | Deliverable | Dependency | Verification / exit condition |
| --- | --- | --- | --- |
| 05.01 | Text/Markdown upload metadata and bounded text storage with version/state transitions (`FR-05`) | 03.04 | Size/type/encoding/tenant-access tests; upload is not marked indexed prematurely |
| 05.02 | Durable PostgreSQL job records through Node.js; Python leases/processes jobs via authenticated internal callbacks | 05.01 | Restart, lease expiry, duplicate delivery, retry, and failed-job recovery verified |
| 05.03 | Versioned normalization/chunking, source metadata, and backend processing-status endpoints | 05.02 | Boundary/overlap tests and deterministic chunk IDs; same input/version reproduces expected chunks |

## Phase 06 — Embeddings, Qdrant, semantic search, and grounded RAG

| Step | Deliverable | Dependency | Verification / exit condition |
| --- | --- | --- | --- |
| 06.01 | Select embedding model/dimensions and create versioned Qdrant indexing path | 05.03 | Vector compatibility, idempotent upserts, mandatory tenant/audience/version filters, and failed-index tests |
| 06.02 | Query embedding and scoped semantic search with candidate validation | 06.01 | Small labeled retrieval dataset; cross-tenant, inactive-version, and forbidden-visibility candidates excluded |
| 06.03 | Explicit RAG prompt, citations, output validation, and abstention | 06.02 | Supported/unsupported questions, valid citations, retrieved injection, and dependency-outage cases evaluated |
| 06.04 | Document replace/delete, source validation, cache invalidation contract, and cleanup retries | 06.03 | Superseded/deleted knowledge stops answering even during partial Qdrant cleanup; no unauthorized source text returned |

Keep a small local evaluation dataset from `06.02` onward. Hosted evaluation tooling follows in Phase 10; quality checking does not wait for it.

## Phase 07 — LangChain, deterministic business operations, and tool calling

| Step | Deliverable | Dependency | Verification / exit condition |
| --- | --- | --- | --- |
| 07.01 | Introduce only useful LangChain model/retrieval/tool primitives inside `ai-backend/` | 06.04 | Compare against direct RAG baseline from `06.03`; explain each retained abstraction |
| 07.02 | Node.js lead capture with consent, fixed appointment slots, and pending booking requests (`FR-09`) | 07.01 | Validation/idempotency tests; tenant/resource/slot constraints established; no unapproved final booking |
| 07.03 | Gemini function schemas and read-only availability tool (`FR-11`) | 07.02 | Unknown tool, malformed arguments, foreign resources, loop limits, and tool timeout tests |
| 07.04 | Tool proposals for consented lead capture and pending booking creation | 07.03 | Policy and schema validation; no booking execution before Phase 08 approval path |

Function calling proposes an operation; business execution remains deterministic Node.js code.

## Phase 08 — LangGraph, memory, and human-in-the-loop approvals (Backend)

| Step | Deliverable | Dependency | Verification / exit condition |
| --- | --- | --- | --- |
| 08.01 | One bounded intent/retrieve/tool-proposal LangGraph workflow with explicit state and decision summaries (`FR-12`) | 07.04 | Branch tests; max steps/time/tool calls and deterministic fallback verified |
| 08.02 | Tenant/conversation-scoped checkpoints and bounded short-term message memory | 08.01 | Restart/resume and ownership checks; context limits and deletion verified; no hidden reasoning persisted |
| 08.03 | Durable approvals, authorized resume API, human handoff state transitions, operator reply API, explicit return-to-AI API, and transactional final booking (`FR-10`, `FR-13`) | 08.02 | Expiry, argument mutation, replay, duplicate resume, concurrent-slot conflict, and AI-paused-during-human-ownership tests |

Long-term cross-session preferences and multi-agent teams remain optional in Phase 15. Planning/decision-making means observable bounded choices, not unbounded autonomous execution.

## Phase 09 — Redis, semantic caching, MCP, and asynchronous integrations

| Step | Deliverable | Dependency | Verification / exit condition |
| --- | --- | --- | --- |
| 09.01 | Shared Redis rate limits and scoped exact caching | 08.03 | Tenant isolation, TTL, invalidation, concurrency, outage behavior, and duplicate-work protection tested |
| 09.02 | Evaluate and add semantic caching for safe informational answers only | 09.01 | Qdrant candidates plus Redis values; threshold dataset, version/deletion invalidation, and personalized/tool-query bypass verified |
| 09.03 | One allowlisted MCP server and client adapter around existing Node.js operations (`FR-11`) | 09.02 | Permission parity with direct tools, scoped delegation, malformed tool output, and server outage tests |
| 09.04 | Versioned REST integration contract and durable outbound webhook delivery to a local mock receiver | 09.03 | Signed payload, delivery ID, retry/backoff, replay/duplicate handling, and failed-delivery status verified |

Use existing PostgreSQL job state for asynchronous work until measured needs justify a queue dependency. A local mock demonstrates SaaS integration patterns; real CRM/ERP OAuth credentials and external writes are future commercial scope.

## Phase 10 — LangSmith, evaluation, guardrails, and backend analytics

| Step | Deliverable | Dependency | Verification / exit condition |
| --- | --- | --- | --- |
| 10.01 | Redacted LangSmith traces for model, retrieval, graph, tool, and approval-resume operations (`FR-15`) | 09.04 | Trace correlation, privacy review, and nonblocking telemetry failure tests |
| 10.02 | Versioned evaluation dataset, reproducible experiments, and regression report | 10.01 and 06.02 baseline | Groundedness, retrieval, citation validity, abstention, tool accuracy, tenant leakage, and cache false-hit checks; record evaluator limits |
| 10.03 | Strengthen guardrails from observed failures; measure latency/token/cost tradeoffs | 10.02 | Adversarial and timeout cases; agree numerical quality/performance budgets from baseline before release |
| 10.04 | Tenant-scoped analytics backend API (`FR-14`) | 10.03 | Counts for visitor conversations, leads, bookings, and failures agree with fixture records; playground excluded by default; no private traces exposed |

Input limits, permission checks, groundedness checks, and approvals start in earlier phases. This phase consolidates evidence; it does not introduce safety for the first time.

## Phase 11 — React dashboard and staff interfaces (Frontend)

| Step | Deliverable | Dependency | Verification / exit condition |
| --- | --- | --- | --- |
| 11.01 | Inspect and reconcile existing `dashboard/` scaffold with shared `packages/branding/`, accessible shell, and approved build tooling | 10.04 | Build/type check and keyboard/navigation checks |
| 11.02 | Sign-in, business/location/assistant forms, and document upload/processing-status management connected to Node.js | 11.01 | Authorized CRUD, validation, session expiry, upload status, loading, and failure states checked |
| 11.03 | Grounded staff-only playground (`FR-06`), operator approval/handoff UI, and tenant analytics summary UI | 11.02 | Citations, trace references, pending/denied/confirmed states, AI pause during human handoff, and no unauthorized source text in browser |

## Phase 12 — Chat widget and synthetic demo website (Frontend)

| Step | Deliverable | Dependency | Verification / exit condition |
| --- | --- | --- | --- |
| 12.01 | Installation configuration and scoped visitor-session API (`FR-07`) | 11.03 | Copied ID, forged/expired token, conversation ownership, origin, quota, and public-knowledge checks |
| 12.02 | Minimal React widget (`chat-widget/`) with accessible chat, citations, consent, handoff, and booking status | 12.01 | Loading/retry/error, keyboard, host-style isolation, and safe rendering checks |
| 12.03 | Synthetic demo website (`demo-website/`) embedding widget | 12.02 | Full two-tenant demo from requirements, including failure, approval, and isolation cases; local-only until release gate |

Streaming is optional after a reliable completed-response path; if approved, verify disconnects, partial answers, cancellation, and that actions cannot be confirmed from partial text.

## Phase 13 — Testing, Docker, CI/CD, and deployment

| Step | Deliverable | Dependency | Verification / exit condition |
| --- | --- | --- | --- |
| 13.01 | Consolidate API/contract/end-to-end tests, PostgreSQL RLS defense in depth, automated retention/cross-store deletion, and security checks (`FR-16`) | 12.03 | Release checks, cross-store deletion, secret checks, and adversarial isolation suite pass |
| 13.02 | Approved service Dockerfiles and local multi-service setup | 13.01 | Reproducible build/start, health checks, private data-service ports, non-root service users, and persistent-data behavior |
| 13.03 | GitHub Actions checks and reproducible build artifacts | 13.02 | Type/lint/tests/build pipeline verified with least-privilege permissions; no exposed credentials |
| 13.04 | Choose one deployment target and document staging, migrations, backups, rollback, and protected delivery | 13.03 | Restore/rollback drill, health checks, configuration/secret validation, and agreed budget measurements |
| 13.05 | Review MVP acceptance evidence and learning evidence independently | 13.04 | Requirements demo and evaluation report recorded; no unsupported production-readiness claims |

Publishing/deploying requires approval of the concrete result. Do not deploy merely because it appears on this roadmap. AWS, Azure, and Google Cloud are comparison topics until one target is selected; Kubernetes is not required.

## Phase 14 — Optional commercial applications

| Step | Deliverable | Dependency | Verification / exit condition |
| --- | --- | --- | --- |
| 14.01 | Public product website (`website/`) with approved content, responsive UI, and onboarding entry | 13.05 and commercial scope approval | Branding, accessibility, rendering/search needs, and claims reviewed against actual capabilities |
| 14.02 | Separate platform-admin permissions and audited operational APIs | 14.01 | Platform/staff boundary tests; support access explicitly scoped and logged |
| 14.03 | Minimal super-admin UI (`super-admin/`) for approved operations | 14.02 | Privilege escalation and unintended transcript exposure checks |
| 14.04 | Select next commercial requirement from FR-01 through FR-16 | 14.03 | Separate acceptance scope for billing, connectors, calendars, enterprise controls, or other chosen feature |

## Phase 15 — Optional advanced learning experiments

These can be proposed independently after the interview MVP. Their order is not a production architecture commitment.

| Step | Deliverable | Dependency | Verification / exit condition |
| --- | --- | --- | --- |
| 15.01 | Compare one-agent workflow with a bounded two-role LangGraph workflow | 13.05 and explicit experiment approval | Measure quality, latency, token use, tool authority, and loop termination; retain only if useful |
| 15.02 | Consent-based, tenant-scoped long-term memory | 08.02, 13.05, and explicit scope approval | Provenance, correction, deletion, TTL, and no cross-tenant/session leakage |
| 15.03 | One real CRM/ERP/calendar integration using scoped OAuth 2.0 when appropriate | 09.04, 13.05, and provider-specific approval | Refresh/revocation, scopes, webhook signatures, idempotency, and external-write confirmation |
| 15.04 | Evaluate fine-tuning only for a measured problem not solved by prompts/RAG | 10.02 and explicit experiment approval | Data rights/privacy, baseline comparison, cost, and regression assessment before adoption |

CrewAI, AutoGen, alternative databases/providers, Django, .NET, and Kubernetes remain conceptual study topics rather than parallel implementations. Practice data structures and algorithms alongside each phase without expanding the product stack; see [JD coverage](JD_COVERAGE.md).

## Per-step evidence and learning

Record in [PROGRESS.md](PROGRESS.md): approved scope, changed files, commands/dependencies explained, checks executed and their results, known limitations, and the next proposed step. Track implementation as not started/in progress/verified separately from learning as not assessed/studied/demonstrated. Learning is demonstrated through explanation, a tradeoff discussion, and a small exercise or debugging walkthrough; generated documentation alone does not prove understanding.
