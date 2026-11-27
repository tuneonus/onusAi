# OnusAI Technology Decisions

Status: planned selections, not a dependency installation record. Phase 00 — Step 03, 27 November 2026. Git is initialized. This documentation step installs or initializes nothing. A dashboard scaffold and dependencies appeared separately during verification and remain unverified; their presence is not evidence of an approved, working application integration.

## Selection policy

Use the agreed stack to build one understandable product. Alternatives below support interview comparisons; they are not additional dependencies or commitments. Suitability statements are OnusAI design judgments, not claims that a technology is universally superior. Recheck official documentation, compatible versions, provider availability/terms, and costs at each approved implementation step. No package version or model ID is selected by this document.

## Languages and frontend

### JavaScript

- **What:** The language underlying browser behavior and the Node.js ecosystem. See the [JavaScript guide](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Introduction).
- **Why and where:** Required runtime knowledge for the five browser applications and the business backend, even though project source will generally use TypeScript.
- **Why suitable:** One runtime language spans browser interaction and business APIs, building on existing software development experience.
- **Alternatives:** Other languages compiled to browser code or a different server language; neither removes the need to understand browser JavaScript.
- **Interview concepts:** Event loop, promises, closures, scope, prototypes, errors, modules, concurrency versus parallelism, and memory behavior.

### TypeScript

