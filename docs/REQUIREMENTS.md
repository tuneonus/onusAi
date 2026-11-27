# OnusSync Product Requirements

Status: planned requirements, not implemented capabilities. Phase 00 — Step 03, 27 November 2026.

## Purpose and scope

OnusSync is a standalone AI-Powered Multi-Tenant Business Engagement Platform for configurable business-specific assistants, customer engagement, lead generation, appointment booking, and intelligent automation. The immediate objective is a professional working product that supports practical AI Engineering learning and technical interviews.

The interview MVP is a deliberately small end-to-end product: two isolated demonstration businesses, business configuration, a document-grounded assistant, a playground and widget, persistent conversations, consent-based leads, and a controlled appointment workflow. It will demonstrate one LLM provider, one vector database, one business database, and one explicit agent workflow. It is not a promise of commercial readiness.

Commercial requirements below are a separate future scope. Inspiration from other products describes desired capabilities only; this document makes no claim about their internal technology stacks.

## Users and access

| Actor | Planned scope |
| --- | --- |
| Business owner | Own business settings, memberships, assistants, knowledge, conversations, leads, and appointments |
| Business operator | Assigned conversation, lead, appointment, and approval operations; cannot manage membership or expand permissions |
| Visitor | Public assistant conversation and only that visitor session's permitted actions; no business administration |
| Platform administrator | Future dedicated super-admin access; tenant membership does not grant platform privileges |

The MVP may use seeded development accounts before self-service registration is introduced. Any stage without real authentication remains local-only and must not accept real customer data. The MVP must include server-enforced membership and tenant isolation before public access.

## Functional requirements

Every MVP acceptance check below is a future verification obligation. None has passed as an application behavior yet.

| ID | Area | Interview MVP requirement and acceptance check | Future commercial requirements |
| --- | --- | --- | --- |
| FR-01 | Business onboarding and configuration | An owner can create or complete a business profile with name, contact details, timezone, and operating hours. Validate required fields; reject unauthorized updates; demonstrate persistence after restart. | Self-service invitations, onboarding wizard, billing, subscriptions, industry templates, and domain verification. |
| FR-02 | Multi-tenant architecture | A business is a tenant. Each protected read, write, retrieval, cache operation, and tool action is tenant-scoped. With two seeded tenants, prove that guessed identifiers and forged tenant context cannot cross the boundary. | Dedicated storage options, enterprise organization hierarchies, per-tenant quotas, and isolation tiers. |
| FR-03 | Business locations | Manage locations within a tenant, each with address, contact details, timezone, and hours. Select a location for assistant context and appointments; reject a location belonging to another tenant. A single-location UI is sufficient initially. | Location-specific staff permissions, holidays, capacity, service areas, and bulk location management. |
| FR-04 | AI assistant configuration | An owner can configure an assistant's display name, purpose, tone, allowed knowledge, location scope, model settings within server limits, fallback, and allowed tools. Version changes; reject unsafe settings and foreign knowledge references. | Multiple production assistants, localization, release channels, templates, experiments, and advanced customization. |
| FR-05 | Knowledge base and document management | Accept plain text and Markdown first, with size and encoding limits. Show upload, processing, ready, failed, and deleted states. Store document/chunk versions and source metadata; support retry, replacement, and deletion. Deleted or superseded material must not remain answerable. | PDF parsing, website crawling, connectors, OCR, richer formats, scheduled synchronization, and managed object storage. |
| FR-06 | AI chatbot playground | An authenticated operator can test the authorized assistant with visible citations, safe error states, and a resettable test conversation. Expose a request/trace reference to permitted users. Test mode cannot silently create live business actions. | Side-by-side prompt comparisons, draft/published configurations, shared test sessions, and experiment management. |
| FR-07 | Embeddable chat widget | A configured demo site embeds a chat UI with loading, error, retry, and accessible keyboard states. Resolve a public installation identifier server-side and issue a limited visitor session. Forged conversation IDs must not reveal other visitors' messages. | Verified domains, richer theming, localization, attachment support, streaming refinements, and installation management. |
| FR-08 | Customer conversations | Persist tenant-owned conversations and messages, distinguishing playground from visitor traffic. An authorized operator can review a paginated history. Retried submissions must not duplicate stored messages or action execution. | Advanced inbox assignment, search, exports, omnichannel history, retention policies, and contact identity merging. |
| FR-09 | Lead generation | Ask permission before capturing name, email or phone, and stated intent. Validate contact fields, store consent and conversation references, and prevent duplicate creation for the same idempotent submission. Show failure without claiming a lead was saved. | Custom lead fields, qualification scoring, routing, campaigns, CRM synchronization, and consent lifecycle management. |
| FR-10 | Appointment booking | Offer explicitly configured, fixed-duration slots per location/resource in its timezone. Collect required details and show a confirmation summary. A Node.js transaction enforces slot uniqueness; require authorized human approval before final booking. Simultaneous requests cannot both reserve the same slot. | External calendars, multiple services/resources, reminders, recurring bookings, payments, cancellations, and rescheduling policies. |
| FR-11 | Function calling | Gemini can propose allowlisted, schema-validated tools such as availability lookup and lead/booking requests. Node.js enforces permissions and owns business writes. Invalid names, extra arguments, foreign resources, timeouts, and retries are handled safely. | Tenant-managed integration catalogs and more complex permission scopes. No arbitrary code execution or SQL tools. |
| FR-12 | Agentic workflows | Use one bounded LangGraph workflow for intent routing, retrieval, tool proposal, approval pause, execution, and response. Enforce step, time, token, and tool-call limits. Demonstrate a deterministic fallback when a limit is reached. | Optional multi-agent orchestration only after a measured need; reusable workflow templates and advanced planning. |
| FR-13 | Human handoff and approvals | A visitor can request human help; the conversation becomes pending for an operator and AI replies pause. An operator can reply and explicitly resume AI. Approval records bind the exact tool arguments, tenant, action, expiry, and approver. Reject denied, expired, modified, unauthorized, or replayed approvals. No live-chat SLA is promised. | Live queues, assignment, staffing schedules, notifications, escalations, and delegated approval policies. |
| FR-14 | Analytics | Show tenant-scoped counts for visitor conversations, leads, bookings, and failures within a date range. Define each metric and exclude playground activity by default. Verify counts against a small known dataset. | Funnels, trends, attribution, cohorts, configurable reporting, and billing analytics. |
| FR-15 | AI monitoring and evaluation | Trace permitted/redacted model, retrieval, and tool operations with correlation IDs. Evaluate a versioned dataset for retrieval relevance, groundedness, citation validity, abstention, tenant leakage, tool accuracy, latency, and usage. Record failures and compare revisions. | Sampled online evaluation, alerting, customer reporting, model routing, and production quality/cost targets. |
| FR-16 | Security and access control | Authenticate staff, enforce owner/operator roles, isolate visitor sessions, validate inputs, protect secrets, limit traffic, sanitize displayed content, and audit sensitive actions. Test access denial, prompt injection, malicious uploads, and forbidden tool execution. | Enterprise SSO, fine-grained policy management, formal privacy/compliance reviews, regional controls, and customer-managed keys. |

