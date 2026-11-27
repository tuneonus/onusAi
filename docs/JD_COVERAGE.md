# OnusAI Technical Interview Coverage

Status: preparation plan, not a claim of implemented features or demonstrated proficiency. Phase 00 — Step 03, 27 November 2026.

## Classification rules

- **Planned practical implementation:** Use the selected technology or technique in an approved product step and record working evidence. The label does not mean implementation has begun.
- **Conceptual interview preparation:** Explain concepts, compare alternatives, and practice interview questions without adding a product dependency.
- **Optional future implementation:** Requires separate approval after the core product or prerequisite is verified. It is not a requirement for the interview MVP.

Git is the only selected engineering tool whose use is verified in this record: a README-only initial commit and push exist. No application phase, database/model integration, AI framework, container setup, CI workflow, or runtime evaluation is verified complete. A dashboard scaffold and dependencies appeared separately during this step; they remain unreviewed and do not establish product functionality or learner proficiency. No learning topic has yet been assessed as demonstrated.

## Coverage matrix

Phase/step references below point to [ROADMAP.md](ROADMAP.md). A product artifact plus its tests/measurements supports implementation evidence; an explanation or exercise supports learning evidence. They are recorded separately in [PROGRESS.md](PROGRESS.md).

| Topic | Classification | Planned evidence or preparation focus |
| --- | --- | --- |
| Python | Planned practical implementation | 02.01–02.03 and 03.01–03.02: typed API and tests; async I/O, collections, exceptions, generators |
| JavaScript | Planned practical implementation | 01.01 and 11.01: explain runtime behavior underneath TypeScript, promises, closures, and event loop |
| TypeScript | Planned practical implementation | 01.01–01.03 and 11.01: types, narrowing, contracts, and runtime validation differences |
| React.js | Planned practical implementation | 11.01–11.03 and 12.02: components, state, effects, forms, loading/errors |
| HTML | Planned practical implementation | 11.01 and 12.02: semantic forms, labels, focus, keyboard accessibility |
| CSS | Planned practical implementation | 11.01 and 12.02: responsive layout, cascade, specificity, and widget isolation |
| Node.js | Planned practical implementation | Phase 01: lifecycle, nonblocking I/O, service boundaries, graceful shutdown |
| FastAPI | Planned practical implementation | Phase 02 and 03.01–03.02: validated schemas, async boundary, HTTP errors, and OpenAPI |
| Django | Conceptual interview preparation | Compare batteries-included framework, ORM/admin, and request handling with FastAPI; no second Python API |
| .NET | Conceptual interview preparation | Compare ASP.NET Core, dependency injection, runtime, and API conventions with Express/FastAPI |
| OpenAI GPT | Conceptual interview preparation | Compare provider contracts, model selection, structured tools, evaluation, cost, and data policies with Gemini |
| Anthropic Claude | Conceptual interview preparation | Compare messages/tool-use patterns, model tradeoffs, and evaluation with Gemini; no second provider integration |
| Google Gemini | Planned practical implementation | 03.03–03.04 and 06.01: server-only generation/embedding calls, failure tests, usage measurements |
| LangChain | Planned practical implementation | 07.01: small integration layer evaluated against explicit RAG baseline |
| LangGraph | Planned practical implementation | Phase 08: state/edges, checkpoints, bounded execution, and approval resume |
| CrewAI | Conceptual interview preparation | Compare role-oriented multi-agent composition with a single explicit LangGraph workflow; no installation |
| AutoGen | Conceptual interview preparation | Compare agent collaboration patterns, control, and failure modes; no parallel orchestrator |
| Prompt Engineering | Planned practical implementation | 03.03, 06.03, 10.02: versioned prompts, evidence delimiters, structured outputs, and regression comparisons |
| LLM Integration | Planned practical implementation | Phase 03: timeouts, quotas, output validation, model configuration, and mocked/live checks |
| Function Calling | Planned practical implementation | 07.03–07.04: model proposes schema-bound functions; server validates and authorizes |
| Embeddings | Planned practical implementation | 06.01: model/dimension/preprocessing versions, deterministic indexing, and compatible query vectors |
| Semantic Search | Planned practical implementation | 06.02: scoped vector retrieval, labeled relevance examples, recall/latency discussion |
| RAG | Planned practical implementation | 06.03–06.04: evidence selection, citations, abstention, replacement/deletion tests |
| Pinecone | Conceptual interview preparation | Compare hosted vector-service operations and filtering with Qdrant; no second vector store |
| Qdrant | Planned practical implementation | Phase 06 and 09.02: filtered knowledge and semantic-cache vector collections |
| Weaviate | Conceptual interview preparation | Compare data modeling, vector/search capabilities, and deployment tradeoffs with Qdrant |
| Chroma | Conceptual interview preparation | Compare lightweight retrieval prototyping and operational requirements with Qdrant |
| PostgreSQL | Planned practical implementation | Phase 04 and 08.03: migrations, joins, constraints, tenant isolation, transactions, and booking race tests |
| MySQL | Conceptual interview preparation | Compare relational modeling, SQL, isolation, indexing, and operational tradeoffs; no duplicate business database |
| MongoDB | Conceptual interview preparation | Compare document modeling, consistency, indexing, and joins against business relational requirements |
| Redis | Planned practical implementation | 09.01–09.02: TTL, shared rate limiting, exact cache, invalidation, and failure policy |
| REST APIs | Planned practical implementation | Phases 01–04 and 09.04: resources, status codes, pagination, validation, auth, and idempotency |
| Webhooks | Planned practical implementation | 09.04: signed outbound delivery to a local mock, retry, replay, and duplicate handling |
| OAuth 2.0 | Conceptual interview preparation | Explain delegated authorization, scopes, authorization code with PKCE where appropriate, refresh/revocation, and OAuth versus authentication; real integration deferred to 15.03 |
| AWS | Conceptual interview preparation | Map services to compute, database, secrets, networking, and monitoring needs; compare one-target deployment choices in 13.04 |
| Azure | Conceptual interview preparation | Compare the same hosting, identity, network, and managed-data responsibilities without deploying a second cloud |
| Google Cloud | Conceptual interview preparation | Compare compute/data/secret/identity options and Gemini API versus cloud deployment choices; exact target deferred |
| Docker | Planned practical implementation | 13.02: images, containers, volumes, network boundaries, health checks, and reproducible startup |
| Kubernetes | Conceptual interview preparation | Explain pods, deployments, services, config/secrets, scaling, probes, and when operational cost is justified; not an MVP dependency |
| CI/CD | Planned practical implementation | 13.03–13.04: GitHub Actions validation/build artifacts and approved delivery/rollback gates |
| Git | Planned practical implementation | Initial README commit/push already verified; continue approved changes and explain index, branches, remotes, merge/rebase, and revert |
| LangSmith | Planned practical implementation | 10.01–10.02: redacted traces, datasets, experiments, and failure analysis |
| Agent Tracing | Planned practical implementation | 10.01: correlate graph, retrieval, model, tool, approval, and resume spans without exposing sensitive content |
| AI Evaluation | Planned practical implementation | 06.02 baseline and 10.02: relevance, groundedness, citations, abstention, action accuracy, and judge limitations |
| Cursor | Conceptual interview preparation | Discuss AI-assisted development, context management, reviewing generated changes, protecting secrets, and verifying claims; no required editor switch |
| MCP | Planned practical implementation | 09.03: one allowlisted client/server tool adapter with existing authorization policy |
| Tool Calling | Planned practical implementation | 07.03–07.04 and 09.03: schema validation, allowlists, scoped execution, limits, and tool-result handling |
| Multi-agent orchestration | Optional future implementation | 15.01: bounded two-role LangGraph experiment measured against one-agent quality, latency, cost, and failure rate |
| Agent memory — short-term | Planned practical implementation | 08.02: bounded conversation context and tenant-owned checkpoints with restart/deletion checks |
| Agent memory — long-term | Optional future implementation | 15.02: consented preferences with provenance, expiry, correction, and deletion; no indefinite hidden profiles |
| Agent reasoning | Planned practical implementation | 08.01: explain observable routing/decision summaries and their evidence; no claim to expose hidden model reasoning |
| Agent planning | Planned practical implementation | 08.01: bounded next-step selection, explicit state, stop conditions, and fallback |
| Agent decision-making | Planned practical implementation | 08.01–08.03: route by intent/evidence, choose allowed tools, and defer sensitive actions for approval |
| Human-in-the-loop approvals | Planned practical implementation | 08.03 and 11.03: exact-action approval, expiry, pause/resume, replay prevention, and human handoff |
| Guardrails | Planned practical implementation | Validation begins in Phases 01–04; retrieval/tool constraints in 06–08; adversarial consolidation in 10.03 |
| Hallucination handling | Planned practical implementation | 06.03 and 10.02: grounding, source checks, abstention, evaluation; RAG does not guarantee truth |
| AI security | Planned practical implementation | Signed delegation, scoped tools, injection cases, egress restrictions, quotas, and adversarial tests through 13.01 |
| Privacy | Planned practical implementation | Synthetic demos, consent, redacted traces, retention/deletion across stores, and provider processing review before release |
| Access control | Planned practical implementation | 04.02 onward: staff roles, visitor scope, tenant/resource ownership, and platform-admin separation |
| Event-driven workflows | Planned practical implementation | 05.02 and 09.04: durable job/delivery state transitions, at-least-once handling, retries, and idempotency without an extra broker |
| Asynchronous workflows | Planned practical implementation | 05.02 and 08.02–08.03: leased ingestion jobs, restart recovery, durable approval pause/resume, and cancellation boundaries |
| CRM integrations | Optional future implementation | 15.03: one scoped connector only after local mock webhook pattern is verified |
| ERP integrations | Optional future implementation | 14.04 or 15.03: define a narrow business operation, data contract, authorization, and reconciliation before implementation |
| SaaS integrations | Optional future implementation | 15.03: choose one provider, handle OAuth where applicable, signatures, revocation, retries, and confirmed external results |
| Fine-tuning | Optional future implementation | 15.04: first compare prompts/RAG with measured failure cases; dataset rights, privacy, overfitting, and cost must justify an experiment |
| Observability | Planned practical implementation | Request IDs/logs begin in 03.02; AI spans in 10.01; deployment health checks in 13.04 |
| Performance optimization | Planned practical implementation | 06.02, 09.01–09.02, 10.03: profile before optimizing; bounded context/concurrency and cache comparison |
| Latency optimization | Planned practical implementation | 03.04 and 10.03: median/p95 measurements by stage, deadlines, cache hit/miss impact, and optional streaming tradeoffs |
| Cost optimization | Planned practical implementation | 03.04 and 10.03: record available token usage, model/context/retrieval choices, quotas, and estimated cost with dated pricing inputs |
| Semantic caching | Planned practical implementation | 09.02: Qdrant candidate similarity plus Redis TTL values, scope/version checks, threshold evaluation, and dynamic-query bypass |
| Data structures and algorithms | Conceptual interview preparation | Practice arrays/maps/sets, queues, heaps, trees/graphs, traversal, sorting/search, and Big-O; relate graph routing and retrieval to real code without replacing production libraries |
| System design | Planned practical implementation | 00.03 proposal and subsequent measured revisions: boundaries, tenancy, consistency, async recovery, capacity, security, and failure handling |