- **What:** JavaScript with static type checking; see the [TypeScript handbook](https://www.typescriptlang.org/docs/handbook/typescript-in-5-minutes.html).
- **Why and where:** Typed component properties, business models, and API contracts across the React applications and Express service.
- **Why suitable:** Makes changes easier to review and catches many development-time mismatches. Runtime input validation is still required because external data does not become safe through a type annotation.
- **Alternatives:** JavaScript with JSDoc or another typed server language. Plain JavaScript offers fewer compile-time contract checks.
- **Interview concepts:** Structural typing, narrowing, discriminated unions, generics, null handling, type erasure, and compile-time versus runtime guarantees.

### HTML and CSS

- **What:** Browser structure/semantics and presentation, respectively; React components still produce browser markup and use styling.
- **Why and where:** Accessible forms, responsive dashboard pages, product pages, and a widget that behaves predictably inside a host website.
- **Why suitable:** Native browser capabilities are the baseline; no styling framework is necessary at foundation stage.
- **Alternatives:** Component/styling libraries and CSS-in-JS can change authoring, but do not replace semantic HTML or CSS knowledge.
- **Interview concepts:** Accessibility, forms, keyboard focus, semantic elements, cascade, specificity, layout, responsive design, and widget style isolation.

### React.js

- **What:** A component-based UI library with state and event handling; see [React Quick Start](https://react.dev/learn).
- **Why and where:** The planned website, dashboard, super-admin, chat widget, and demo website. Build the dashboard first; independent root directories do not require five applications to be scaffolded together.
- **Why suitable:** Reusable components support the administration and conversation interfaces without selecting a larger application framework prematurely.
- **Alternatives:** Vue, Angular, Svelte, or server-rendered pages. Revisit rendering needs for the public website when it is approved.
- **Interview concepts:** State ownership, effects, rendering, controlled inputs, component composition, accessibility, loading/error states, and performance profiling.

### Python

- **What:** A general-purpose language with a substantial standard library and AI ecosystem; see the [Python tutorial](https://docs.python.org/3/tutorial/).
- **Why and where:** AI backend, document processing, retrieval, evaluation, and model/tool orchestration.
- **Why suitable:** Aligns the learning objective with the planned Python AI frameworks while preserving a clear business-service boundary.
- **Alternatives:** JavaScript/TypeScript for AI services or other server languages. A single-language backend would be simpler operationally but would not exercise the agreed Python service design.
- **Interview concepts:** Type hints, collections, generators, context managers, exception handling, async I/O, packaging, mutability, and CPU-bound versus I/O-bound work.

## Backend and data

### Node.js

- **What:** A JavaScript runtime outside the browser; see the [Node.js introduction](https://nodejs.org/en/learn/getting-started/introduction-to-nodejs).
- **Why and where:** Runs the business API and integration operations in `backend/`.
- **Why suitable:** Fits the existing JavaScript/TypeScript skill set and I/O-heavy business API workload. CPU-heavy parsing and AI workflows stay out of its request path.
- **Alternatives:** Python, .NET, Java, or Go business services. Do not build duplicate business backends for comparison.
- **Interview concepts:** Event loop, nonblocking I/O, process lifecycle, streams, backpressure, timeouts, and graceful shutdown.

### Express

- **What:** A minimal Node.js web framework; see the [Express documentation](https://expressjs.com/).
- **Why and where:** REST routes, middleware, request validation boundaries, authentication/authorization integration, and consistent errors in the business backend.
- **Why suitable:** Makes HTTP behavior explicit with limited framework ceremony; modular routes and services are sufficient initially.
- **Alternatives:** Fastify, NestJS, or built-in Node.js HTTP. More structure or different performance tradeoffs can be discussed without adding another server framework.
- **Interview concepts:** Middleware ordering, request lifecycle, error propagation, REST semantics, authentication versus authorization, and input validation.

### FastAPI

- **What:** A Python API framework based on type hints, with validation and API-schema capabilities; see [FastAPI documentation](https://fastapi.tiangolo.com/).
- **Why and where:** Private HTTP endpoints for AI requests, ingestion operations, and service health in `ai-backend/`.
- **Why suitable:** Explicit schemas and async integration fit external LLM/vector calls. Async endpoints do not make blocking parsing or CPU work automatically concurrent.
- **Alternatives:** Flask, Django/Django REST Framework, or a single Node.js AI service. Django and .NET remain conceptual interview comparisons.
- **Interview concepts:** ASGI, schema validation, dependency injection, async versus sync execution, HTTP contracts, and generated OpenAPI.

### PostgreSQL

- **What:** A relational database with transactional operations and constraints. See [transactions](https://www.postgresql.org/docs/current/tutorial-transactions.html) and [row security](https://www.postgresql.org/docs/current/ddl-rowsecurity.html).
- **Why and where:** Authoritative tenants, memberships, configuration, documents/chunks, conversations, leads, booking slots, approvals, jobs, and audit records.
- **Why suitable:** Related business records and booking conflicts need consistent constraints and transactions. Python workflow checkpoints may use a separately permissioned schema, not write access to business tables.
- **Alternatives:** MySQL, MongoDB, or SQLite for smaller local use cases. No second business database is selected.
- **Interview concepts:** ACID, isolation levels, indexes, joins, query plans, migrations, unique/foreign-key constraints, tenant scope, and RLS bypass pitfalls.

### Qdrant

- **What:** A vector database with metadata filtering; see [filtering](https://qdrant.tech/documentation/search/filtering/) and [multitenancy](https://qdrant.tech/documentation/manage-data/multitenancy/).
- **Why and where:** Store generated embeddings and source references, retrieve semantically related authorized chunks, and later index semantic-cache candidates.
- **Why suitable:** Provides a focused vector-search component for learning RAG separately from the business database. Tenant, visibility, and version filters remain application obligations.
- **Alternatives:** Pinecone, Weaviate, Chroma, or PostgreSQL with pgvector. Do not deploy them in parallel to satisfy a checklist.
- **Interview concepts:** Vector dimensions, cosine/dot-product/distance comparisons, approximate nearest neighbors, recall/latency tradeoffs, filtering, indexing, and re-embedding migrations.

### Redis

- **What:** A data store commonly used for fast temporary values and shared counters; see [Redis data types](https://redis.io/docs/latest/develop/data-types/).
- **Why and where:** Business/API rate limits and exact response/configuration caches; later semantic-cache answer values in the AI service. Qdrant supplies similarity candidates for that proposed design.
- **Why suitable:** Keeps disposable caches separate from authoritative records and supports TTL-based lifetimes. It is not a substitute for booking transactions or a requirement to install another vector engine.
- **Alternatives:** Process-local caches for development, Memcached, or database-backed counters. Local counters do not provide shared enforcement across replicas.
- **Interview concepts:** TTL, eviction, cache-aside, invalidation, stampedes, atomic operations, rate-limit algorithms, semantic similarity thresholds, and cache isolation.

## AI and tools

### Google Gemini

- **What:** The selected hosted model API family for generation and embeddings; see [embeddings](https://ai.google.dev/gemini-api/docs/embeddings) and [function calling](https://ai.google.dev/gemini-api/docs/function-calling).
- **Why and where:** Python generates answers, creates text embeddings, and receives structured tool proposals through server-side calls.
- **Why suitable:** One provider supports the planned learning path. Generation and embedding models are separate choices; record their identifiers and compatibility metadata rather than treating all Gemini models as interchangeable.
- **Alternatives:** OpenAI GPT, Anthropic Claude, or local models. Provider comparison is conceptual; availability, data processing terms, quality, and cost must be assessed before selecting exact models.
- **Interview concepts:** Prompt hierarchy, context windows, structured output, tokens, sampling, function calling, quotas, latency/cost, model evaluation, and embedding compatibility. A proposed function call does not authorize execution.

### LangChain

- **What:** Python abstractions/integrations for models, prompts, tools, and agent composition; see [LangChain overview](https://docs.langchain.com/oss/python/langchain/overview).
- **Why and where:** Introduce selected primitives inside the AI backend after a direct Gemini/RAG implementation is understandable.
- **Why suitable:** Exercises a common AI integration framework while preserving visibility into retrieval and business boundaries. Retain only abstractions that reduce real repetition.
- **Alternatives:** Direct provider SDK calls, LlamaIndex, or custom small functions. CrewAI and AutoGen are conceptual comparisons, not additional runtime frameworks.
- **Interview concepts:** Composition, retrievers, model adapters, tool schemas, integration boundaries, framework tradeoffs, and testing around nondeterminism.

### LangGraph

- **What:** A stateful workflow/agent orchestration runtime using nodes and edges; see [LangGraph overview](https://docs.langchain.com/oss/python/langgraph/overview).
- **Why and where:** One explicit graph for routing, retrieval, tool proposals, approval pause/resume, and bounded recovery in Python.
- **Why suitable:** Gives visible control flow and persistent workflow state for human intervention. It does not require LangChain or multiple agents; those are separate design choices.
- **Alternatives:** A small hand-coded state machine, CrewAI, or AutoGen. Use one orchestrator; optional multi-agent learning should reuse LangGraph.
- **Interview concepts:** State machines, deterministic versus model-driven routing, checkpoints, idempotency, resumability, memory, bounded planning, and approval safety.

### Model Context Protocol (MCP)

- **What:** A protocol for AI applications to connect to tools/context through clients and servers; see [MCP architecture](https://modelcontextprotocol.io/docs/learn/architecture).
- **Why and where:** The Python AI backend acts as host/client for one approved server exposing existing business-tool operations through a thin adapter.
- **Why suitable:** Demonstrates interoperable tool discovery/calling without building a large integration catalog. Node.js still authorizes each business action.
- **Alternatives:** Direct REST tools or provider-specific tool adapters. MCP is not a replacement for REST, model function calling, or application authorization.
- **Interview concepts:** Host/client/server roles, transport boundaries, discovery, schemas, least privilege, untrusted tool output, scoped credentials, and prompt injection.

### LangSmith

- **What:** A platform for [LLM tracing](https://docs.langchain.com/langsmith/observability) and [evaluation](https://docs.langchain.com/langsmith/evaluation).
- **Why and where:** Correlate AI retrieval/model/tool/graph spans and compare versioned evaluation runs against a small dataset.
- **Why suitable:** Matches the planned frameworks while keeping quality evidence distinct from ordinary business logs. Trace export must be redacted and configured explicitly.
- **Alternatives:** Langfuse, OpenTelemetry-based instrumentation, or structured logs plus local evaluation reports. Do not add a second monitoring platform initially.
- **Interview concepts:** Trace/span correlation, offline versus online evaluation, datasets, groundedness, judge bias, privacy, sampling, latency, and token/cost estimation.

## Delivery and version control

### Git

- **What:** Distributed version control; see [Git documentation](https://git-scm.com/about).
- **Why and where:** Repository history, reviewable incremental changes, branches, and recovery.
- **Why suitable:** Already initialized with a README-only initial commit. New commits remain subject to the approved scope.
- **Alternatives:** Mercurial or centralized version control. No alternative VCS is needed.
- **Interview concepts:** Working tree/index/commit, branches, merge versus rebase, conflicts, remotes, revert, and secrets in history.

### Docker

- **What:** A platform for packaging and running applications in containers; see [Docker overview](https://docs.docker.com/get-started/docker-overview).
- **Why and where:** Later reproducible service images and a local multi-service environment in `infrastructure/`.
- **Why suitable:** Helps reproduce the Node/Python/data-service setup without adding cluster orchestration. Containerization follows working services; no Docker files are authorized in this documentation step.
- **Alternatives:** Native environments, Podman, or managed platform builds. Kubernetes is a separate orchestration topic, not an MVP dependency.
- **Interview concepts:** Image versus container, layers, build context, volumes, networking, least-privilege users, secrets, health checks, and containers versus VMs.

### GitHub Actions

- **What:** Repository-triggered CI/CD workflows; see [Understanding GitHub Actions](https://docs.github.com/en/actions/get-started/understand-github-actions).
- **Why and where:** Later automated type/lint checks, tests, builds, and an approved deployment workflow.
- **Why suitable:** The repository is already hosted on GitHub, so no additional CI service is necessary. Continuous delivery does not imply automatic production deployment without an approved policy.
- **Alternatives:** GitLab CI, Jenkins, CircleCI, or cloud build services.
- **Interview concepts:** Jobs/steps/runners, artifacts, caching, reproducibility, restricted workflow permissions, protected secrets, pull-request checks, rollback, and deployment gates.

## Deferred selections

The stack does not yet choose a frontend build tool, router, styling library, ORM/query builder, authentication library, migration tool, test runner, queue library, cloud provider, or object store. Select only what an approved feature requires, explain it, and verify it. REST/JSON, HTTPS, OAuth 2.0 concepts, RAG, guardrails, and evaluation methods are architectural techniques rather than additional framework installations.

See [architecture](ARCHITECTURE.md) for component boundaries, [roadmap](ROADMAP.md) for introduction order, and [interview coverage](JD_COVERAGE.md) for the distinction between implementation and conceptual study.