## Data and lifecycle requirements

- PostgreSQL is authoritative for tenants, memberships, locations, assistant versions, document metadata and text/chunks, indexing jobs, conversations/messages, consented leads, appointment slots/bookings, approval records, audit events, and workflow state when persistence is introduced.
- Every tenant-owned relationship must preserve tenant identity, including relationships between assistants, documents, locations, conversations, and tool requests. Globally shared user identities must be accessed through validated memberships.
- Qdrant stores derived vectors and retrieval metadata; Redis stores disposable cached values and temporary counters. Neither is the source of truth for bookings, leads, permissions, or approvals.
- A document version becomes ready only after successful indexing. Replacement keeps a usable old version until the new one is ready, then switches active versions and invalidates related caches. Deleted sources are excluded immediately; derived cleanup may retry.
- Customer data collection is minimized. A business deletion or retention operation must cover PostgreSQL records, derived vectors, caches, workflow checkpoints, and applicable external traces. Retention periods and provider terms require a decision before using real customer data.
- MVP document storage uses bounded text persisted in PostgreSQL. Binary originals, object storage, OCR, and bulk ingestion are deferred.

## Nonfunctional requirements and release gates

| Area | Planned requirement / evidence |
| --- | --- |
| Correctness | Parameterized business queries, input/output schemas, transactional bookings, unique constraints, and idempotency for side effects; tests include races and retries. |
| Reliability | Explicit timeouts and bounded retries for safe operations; durable job state for asynchronous work; visible partial/failed states. A provider outage must not result in an invented answer or a falsely confirmed action. |
| Performance and cost | Limit request/upload size, context length, retrieval count, model output, concurrency, and tool steps. Measure median and p95 latency, error rates, token usage, and estimated cost on a declared dataset/load. Set numeric budgets from an approved baseline before release; no latency or cost promise exists yet. |
| Privacy | Keep credentials server-side; redact sensitive logs/traces; use synthetic data in demonstrations and evaluations. Decide retention, deletion, consent, and external-provider processing before public customer use. |
| Usability and accessibility | Responsive forms, semantic HTML, labels, keyboard navigation, useful validation messages, and explicit pending/failure states. Never show a successful booking before durable confirmation. |
| Maintainability | Separate business and AI modules, centralized branding, documented boundaries, versioned migrations/contracts, and proportionate tests. No duplicate framework/database for checklist coverage. |
| Deployment readiness | Public release requires authenticated boundaries, isolation/security tests, reproducible builds, health checks, protected configuration, deployment/rollback instructions, and tested backup restoration. Foundation documentation does not meet this gate. |

## MVP demonstration and scope control

The eventual demonstration should configure two businesses, ingest independent knowledge, answer supported questions with citations, abstain from unsupported questions, capture a consented lead, request and approve a booking, reject a concurrent booking conflict, and hand a conversation to an operator. It must also demonstrate cross-tenant rejection, an injected instruction being denied business privileges, a dependency timeout, and an evaluated trace.

The MVP excludes billing, broad CRM/ERP catalogs, external calendar writes, multiple equivalent AI frameworks, multiple vector databases, Kubernetes, fine-tuning, and autonomous multi-agent teams. A simple single-agent workflow comes first. External write integrations require a separate approved scope.

See [architecture](ARCHITECTURE.md), [technology choices](TECH_STACK.md), [implementation roadmap](ROADMAP.md), [interview coverage](JD_COVERAGE.md), and [progress](PROGRESS.md). Product implementation and learning completion must be verified separately.