## Preparation method and evidence

For each practical topic, be able to explain the concrete code path, the chosen boundary, one rejected alternative, a failure mode, and the test or measurement that supports the behavior. An implementation marked verified does not automatically mark the corresponding learning topic demonstrated.

For conceptual topics, prepare a short definition, a comparison with the selected stack, an appropriate use case, and an operational/security tradeoff. Do not claim hands-on experience with a technology merely because it appears in this matrix.

For optional topics, explain why they were deferred and what measured problem would justify them. A complete MVP does not require optional work.

Useful discussion exercises:

1. Trace a question from the browser through authorization, retrieval, generation, source validation, and persistence. Identify where forged tenant context is rejected.
2. Explain why Qdrant is not the authoritative booking database and why a Redis cache hit still needs current authorization.
3. Walk through a booking timeout, retry, and duplicate approval resume without double-booking.
4. Compare RAG with fine-tuning and describe how to detect an answer that cites an unrelated source.
5. Explain function calling versus MCP, and LangChain integrations versus LangGraph control flow.
6. Propose a semantic-cache threshold experiment and measure false reuse, latency, and token savings.
7. Compare a single graph with a multi-agent design using measured quality, failure rate, cost, and latency.
8. Practice a graph traversal, queue/backoff exercise, and indexed SQL query; discuss time/space complexity and when library behavior differs from a textbook model.
