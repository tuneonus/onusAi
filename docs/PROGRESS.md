# OnusSync Progress Record

Last updated: 27 November 2026 (Asia/Kolkata). This record separates repository work, verification, and learning. Planned architecture does not imply implemented functionality.

## Phase 00 status

| Step | Scope | Completion | Verification evidence | Learning status |
| --- | --- | --- | --- | --- |
| 00.01 | Workspace inspection and project instructions | Completed | Original workspace was empty and Git was not initialized; only `AGENTS.md` was created and read back. Its original SHA-256 remains the preservation baseline. | Not assessed; written explanation provided, no learner demonstration recorded |
| 00.02 | Project foundation | Completed | Git initialized on `main`; ten empty directories, README, and `.gitignore` created. Original checks verified 37 ignored paths and 11 trackable paths, including nested `.env.example`; `AGENTS.md` hash was unchanged. | Not assessed; explanations provided, no learner demonstration recorded |
| 00.03 | Product requirements and system architecture | Completed | Six documents verified for scope, content coverage, local links, Markdown/diagram source structure, and preservation of original root files/Git HEAD; see results below. | Not assessed; documentation is preparation material, not proof of understanding |

## Existing repository evidence

- A separately authorized README-only commit, `762fcc8` (`first commit`), was created and pushed after 00.02. Local and remote `main` matched at that verification. This documentation step creates no new commit and performs no push.
- At the start of 00.03, `.gitignore` and `AGENTS.md` were untracked. Empty directories exist locally but cannot be stored in Git without files. No placeholders were added.
- During verification, a React/TypeScript/Vite dashboard scaffold, package manifests, source/assets, and `dashboard/node_modules/` appeared after the initial file snapshot. This work was not created by the documentation commands, has not been reviewed or tested, and was left untouched. Its provenance and completion are not inferred. Other application/service directories remain empty at the documentation check.
- `README.md` is an earlier snapshot: its status still says no commit exists, although the separately authorized initial commit now exists, and the requested `# onusAi` line was appended. It remains unchanged during 00.03 because this step authorizes only the six documentation files.

## Implementation status

| Area | Status |
| --- | --- |
| Repository foundation | Verified locally in 00.01/00.02; initial README-only push verified separately |
| Requirements and design | Documentation verified in 00.03; foundations and health communication verified below, business/AI product features remain planned |
| Applications | Dashboard scaffold/dependencies observed during verification, outside this step's changes; not reviewed or verified. Other frontend directories remain empty. |
| Node.js business service | Foundation, native-fetch AI health client, PostgreSQL connection pool/readiness, staff authentication/sessions/CSRF, tenant-aware owner/operator authorization, business profile & location CRUD (`04.03`), versioned assistant configuration/tool scopes/knowledge visibility/centralized branding (`04.04`), and persistent conversation/message records & retention/deletion contract (`04.05`) verified. No public registration, OAuth, visitor widget sessions, or AI workflows yet. |
| FastAPI service | Foundation, internal service authentication (`03.01`), private AI respond contract (`02.02` / `03.02`), `X-Request-Id` correlation middleware, delegation binding, request body limits (`413`), deadline enforcement (`504`), async-boundary helpers (`02.03` / `03.02`), and direct async Google Gemini integration (`03.03`) with `google-genai==3.6.1`, prompt versioning (`respond-v1`), usage capture, safety abstention, and explicit `mock` mode verified. |
| PostgreSQL | Node.js pool/readiness, SQL migration runner (`backend/src/integrations/database/migrations.ts`, `backend/src/migrate.ts`), `schema_migrations`, core/extended tenant schema (`users`, `businesses`, `business_members`, `business_locations`), auth schema (`user_credentials`, `staff_sessions`, `auth_login_attempts`), assistant schema (`assistants`, `assistant_versions`, `assistant_version_knowledge_locations`), and conversation schema (`conversations`, `conversation_messages`) verified against the running Docker database on host port 5433 (migrations `0001`–`0015`). No ORM or row-level security yet. |
| Qdrant, Redis | Docker readiness previously reported by the user; no application integration added or readiness checks repeated in this step |
| Node.js-to-FastAPI communication | Authenticated service-to-service communication (`03.01`), `X-Request-Id` correlation propagation (`01.02`), scoped JWT delegation binding, request deadlines, timeout/rate-limit handling, strict `respond-v1` contract (`02.02` / `03.02`), and Node.js playground turn orchestration (`03.03`) verified end-to-end. |
| Gemini, LangChain, LangGraph, MCP, LangSmith | Direct async `google-genai` SDK integration (`03.03`) and live synthetic `gemini-3.5-flash-lite` end-to-end baseline (`03.04`) verified (`grounded: false` until RAG exists); LangChain, LangGraph, MCP, and LangSmith remain unimplemented |
| Business/AI features | Phase `04` (`04.01`–`04.05`) and Phase `03` (`03.01`–`03.04`) verified; no visitor widget sessions, knowledge ingestion, RAG, leads, bookings, approvals, or analytics yet |
| Centralized branding configuration | Public platform branding centralized in `packages/branding/` (`branding.json`, `index.js`, `index.d.ts`), consumed by `backend/src/config/branding.ts`, and exposed via `GET /api/v1/branding`; AI service title remains explicit in `Settings.app_name` |
| Tests | Step `03.04` live synthetic baseline (`gemini-3.5-flash-lite` over Node.js → FastAPI → Gemini → PostgreSQL) passed after Step `03.03`'s **42** FastAPI tests and **128** Node.js + live PostgreSQL tests. |
| Dependencies | FastAPI virtual environment has `google-genai==3.6.1` installed and pinned in `ai-backend/requirements.txt`; no npm dependencies changed. |
| Docker, CI/CD, deployment | Existing `compose.yaml` and running data-service containers preserved; application containerization, CI/CD, and public deployment not implemented in this step |
| Dependencies | PostgreSQL step installed `pg` and development-only `@types/pg` after explicit user approval; backend manifest/lockfile updated. Other existing dependencies preserved. Dashboard dependencies remain unverified. |

## Step 00.03 deliverables

| File | Purpose |
| --- | --- |
| [REQUIREMENTS.md](REQUIREMENTS.md) | FR-01–FR-16 with interview MVP checks, future commercial scope, actors, lifecycle, and release gates |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Five frontend roles, separate services, data ownership, scoped request flows, Mermaid diagrams, failures, and security boundaries |
| [TECH_STACK.md](TECH_STACK.md) | Selected technologies, what/why/where, alternatives, suitability, interview concepts, and official references |
| [ROADMAP.md](ROADMAP.md) | Dependency-aware, individually approved implementation steps, verification gates, and optional extensions |
| [JD_COVERAGE.md](JD_COVERAGE.md) | Every requested interview topic classified as practical, conceptual, or optional, with evidence plans |
| [PROGRESS.md](PROGRESS.md) | Repository facts, implementation/verification/learning status, and next proposed work |

## Step 00.03 verification status

Documentation verification passed on 27 November 2026. Read-only Python standard-library checks, SHA-256 comparisons, and Git inspection were used; no validation dependency was installed or verification file added.

- Exactly the six requested files exist in `docs/`; no additional documentation folders or placeholders were created.
- `AGENTS.md`, root `README.md`, and root `.gitignore` match their pre-step SHA-256 hashes.
- All six documents are readable UTF-8 with final newlines, no trailing whitespace, consistent table widths, and balanced code fences. New documents contain only the approved product branding.
- All 21 local documentation links resolve. Official technology references were consulted for the rationale; source links are included near the relevant explanations.
- FR-01 through FR-16 are present, separating interview MVP checks from future commercial scope.
- All 60 roadmap step IDs are unique; all referenced step IDs resolve. Dependencies and approval gates were reviewed for the intended incremental sequence.
- All 72 interview topic rows have one of the three required classifications and an evidence/preparation plan.
- All 19 technology entries cover definition, purpose/location, suitability, alternatives, and interview concepts. Architecture and roadmap subject checks passed.
- One architecture diagram and two sequence diagrams were manually reviewed and checked for balanced Mermaid control blocks. They were not rendered; renderer compatibility remains unverified.
- Git HEAD remains `762fcc801e29e62656a32467c15a19741429fad1`; no staged changes, tracked-file modifications, new commit, or push were introduced by this step.

Scope exception: the initial whole-workspace check failed because dashboard files/dependencies appeared outside this step's changes. They were preserved and excluded from documentation validation. This step cannot claim to be the only source of new files across the entire shared workspace; its own writes are limited to the six requested documents. Final Git inspection includes the untracked dashboard work along with the documentation and previously untracked root instructions/ignore file.

The 00.03 results above are documentation checks only. They do not establish tenant isolation, grounded model output, diagram-renderer compatibility, or learner understanding. Backend runtime verification performed subsequently is recorded separately below.

## Backend foundation — verified approved scope

The user authorized the complete basic backend foundation after manually installing Express, TypeScript, dotenv, cors, tsx, and the relevant type packages. This task spans the applicable portions of roadmap steps 01.01–01.03; it does not authorize further features. Existing empty `src/app.ts`, `src/server.ts`, and requested support directories were inspected before implementation.

### Implemented files and responsibilities

| File under `backend/` | Responsibility |
| --- | --- |
| `package.json` | Node ESM package configuration and `dev`, `build`, `start`, `typecheck`, and dependency-free `test` scripts; installed dependency ranges preserved |
| `tsconfig.json` | Matching NodeNext module/resolution settings, ES2022 output, strict checks, Node types, and `src/` to `dist/` compilation; no frontend JSX or declaration boilerplate |
| `.env.example` | Safe PORT/NODE_ENV/CORS_ORIGIN examples; remains trackable under the root ignore rules |
| `src/config/env.ts` | Load backend-local `.env`, preserve existing process-variable precedence, validate settings, and expose typed configuration; pure validation function supports tests |
| `src/config/branding.ts` | Single backend product-name definition used by the health response and startup log |
| `src/app.ts` | Configure Express, disable its identifying header, apply CORS and bounded JSON parsing, and mount API/404/error middleware in order; importing it does not open a port |
| `src/server.ts` | Own HTTP server startup, safe startup errors, local binding, and bounded idempotent SIGINT/SIGTERM shutdown |
| `src/routes/index.ts` | Mount feature routers under the central `/api/v1` API prefix configured by the app |
| `src/modules/health/health.routes.ts` | Real health feature: GET `/api/v1/health` returns status, centralized product name, and ISO timestamp |
| `src/middlewares/not-found.ts` | Forward unmatched routes as a controlled 404 error |
| `src/middlewares/error-handler.ts` | Consistent JSON errors, safe parser-error mapping, headers-sent delegation, and generic unexpected-error responses without exposing arbitrary messages/body data |
| `src/utils/http-error.ts` | Small shared error class for intentionally public status/code/message values |
| `src/types/api.ts` | Shared TypeScript contract for JSON error responses |
| `tests/app.test.mjs` | HTTP health, routing, CORS/preflight, body-size/parser errors, and sync/async error handling regression checks |
| `tests/env.test.mjs` | Defaults, valid configurations, invalid ports/modes/origins, and safe example configuration; validation checks are independent of a developer's local `.env` |
| `tests/server.test.mjs` | Actual production-entrypoint startup, signals, in-flight draining, stuck-request deadline, occupied ports, and invalid startup configuration |

`src/modules/` contains only the working health feature. `src/integrations/` remains empty as requested; no placeholder business modules, controllers, services, or repositories were generated. The other requested support directories contain only the files needed above.

### Configuration and request lifecycle

- Defaults are PORT `3000`, NODE_ENV `development`, and CORS_ORIGIN `http://localhost:5173`. A `.env` file is optional; none was created. Existing process variables override file values. Missing files are allowed; other environment-file read failures stop startup.
- PORT must be a decimal integer from 1 through 65535. NODE_ENV accepts development/test/production. CORS_ORIGIN accepts comma-separated HTTP(S) origins, normalizing a trailing slash and rejecting wildcards, credentials, paths, queries, fragments, and empty entries. NODE_ENV must be set to production in the runtime environment when appropriate; the start script does not override deployment configuration.
- The package uses `type: module`, TypeScript NodeNext settings, type-only imports where applicable, and `.js` relative import specifiers so the emitted code runs directly in Node without a bundler or development loader.
- Startup loads validated settings before listening. The unauthenticated server binds only to `127.0.0.1`; public/container binding requires a future approved configuration change.
- Request flow: CORS origin check → JSON parser (100 KB limit) → `/api/v1` router → health feature → response. Unknown routes reach 404 middleware; thrown/rejected/parser errors reach the global error handler. Non-browser clients may omit Origin. CORS is not authentication, and credentials/cookie sessions are not configured.
- Health is process liveness only; it does not claim database, AI, or dependency readiness. Responses use `status`, `service`, and `timestamp`. Errors use `error.code` and `error.message`.
- On SIGINT/SIGTERM, stop accepting connections and drain active requests. Repeated signals are ignored during shutdown. A ten-second deadline force-closes remaining connections with exit code 1; a completed drain exits naturally with code 0. There are no database/cache clients to clean up yet.

Implementation references checked: [TypeScript module settings](https://www.typescriptlang.org/tsconfig/module.html), [Express errors](https://expressjs.com/en/guide/error-handling/), [CORS behavior](https://expressjs.com/en/resources/middleware/cors/), and [Node HTTP server lifecycle](https://nodejs.org/api/http.html#serverclosecallback). Installed package types/source were also inspected to confirm compatibility.

### Commands and verification results

All application commands ran from `backend/`; no installation command was executed.

| Command/check | Purpose and verified result |
| --- | --- |
| `cat`, `rg`, `ls`, `npm ls --depth=0`, Node/npm version checks | Inspect project rules/docs, existing files, installed packages, and runtime before changes |
| `npm run typecheck` | TypeScript compilation check without emitting JavaScript; passed |
| `npm run build` | Compile strict TypeScript to production JavaScript in `dist/`; passed |
| `npm test` | Rebuild and execute Node's native test runner; final result 18 passed, 0 failed/cancelled/skipped |
| `npm run start` | Launch compiled production entrypoint; real HTTP health request returned 200 with expected JSON, then process group shut down and released its port |
| `npm run dev` | Launch the tsx watch development entrypoint; same successful HTTP smoke test and process/port cleanup |
| HTTP failure/security cases | Verified JSON 404, allowlisted and denied origins, preflight, valid/malformed JSON, 100 KB limit, unsupported charset, and sanitized sync/async errors |
| Lifecycle failure cases | Verified invalid configuration and occupied-port nonzero exits; both signals, in-flight completion, repeated signals, and forced shutdown deadline |
| Hash, scope, and Git checks | Preserve dashboard, instructions, root files, other design documents, and backend lockfile; confirm dependency ranges unchanged, generated output ignored, and `.env.example` trackable; no commit or push |

The initial suite caught a false startup-success log on a port bind failure: the installed Express listen wrapper invokes the supplied callback for errors too. Switching startup to Node's HTTP server separated the successful listening event from error handling; the final full suite verifies the correction.

Limitations: this backend has no authentication, general business-payload schemas, request correlation IDs, persistence, rate limiting, AI, or external integration. Automatic watch reload after a source edit, public deployment, load testing, and application security beyond these foundation checks were not verified. Backend dependencies were already installed manually; no dependency audit or compatibility claim beyond the exercised runtime/build paths is implied. Dashboard hashes match the initial snapshot. Separate AI-backend source, configuration, and tests appeared during the task and were preserved without review, execution, or modification; they are excluded from this task's verified scope.

Learning remains not assessed. The working foundation and passing tests establish implementation evidence only.

## FastAPI foundation — verified approved scope

Date: 27 November 2026 (Asia/Kolkata). Implementation: **verified locally**. Learning: **not assessed**.

### Approved scope and inspection

The user approved the FastAPI foundation, environment configuration, centralized routing, global exception handling, basic logging, `/api/v1/health`, lifespan management, `.env.example`, startup/health verification, and this progress update. The requested support directories and proportionate tests are included. This explicit approval supersedes the initial-only scope recorded in `AGENTS.md` for this step; its incremental workflow still applies.

Read `AGENTS.md`, the root README, and all six project documents before implementation. `ai-backend/` initially contained only a manually prepared `.venv/` and `requirements.txt`. Python 3.12.3, FastAPI 0.165.0, Uvicorn 0.54.0, Pydantic 2.14.4, and Pydantic Settings 2.16.3 were available. `httpx` and `pytest` were absent; neither was installed.

This foundation completes roadmap 02.01 and includes the explicitly requested global errors, logging, lifecycle management, and foundation tests. It does not complete the mock request/response contract in 02.02 or all async-boundary work in 02.03. Node.js verification above belongs to its separate task and was not repeated here.

### Files and implementation explained

Paths below are relative to `ai-backend/`.

| File | What it does and why |
| --- | --- |
| `app/main.py` | `create_app()` assembles settings, error handlers, and routes in one place. `app` is Uvicorn's ASGI entry point. The async lifespan logs startup and shutdown; its `finally` block also runs when the lifespan body fails. No external resource is initialized yet. |
| `app/core/config.py` | Pydantic Settings validates `AI_APP_NAME` and `AI_LOG_LEVEL`. Defaults allow local startup without a real `.env`. Environment variables override the service-local `.env`, whose absolute path is independent of the launch directory. Blank names and unsupported log levels fail validation; input values are hidden from the formatted settings error. The product title has one application-code default. |
| `app/core/logging.py` | Python's built-in logging writes timestamp, severity, logger name, and message to the console. `AI_LOG_LEVEL` controls the `app` logger hierarchy. Repeated setup does not add duplicate handlers or replace Uvicorn's handlers; Uvicorn manages its own server/access log settings. |
| `app/core/exceptions.py` | Global validation errors return HTTP 422 with field location, message, and error type, excluding raw submitted input and validation context. Unexpected errors return a generic HTTP 500; application logs include only exception type and HTTP method. FastAPI's existing HTTP exception handler retains normal status codes, details, and headers such as `Allow` and `Retry-After`. |
| `app/api/v1/router.py` | Collects version-one routers and applies `/api/v1` once. Future approved feature routers can be registered here without putting feature logic in `main.py`. |
| `app/api/v1/health.py` | Typed, asynchronous `GET /health` route mounted at `/api/v1/health`. Returns HTTP 200 and `{"status":"ok"}`. The small response model also defines the OpenAPI schema. This is process liveness, not an external-service readiness test. |
| `.env.example` | Documents safe optional configuration values. No real `.env`, credentials, or model keys were created. |
| `app/__init__.py`, `app/core/__init__.py`, `app/api/__init__.py`, `app/api/v1/__init__.py` | Small package markers make active Python imports explicit; they contain no startup side effects. |
| `app/modules/.gitkeep`, `app/integrations/.gitkeep`, `app/middleware/.gitkeep`, `app/utils/.gitkeep` | Empty markers preserve the four requested extension folders in Git. They contain no feature modules, integrations, custom middleware, or speculative utilities. Exception handlers use FastAPI's built-in mechanism. |
| `tests/__init__.py` | Marks the test package; contains no setup behavior. |
| `tests/test_config.py` | Checks defaults, dotenv loading, environment priority, `AI_` isolation, invalid values, and the example configuration. Tests use a temporary dotenv file and restore the environment afterward. |
| `tests/test_application.py` | Uses installed Uvicorn with a temporary loopback socket and Python's HTTP client to exercise actual requests. Covers health, HTTP errors/headers, validation privacy, safe 500 responses, OpenAPI, logging, and lifespan cleanup. Failure routes exist only in the test application; the production app exposes none of them. The server stops during cleanup. |

The current structure keeps HTTP concerns in `api/`, application assembly in `main.py`, and shared runtime concerns in `core/`. There is no business/domain behavior needing service, repository, or interface layers yet. Future approved features can live in `modules/`; external adapters belong in `integrations/`. Business operations remain the Node.js service's responsibility.

Existing packages provide HTTP handling (FastAPI/Starlette), serving (Uvicorn), typed models (Pydantic), and environment/dotenv loading (Pydantic Settings and python-dotenv). Logging, async context management, unittest, temporary files, sockets, threads, and HTTP verification use Python's standard library. No dependency manifest or installed package was changed by the FastAPI task.

The lifespan and exception approach follows the official [FastAPI lifespan documentation](https://fastapi.tiangolo.com/advanced/events/) and [exception handling documentation](https://fastapi.tiangolo.com/tutorial/handling-errors/). Configuration uses [Pydantic Settings](https://docs.pydantic.dev/latest/concepts/pydantic_settings/).

### Commands and verification evidence

Run these commands from `ai-backend/`; the virtual environment does not need shell activation when its interpreter is invoked directly.

```bash
.venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8001
.venv/bin/python -m unittest discover -s tests -v
.venv/bin/python -m compileall -q app tests
.venv/bin/python -m pip check
```

The first command serves the application locally on port 8001; Ctrl+C shuts it down. Open `http://127.0.0.1:8001/api/v1/health` for health and `http://127.0.0.1:8001/docs` for generated interactive API documentation. The second command discovers and runs standard-library tests. `compileall` checks Python syntax, creating only ignored bytecode. `pip check` checks compatibility of installed dependency requirements without installing anything. The verification run used an OS-assigned temporary port to avoid port conflicts.

Passed checks:

- **16 tests passed**, including real HTTP behavior, invalid settings, configuration precedence, safe responses, and lifecycle/logging checks.
- Actual `python -m uvicorn app.main:app` subprocess started on `127.0.0.1`; `GET /api/v1/health` returned HTTP 200 with `{"status":"ok"}`.
- Actual production `/openapi.json` contained exactly one application path: `/api/v1/health`. Test-only routes were absent.
- SIGTERM triggered the application's shutdown log and Uvicorn's `Application shutdown complete.` message. The verification server exited and was not left running.
- An actual Uvicorn startup with invalid `AI_LOG_LEVEL` exited unsuccessfully with an explicit settings validation error; its formatted error did not echo the invalid value.
- Python compilation passed; `pip check` reported `No broken requirements found.`
- Required directories, UTF-8 text, final newlines, trailing whitespace, and Markdown fence checks passed. `.env.example` and the folder markers are trackable; virtual-environment and bytecode files remain ignored.
- SHA-256 comparison found 41 pre-existing source/configuration/documentation files unchanged, including instructions, root files, Python requirements, dashboard files, and other project documents. Four backend source/test files changed independently during this task and were left untouched by FastAPI commands.

Limitations: this verifies a local HTTP foundation only. No Gemini, RAG, LangChain, LangGraph, Redis, database, authentication, Node-to-Python integration, deployment, load test, or static type checker is included. Type hints and compilation do not establish full static type correctness. The health response does not claim any future dependency is connected. Uvicorn's own server error logs may include tracebacks; the application's generic HTTP response does not. No learner demonstration has been assessed.

No Node.js backend or dashboard files were written by the FastAPI task. The progress file received a separate backend update during this task; that entry is preserved. No dependency installation, commit, or push was performed. Stop here for approval before any next feature.

## Basic Node.js-to-FastAPI communication — verified approved scope

Date: 27 November 2026 (Asia/Kolkata). Implementation: **verified locally**. Learning: **not assessed**.

### Approved scope and inspection

The user approved a configurable Node.js AI service client using native fetch, an upstream request timeout, communication with the existing FastAPI health endpoint, a Node.js `/api/v1/ai/health` route, safe failures, tests, real communication verification, and this progress update. Authentication, database integration, Gemini, and RAG remain outside this step. This is the basic health-communication portion of roadmap 03.01, not completion of its planned authenticated contract.

Read `AGENTS.md`, the root README, project documents, Node.js configuration/routes/errors/tests, and the existing FastAPI application and health route before changing files. Node.js v24.22.2 supports the required built-in HTTP client and timeout signal. Existing Node.js/Python dependencies were reused. The user confirmed data-service readiness; no container or database work was needed.

### Files and important implementation explained

| File | What changed and why |
| --- | --- |
| `backend/src/config/env.ts` | Adds validated `AI_SERVICE_URL` and `AI_SERVICE_TIMEOUT_MS`, exposed as `env.aiServiceUrl` and `env.aiServiceTimeoutMs`. Defaults are `http://127.0.0.1:8001` and 5000 ms. The URL must be an HTTP(S) origin without credentials, paths, queries, or fragments; a trailing slash is normalized. Keeping the origin separate from the endpoint path avoids duplicated API prefixes. Timeout accepts decimal integer milliseconds from 1 through 60000. Invalid configuration prevents startup with a fixed message that omits the supplied value. |
| `backend/.env.example` | Documents the new origin and timeout settings with safe defaults. Existing process environment variables still override the backend-local `.env`. No real `.env` was created or edited. |
| `backend/src/integrations/ai/ai-client.ts` | Exports reusable `getAiHealth()` and its typed `AiHealthResponse`. Native fetch calls the fixed `/api/v1/health` path. One `AbortSignal.timeout()` covers connecting, receiving headers, and reading JSON. Redirects are not followed. HTTP 200, JSON content type, and an object containing `status: "ok"` are required. Runtime validation uses `unknown` because a TypeScript type alone cannot validate network input. The client returns only the agreed status field. Rejected status/content-type bodies are cancelled to release the connection. |
| `backend/src/modules/ai/ai.routes.ts` | Implements the working AI health feature: await the client and return its validated health result. Express 5 forwards rejected async handlers to the existing error middleware. There is no extra business logic requiring a controller/service layer yet. |
| `backend/src/routes/index.ts` | Mounts the AI router under `/ai`; the existing app supplies `/api/v1`, producing GET `/api/v1/ai/health`. The Node.js liveness route remains independently available. |
| `backend/tests/ai.test.mjs` | Runs actual loopback HTTP requests through the Node application to a small controllable upstream fixture. Tests success, direct client reuse, removal of unexpected upstream fields, bad statuses, malformed JSON/schema, wrong content type, redirects, broken/refused connections, timeouts before headers and during body reading, and independent Node liveness. All fixture servers are closed afterward. |
| `backend/tests/env.test.mjs` | Updates existing configuration expectations and adds valid/invalid AI origin and timeout cases, including startup-safe error messages and the trackable example configuration. |
| `backend/tests/app.test.mjs` | Supplies deterministic AI settings before importing the application so a developer's local `.env` cannot affect unrelated foundation tests. |
| `backend/tests/server.test.mjs` | Supplies deterministic AI settings to existing server subprocess tests and verifies that invalid AI settings prevent startup without exposing private values. |
| `docs/PROGRESS.md` | Records the approved scope, file responsibilities, request/error contracts, actual verification, and deferred work. Existing foundation records are preserved as historical evidence. |

The reusable client owns outbound HTTP and response validation; the feature route owns the HTTP endpoint; central routing mounts the feature. Existing `HttpError` and global middleware provide the backend's error JSON contract. A small typed function is sufficient for the current integration; feature/domain layers can be introduced when actual business behavior needs them.

Native [fetch](https://nodejs.org/api/globals.html#fetch) and [AbortSignal.timeout](https://nodejs.org/api/globals.html#static-method-abortsignaltimeoutdelay) avoid adding an HTTP-client dependency. The existing installed Node types and TypeScript build were also checked for compatibility.

### Request flow and safe errors

1. A caller sends GET `/api/v1/ai/health` to Node.js. Existing CORS middleware and the versioned router handle the request.
2. The AI feature route calls `getAiHealth()`. The client reads validated configuration and sends GET `${AI_SERVICE_URL}/api/v1/health` with `Accept: application/json` and the configured timeout signal.
3. FastAPI's existing endpoint returns `{"status":"ok"}`. Node.js validates the status, content type, and JSON shape, then returns HTTP 200 with only that agreed JSON object.
4. On failure, the client throws a safe `HttpError`. Existing global error middleware sends the error contract below. Upstream messages, bodies, addresses, credentials, and stack traces are not copied into it. There are no application-level retries.

| Condition | Node HTTP status | Error code | Public message |
| --- | --- | --- | --- |
| Connection/network failure before headers | 503 | `AI_SERVICE_UNAVAILABLE` | AI service is unavailable. |
| Configured deadline expires, including while reading the body | 504 | `AI_SERVICE_TIMEOUT` | AI service request timed out. |
| Non-200 status, redirect, invalid content type/JSON/schema, or incomplete response after headers | 502 | `AI_SERVICE_INVALID_RESPONSE` | AI service returned an invalid response. |

Errors use the existing shape `{"error":{"code":"...","message":"..."}}`. The global handler logs only its existing fixed message and error class; the client does not log upstream content. A failed AI check does not change GET `/api/v1/health`, which remains Node.js process liveness.

### Commands, verification, and limitations

From `backend/`:

```bash
npm run typecheck
npm test
```

`typecheck` verifies strict TypeScript without writing JavaScript. `npm test` compiles the service into ignored `dist/` and runs Node's built-in test runner; no test dependency is added. Final result: **32 tests passed**. Coverage includes successful communication and every failure category above, plus the existing CORS, parser, routing, and server lifecycle regressions.

To run both services locally in separate terminals from the repository root:

```bash
cd ai-backend
.venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8001
```

```bash
cd backend
npm run build
npm start
```

Uvicorn starts the real FastAPI application; `npm run build` compiles TypeScript and `npm start` runs the compiled Node server. With default settings, GET `http://127.0.0.1:3000/api/v1/ai/health` checks FastAPI at port 8001. Set `AI_SERVICE_URL` to the actual origin if FastAPI uses a different port. `AI_SERVICE_TIMEOUT_MS` changes the full upstream deadline. These settings are loaded at startup, so restart Node after changing them.

Actual communication verification used temporary OS-assigned loopback ports and the production entry points, with a configured 1000 ms upstream timeout:

- Direct FastAPI health returned HTTP 200 with `{"status":"ok"}`.
- Node.js at `127.0.0.1:57451` forwarded the request to FastAPI at `127.0.0.1:33485` and returned HTTP 200 with the expected JSON. FastAPI's access log confirmed the forwarded request.
- After stopping only the verification FastAPI process, Node.js AI health returned the exact safe HTTP 503 contract. Node.js liveness still returned HTTP 200.
- Both verification processes shut down cleanly. No existing backend/frontend/container process was stopped or reconfigured.
- Final strict type checking and the compiled 32-test Node.js suite passed. Source/document checks passed for UTF-8, final newlines, trailing whitespace, Markdown fences, and local documentation links.
- SHA-256 scope comparison confirmed exactly seven existing files changed and three files were added, all listed above. The other 58 pre-existing source/configuration/documentation files matched the starting snapshot, including frontend, Python backend, dependency manifests/lockfile, instructions, other docs, and `compose.yaml`. No file was removed.

Limitations: this is a local liveness communication check. Authentication, delegated authorization, request correlation IDs, a mock AI payload contract, database/cache/vector integration, model calls, retries, load tests, and deployment are not implemented by this step. It does not complete roadmap 03.01 or make the services ready for public access. The user-reported Docker readiness is separate from application integration and was not re-tested here. No learner demonstration has been assessed.

No dependency installation, frontend/Python/infrastructure change, commit, or push was performed. Stop here for approval before any next feature.

## PostgreSQL integration — verified approved scope

Date: 27 November 2026 (Asia/Kolkata). Implementation: **verified locally**. Learning: **not assessed**.

### Approved scope and dependencies

The user approved PostgreSQL environment configuration, a reusable Node.js pool, connection/idle timeouts, readiness, safe failures, graceful cleanup, automated tests, actual Docker database connection verification, and this progress update. ORM, schemas, authentication, and other features were explicitly excluded. This establishes database connectivity before the schema work planned in roadmap 04.01; it does not complete that roadmap step.

Read `AGENTS.md`, existing Node.js source/configuration/tests, progress and relevant roadmap records, and the existing Docker configuration before editing. Contrary to the initial assumption, neither `pg` nor `@types/pg` was installed or declared in `backend/`. The user explicitly approved installing both. `npm install pg` adds the PostgreSQL driver; `npm install --save-dev @types/pg` adds compile-time types. The resulting versions are both 8.23.1, recorded in `backend/package.json` and its lockfile. No other direct dependency was added. Installation reported zero known vulnerabilities at that time; no install-script approvals were changed.

### Files and behavior

| File under `backend/` | Responsibility |
| --- | --- |
| `src/config/env.ts` | Requires a PostgreSQL `DATABASE_URL` containing a host, user, and database. Validates URI structure/credential encoding and positive integer timeout settings without echoing supplied values. Existing dotenv loading and process-variable precedence remain in place. |
| `.env.example` | Documents host port 5433, a placeholder password, percent-encoding, timeout defaults, and cloud TLS configuration. No actual database password was added to the example or application source. |
| `src/integrations/database/postgres.ts` | Exports one reusable `postgresPool`, a read-only readiness check, and idempotent pool closure. Caps connections at ten, creates connections lazily, handles idle-client error events with a fixed log message, and maps readiness failures to a safe `HttpError`. |
| `src/modules/health/health.routes.ts` | Adds GET `/api/v1/health/ready`, which runs `SELECT 1`. Returns HTTP 200 with `{"status":"ok","database":"ready"}` on success; uses `Cache-Control: no-store` for success and failure. Existing GET `/api/v1/health` remains process liveness without database access. |
| `src/server.ts` | Drains HTTP requests before awaiting pool closure on SIGINT/SIGTERM. The existing ten-second forced shutdown deadline now covers both HTTP draining and database cleanup. Logs cleanup failures safely and sets a nonzero exit code. Also closes the lazy pool after server startup errors. |
| `tests/postgres.test.mjs` | Database-independent readiness success/error checks, credential-safe responses/logs, idle-error handling, actual stalled-handshake timeout and refused-connection checks, independent liveness, lazy connections, and idempotent cleanup. |
| `tests/postgres.integration.test.mjs` | Opt-in live read-only SQL/HTTP checks for parameterized queries, connection reuse, query timeout/recovery, idle eviction, actual failed authentication, and production-entrypoint shutdown on both signals. Observes only test-named connections in `pg_stat_activity` to verify closure. |
| Existing `tests/*.test.mjs` | Keeps configuration deterministic as `DATABASE_URL` becomes required; adds URL/timeout validation and production startup/shutdown regression assertions. Existing AI, CORS, parsing, errors, routing, and lifecycle checks remain. |

Configuration:

| Setting | Default | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | Required; no credential-bearing fallback | Local `postgresql://` or `postgres://` URL, or a future cloud provider URL |
| `DATABASE_CONNECTION_TIMEOUT_MS` | 5000 | Bounds connecting and waiting for an available pool client |
| `DATABASE_IDLE_TIMEOUT_MS` | 30000 | Closes unused pooled connections |
| `DATABASE_QUERY_TIMEOUT_MS` | 5000 | Sets both client query timeout and PostgreSQL statement timeout |

All three timeout settings accept integers from 1 through 60000 milliseconds. Requiring the URL prevents accidental reliance on an implicit local database in production. A valid configuration permits HTTP startup even if PostgreSQL is unavailable; readiness then reports failure while process liveness continues. Each probe issues a fresh query, allowing recovery without restarting Node.js. There is no application retry loop.

Every readiness connection/authentication/query failure returns HTTP 503 with `{"error":{"code":"DATABASE_UNAVAILABLE","message":"Database is unavailable."}}`. Driver errors, URLs, credentials, internal addresses, and stack traces are not copied to responses or application logs. Idle connection failures are handled outside request processing so an emitted pool error does not crash the process.

The shared pool uses [`pg.Pool`](https://node-postgres.com/apis/pool); `pool.query()` acquires/releases a client automatically, and `pool.end()` drains the pool. This avoids per-request connection setup and manual release paths for the current single-query probe. Future transactions must acquire one client, use it throughout, and release it in `finally`. No transaction helper is introduced in this step.

Local configuration uses `127.0.0.1:5433`, matching the existing Docker host mapping to container port 5432. Cloud support passes the supplied connection string and its [TLS options](https://node-postgres.com/features/ssl) to `pg` without hardcoding local hosts or disabling certificate verification. Prefer `sslmode=verify-full`; a provider private CA can be supplied through `sslrootcert` or the runtime trust store. Actual cloud connectivity and certificates were not tested. No developer `.env` file was created or edited; configure the required URL securely in the process environment or ignored backend `.env` before starting the service.

### Commands and verification evidence

From `backend/`:

```bash
npm run typecheck
npm test
```

The first command checks strict TypeScript without generating output. The second builds ignored `dist/` and runs all tests through Node's existing built-in test runner. Without `TEST_DATABASE_URL`, the four live checks skip explicitly and the other 43 tests run without a database.

To include live tests, securely set `TEST_DATABASE_URL` to the local test database URL, then run `npm test` again. It is separate from the application `DATABASE_URL` so the ordinary test suite cannot accidentally target a developer database. Avoid placing credentials in shell history or committed files. Live checks run read-only queries, including a bounded sleep, and use an intentionally incorrect password for the failure case; they create no schema or application data.

Verified results:

- Strict TypeScript checking and the compiled build passed.
- Database-independent Node.js run: **43 passed**, four live tests explicitly skipped.
- Final Node.js run with the existing local PostgreSQL URL supplied securely: **47 passed**, zero failed/skipped.
- Actual PostgreSQL protocol connection and `SELECT 1` succeeded on `127.0.0.1:5433`. Sequential parameterized/read-only queries reused the same backend connection. Idle connections were evicted; a timed-out query discarded its connection, and a subsequent readiness request recovered.
- Production Node.js entrypoints returned HTTP 200 for readiness with a real connection. SIGINT and SIGTERM each exited with code zero after logging HTTP drain followed by pool closure; `pg_stat_activity` confirmed the test-named connection disappeared.
- A real incorrect-password attempt returned the fixed HTTP 503 response without leaking its connection string/password; liveness still returned HTTP 200. Separate TCP fixtures verified bounded stalled authentication and refused connections without stopping any container.
- All **16 existing Python tests passed** again using `.venv/bin/python -m unittest discover -s tests -v` from `ai-backend/`. Python source/dependencies were unchanged. The dashboard has no test script and was left unchanged.
- Whitespace checks passed. Changes are confined to the PostgreSQL backend integration, its configuration/dependencies/tests, and this progress record. Existing untracked `compose.yaml` and `dashboard/` were preserved. No commit or push was performed.

The Docker socket is inaccessible to this session, and noninteractive sudo requires a password, so `docker compose ps` could not verify container metadata. Verification used the actual database through its existing Docker-mapped host port instead; no Docker configuration or container lifecycle changes were needed. No cloud database, TLS handshake, load test, schema, migration, ORM, or authentication feature was exercised or introduced. No learner demonstration has been assessed.

## PostgreSQL schema and migration system — verified approved scope

Date: 27 November 2026 (Asia/Kolkata). Implementation: **verified locally**. Learning: **not assessed**.

### Approved scope and review

Continued from the existing partial work on roadmap step 04.01 (PostgreSQL migration system and core tenant, user, membership, and location schema). Inspected git status/diff, existing SQL migration files, migration runner, CLI entrypoint, and unit/integration tests before making targeted fixes. No new npm dependencies were added, no existing database data was deleted, and no step beyond 04.01 was implemented.

### Files and responsibilities

| File under `backend/` | Responsibility and review status |
| --- | --- |
| `database/schema_migrations.sql` | Preserved; defines `schema_migrations` with positive integer `version` PK, unique `filename`, 64-char lowercase hex SHA-256 `checksum`, and `applied_at` timestamp |
| `database/migrations/0001_create_users.sql` | Preserved; creates `users` (`id` UUID PK, trimmed/validated `email` with case-insensitive `users_email_unique` index on `lower(email)`, validated `display_name`, `created_at`, `updated_at`) |
| `database/migrations/0002_create_businesses.sql` | Preserved; creates `businesses` (`id` UUID PK, trimmed/validated `name`, `created_at`, `updated_at`) |
| `database/migrations/0003_create_business_members.sql` | Preserved; creates `business_members` (`business_id` FK `ON DELETE CASCADE`, `user_id` FK `ON DELETE RESTRICT`, `role` in `owner`/`operator` defaulting to `operator`, `UNIQUE (business_id, user_id)`, composite `UNIQUE (business_id, id)` for future tenant-consistent FKs, and `business_members_user_id_idx`) |
| `database/migrations/0004_create_business_locations.sql` | Preserved; creates `business_locations` (`business_id` FK `ON DELETE CASCADE`, trimmed/validated `name`, composite `UNIQUE (business_id, id)`, and case-insensitive `business_locations_business_name_unique` on `(business_id, lower(name))`) |
| `database/migrations/0005_manage_updated_at.sql` | Preserved; creates `set_updated_at()` using `clock_timestamp()` and `BEFORE UPDATE` triggers on all four core tables |
| `src/integrations/database/migrations.ts` | Preserved; loads/validates `NNNN_name.sql` files, computes SHA-256 checksums, runs inside `BEGIN ISOLATION LEVEL READ COMMITTED` with `pg_advisory_xact_lock(hashtext(current_database()), hashtext(current_schema()))`, verifies prior history before running pending SQL, rolls back and discards failed clients, and wraps errors in credential-safe `MigrationError` |
| `src/migrate.ts` & `package.json` (`db:migrate`) | Preserved; builds TypeScript, runs `runMigrations()`, prints applied filenames or up-to-date status without driver/credential leaks, and closes `postgresPool` |
| `tests/migrations.test.mjs` | Preserved; 18 unit test assertions covering file sorting/checksums, invalid/duplicate/empty migration rejection before connecting, single-client transaction ordering, history mismatch detection, rollback/client-discard on failure at every stage, and sanitized errors |
| `tests/migrations.integration.test.mjs` | Fixed two test bugs and expanded coverage: replaced `CREATE TEMP TABLE` (which PostgreSQL forbids referencing permanent tables via FK, `42P16`) with a transaction-scoped permanent table inside the isolated test schema; fixed `t.after` cleanup order so `closeDatabasePool()` and `DROP SCHEMA IF EXISTS` run before `observer.end()`; added explicit `pg_indexes`, `schema_migrations` constraint, multiple-`@` email, and padded-name checks |

### Commands and verification evidence

From `backend/`:

```bash
npm run typecheck
npm test
TEST_DATABASE_URL='postgresql://<user>:<password>@127.0.0.1:5433/onusai' npm test
DATABASE_URL='postgresql://<user>:<password>@127.0.0.1:5433/onusai' npm run db:migrate
```

Verified results:

- `npm run typecheck` passed with zero errors.
- Database-independent `npm test` run: **61 passed, 0 failed, 5 skipped** (the 5 live PostgreSQL tests skip as designed without `TEST_DATABASE_URL`).
- Live PostgreSQL `npm test` run against the running Docker database on `127.0.0.1:5433`: **80 passed, 0 failed, 0 skipped** (all 14 subtests in `migrations.integration.test.mjs` passed, including concurrent CLI advisory-lock serialization, rollback on failed initial/later batches, history tamper rejection, constraints, indexes, `updated_at` triggers, tenant-scoped composite FKs, and cascade/restrict delete behavior).
- Executed `npm run db:migrate` twice against the running Docker database: first run applied `0001_create_users.sql` through `0005_manage_updated_at.sql`; second run confirmed idempotency (`Database migrations are up to date.`). Direct `pg` inspection confirmed only the `public` schema exists with all 5 tables, all 5 `schema_migrations` checksums, and all 4 `set_updated_at` triggers.

Limitations: migrations implement the forward-only schema for roadmap step 04.01 without down-migrations, staff authentication/sessions (`04.02`), business/location CRUD (`04.03`), assistant configuration (`04.04`), conversations (`04.05`), or PostgreSQL row-level security (`13.01`). Learning remains not assessed.

## Staff authentication, sessions, and tenant-aware access (04.02) — verified approved scope

Date: 27 November 2026 (Asia/Kolkata). Implementation: **verified locally**. Learning: **not assessed**.

### Approved scope and design

Implemented roadmap step 04.02 using only existing Node.js/Express/PostgreSQL dependencies (no new packages installed): `crypto.scrypt` password hashing, opaque server-side sessions stored as SHA-256 hashes, `HttpOnly`/`SameSite=Lax` cookies (`Secure` in production), session-bound CSRF protection, PostgreSQL-backed login brute-force lockouts, authentication and owner/operator tenant-membership middleware, tenant-scoped read endpoints, and a development-only staff provisioning CLI. Public registration, OAuth, password recovery, frontend screens, and step 04.03 CRUD mutations were excluded.

### New and updated files

| File under `backend/` | Responsibility |
| --- | --- |
| `database/migrations/0006_create_user_credentials.sql` | Creates `user_credentials` (`user_id` PK/FK `ON DELETE CASCADE`, scrypt-formatted `password_hash`, `password_updated_at`, and `set_updated_at` trigger) while preserving existing `users` rows |
| `database/migrations/0007_create_staff_sessions.sql` | Creates `staff_sessions` (`token_hash` unique 64-hex SHA-256, `csrf_token_hash` 64-hex SHA-256, `expires_at > created_at`, `revoked_at`, `last_seen_at`, indexes, and `set_updated_at` trigger) |
| `database/migrations/0008_create_auth_login_attempts.sql` | Creates `auth_login_attempts` (SHA-256 hashed `scope_key`, `failed_attempts`, `window_started_at`, `locked_until`, and `set_updated_at` trigger) |
| `src/config/env.ts` & `.env.example` | Adds validated `AUTH_SESSION_TTL_MS`, `AUTH_LOGIN_MAX_ATTEMPTS`, `AUTH_LOGIN_WINDOW_MS`, and `AUTH_LOGIN_LOCKOUT_MS` |
| `src/types/express.d.ts` | Augments `Express.Request` with verified `auth` and `tenant` contexts |
| `src/utils/password.ts`, `tokens.ts`, `cookies.ts` | `crypto.scrypt` (`N=16384, r=8, p=1`, 16-byte random salt, constant-time verify + dummy timing check), 256-bit `base64url` token generation/SHA-256 comparison, and dependency-free `Cookie` header parsing |
| `src/utils/http-error.ts` & `src/middlewares/error-handler.ts` | Adds optional safe response headers on `HttpError` (used for `Retry-After` on `429`) |
| `src/middlewares/auth.ts` & `src/middlewares/tenant.ts` | `requireAuth`, `requireCsrf`, and `requireTenantMembership(allowedRoles?)` |
| `src/modules/auth/*` | `auth.constants.ts`, `auth.validation.ts`, `auth.repository.ts`, `auth.service.ts`, `auth.controller.ts`, `auth.routes.ts` |
| `src/modules/businesses/*` | `businesses.repository.ts`, `businesses.service.ts`, `businesses.controller.ts`, `businesses.routes.ts` |
| `src/app.ts` & `src/routes/index.ts` | Enables `credentials: true` on CORS for allowlisted origins; mounts `/api/v1/auth` and `/api/v1/businesses` |
| `src/seed-staff.ts` & `package.json` (`db:seed:staff`) | Development-only transactional staff/business/location provisioning via `SEED_*` env vars (blocked when `NODE_ENV=production`) |
| `tests/auth.unit.test.mjs`, `tests/auth.integration.test.mjs`, and updated `env`/`app`/`migrations.integration` tests | Unit and live PostgreSQL integration tests for crypto, validation, cookies, sessions, CSRF, brute-force lockouts, RBAC, and two-tenant isolation |

### Authentication flow, API contracts, and security decisions

1. **Authentication (`POST /api/v1/auth/login`)**: Validates `{ email, password }` strictly (rejects unexpected keys), checks hashed `email:` and `ip:` lockouts in `auth_login_attempts` (`429 TOO_MANY_LOGIN_ATTEMPTS` + `Retry-After`), verifies password via `crypto.scrypt` (running `verifyDummyPassword` for missing accounts), returns generic `401 INVALID_CREDENTIALS` on mismatch while atomically incrementing failure windows, and on success clears email failures, creates a `staff_sessions` row with SHA-256 hashes only, sets `onussync_session` (`HttpOnly`, `SameSite=Lax`, `Path=/api/v1`, `Secure` when `NODE_ENV=production`) and `onussync_csrf` (`SameSite=Lax`, `Path=/`, `Secure` when `NODE_ENV=production`), and returns `{ user, memberships, session: { expiresAt, csrfToken } }` with `Cache-Control: no-store`.
2. **Session inspection (`GET /api/v1/auth/me`) and logout (`POST /api/v1/auth/logout`)**: `requireAuth` hashes `onussync_session`, requires an unrevoked non-expired row in `staff_sessions`, clears cookies and returns `401 AUTHENTICATION_REQUIRED` otherwise. `GET /api/v1/auth/me` returns verified `user`, `memberships`, and `session` (echoing `csrfToken` only if the `onussync_csrf` cookie matches `csrf_token_hash`). `POST /api/v1/auth/logout` enforces `requireAuth` + `requireCsrf` (`X-CSRF-Token` matched against `csrf_token_hash` via `timingSafeEqual`), sets `revoked_at`, and clears cookies.
3. **Tenant-aware access (`GET /api/v1/businesses`, `/:businessId`, `/:businessId/locations`, `/:businessId/members`)**: Every tenant route requires `requireAuth` followed by `requireTenantMembership`. `:businessId` is UUID-validated and joined with `req.auth.user.id` in `business_members`; client-supplied headers/query/body roles or tenant IDs are never trusted. Non-members and unknown business UUIDs both receive `403 TENANT_ACCESS_DENIED`; operators requesting owner-only `GET /:businessId/members` receive `403 INSUFFICIENT_PERMISSIONS`.
4. **Configuration**: `AUTH_SESSION_TTL_MS` (default `28800000`, 1s–30d), `AUTH_LOGIN_MAX_ATTEMPTS` (default `5`, 1–100), `AUTH_LOGIN_WINDOW_MS` (default `900000`, 1s–24h), `AUTH_LOGIN_LOCKOUT_MS` (default `900000`, 1s–24h).

### Verification evidence

- `npm run typecheck`: passed with 0 errors.
- Live PostgreSQL `npm test` (`TEST_DATABASE_URL` set): **94 passed, 0 failed, 0 skipped** (covers scrypt hashing, random salts, token/cookie helpers, `Secure` flag in `NODE_ENV=production`, `db:seed:staff` guardrails, login/me/logout, DB hash-only storage, expired/revoked/forged sessions, CSRF enforcement, brute-force lockouts, owner vs operator RBAC, and two-tenant isolation).
- Database-independent `npm test`: **69 passed, 0 failed, 6 skipped** (live DB suites skip cleanly when `TEST_DATABASE_URL` is unset).
- `npm run db:migrate` applied `0006`–`0008` to the running Docker PostgreSQL instance (`127.0.0.1:5433`) and confirmed idempotency on re-run (`Database migrations are up to date.`); `public` now contains all 8 tables (`users`, `businesses`, `business_members`, `business_locations`, `user_credentials`, `staff_sessions`, `auth_login_attempts`, `schema_migrations`).

Limitations: no scheduled cleanup job purges expired `staff_sessions`/`auth_login_attempts` rows yet; `req.ip` relies on Express's default `trust proxy = false` (must be explicitly configured if deployed behind a reverse proxy); PostgreSQL row-level security remains planned for `13.01`; no public registration, password reset, MFA, or frontend login UI is implemented.

## Business profile and location CRUD (04.03) — verified approved scope

Date: 27 November 2026 (Asia/Kolkata). Implementation: **verified locally**. Learning: **not assessed**.

### Approved scope and design

Implemented roadmap step `04.03` (FR-01 and FR-03) using existing Node.js/Express/PostgreSQL dependencies (no new packages installed):

- **Business profile management**: Supports `POST /api/v1/businesses` (transactional creation of business + `'owner'` membership for the authenticated staff user) and `PATCH /api/v1/businesses/:businessId` (owner-only partial updates), while preserving nullable DB defaults for existing `0002`/seeded rows.
- **Business location CRUD with soft-archival**: Supports `GET` list (with optional `?includeArchived=true|false`), `GET` single, `POST` create, `PATCH` partial update, and `DELETE` soft-archive (`archived_at`) so future assistant/appointment foreign-key references remain intact while freeing archived location names for reuse.
- **Timezone and opening-hours validation**: Enforces valid IANA timezone names (explicit area/city or `UTC`, checked against `Intl.DateTimeFormat`) and 7-day `openingHours` objects supporting closed days (`{ closed: true }`), 24-hour `HH:MM` intervals, overnight shifts (`close < open`), and cross-day overnight carryover overlap rejection (including `sunday` into `monday`).

### New and updated files

| File under `backend/` | Responsibility |
| --- | --- |
| `database/migrations/0009_extend_businesses_profile.sql` | Adds nullable `description`, `contact_email`, `contact_phone`, `website_url`, `timezone`, and `opening_hours` (`jsonb`) with PostgreSQL `CHECK` constraints while preserving existing `businesses` rows |
| `database/migrations/0010_extend_business_locations.sql` | Adds nullable `address_line1`, `address_line2`, `city`, `state_region`, `postal_code`, `country_code`, `contact_email`, `contact_phone`, `timezone`, `opening_hours`, and `archived_at`; enforces address consistency and replaces `business_locations_business_name_unique` as a partial unique index `WHERE archived_at IS NULL` plus `business_locations_business_active_idx` |
| `src/modules/businesses/businesses.types.ts` | Domain types for `BusinessProfile`, `BusinessLocation`, `LocationAddress`, `WeeklyOpeningHours`, and create/update inputs |
| `src/modules/businesses/businesses.validation.ts` | Strict object/key validation, string trimming/email/phone/URL checks, IANA timezone validation, weekly opening-hours + overnight overlap checks, address validation, and `includeArchived` query parsing |
| `src/modules/businesses/businesses.repository.ts` | Parameterized SQL reads/writes, transactional `createBusinessWithOwner`, tenant-scoped location queries (`WHERE business_id = $1 AND id = $2`), soft-archival updates, and `23505` conflict mapping (`LOCATION_NAME_CONFLICT`) |
| `src/modules/businesses/businesses.service.ts` | Business profile and location CRUD coordination and `404`/`409` status mapping (`LOCATION_NOT_FOUND`, `LOCATION_ARCHIVED`, `LOCATION_ALREADY_ARCHIVED`) |
| `src/modules/businesses/businesses.controller.ts` | Request validation, `Cache-Control: no-store` headers, and ISO timestamp serialization |
| `src/modules/businesses/businesses.routes.ts` | Router-level `requireAuth` and `requireCsrf`, plus `requireTenantMembership(['owner', 'operator'])` for reads and `requireTenantMembership(['owner'])` for profile/location mutations |
| `src/seed-staff.ts` | Updates location seed upsert clause to `ON CONFLICT (business_id, lower(name)) WHERE archived_at IS NULL DO NOTHING` to match the partial unique index |
| `tests/businesses.unit.test.mjs`, `tests/businesses.integration.test.mjs`, and `tests/migrations.integration.test.mjs` | Unit tests for timezone/opening-hours/address/payload validation, live PostgreSQL HTTP tests for CRUD/RBAC/CSRF/tenant isolation/archival, and updated migration schema/index/constraint checks |

### API contracts and permissions

All routes are mounted under `/api/v1/businesses`, require a valid `onussync_session` cookie (`401 AUTHENTICATION_REQUIRED`), enforce `X-CSRF-Token` on `POST`/`PATCH`/`DELETE` (`403 CSRF_TOKEN_INVALID`), and return `Cache-Control: no-store`.

| Method & Path | Access | Behavior & key responses |
| --- | --- | --- |
| `GET /api/v1/businesses` | Authenticated staff | Lists businesses where the user has a verified membership (`200 { businesses }`) |
| `POST /api/v1/businesses` | Authenticated staff | Validates `{ name, description?, contactEmail?, contactPhone?, websiteUrl?, timezone?, openingHours? }`; creates business + `'owner'` membership in one transaction (`201 { business, membership }`) |
| `GET /api/v1/businesses/:businessId` | Tenant `owner` or `operator` | Returns full business profile and membership (`200 { business, membership }`); non-members receive `403 TENANT_ACCESS_DENIED` |
| `PATCH /api/v1/businesses/:businessId` | Tenant `owner` only | Partial profile update (at least one field; `null` clears nullable fields; `name` cannot be `null`) (`200 { business, membership }`); operators receive `403 INSUFFICIENT_PERMISSIONS` |
| `GET /api/v1/businesses/:businessId/locations` | Tenant `owner` or `operator` | Lists tenant locations; excludes archived by default unless `?includeArchived=true` (`200 { businessId, locations }`) |
| `POST /api/v1/businesses/:businessId/locations` | Tenant `owner` only | Validates required `name` & `timezone` plus optional `address` (`line1`, `line2?`, `city`, `stateRegion?`, `postalCode?`, `countryCode`), `contactEmail`, `contactPhone`, `openingHours` (`201 { businessId, location }`; duplicate active name returns `409 LOCATION_NAME_CONFLICT`) |
| `GET /api/v1/businesses/:businessId/locations/:locationId` | Tenant `owner` or `operator` | Returns tenant-scoped location (`200 { businessId, location }`); foreign or unknown `locationId` returns `404 LOCATION_NOT_FOUND` |
| `PATCH /api/v1/businesses/:businessId/locations/:locationId` | Tenant `owner` only | Partial update on active location (`200 { businessId, location }`); archived location returns `409 LOCATION_ARCHIVED`; foreign `locationId` returns `404 LOCATION_NOT_FOUND` |
| `DELETE /api/v1/businesses/:businessId/locations/:locationId` | Tenant `owner` only | Soft-archives location by setting `archived_at` (`200 { businessId, location }`); already archived returns `409 LOCATION_ALREADY_ARCHIVED`; foreign `locationId` returns `404 LOCATION_NOT_FOUND` |

### Verification evidence

- `npm run typecheck`: passed with 0 errors.
- `npm run build`: passed with 0 errors.
- `npm run db:migrate`: applied `0009_extend_businesses_profile.sql` and `0010_extend_business_locations.sql` to the running Docker PostgreSQL instance (`127.0.0.1:5433`) and confirmed idempotency on second run (`Database migrations are up to date.`).
- Live PostgreSQL `npm test` (`TEST_DATABASE_URL` set): **103 passed, 0 failed, 0 skipped** (covers timezone/opening-hours/overnight-overlap edge cases, address & partial-update validation, transactional business creation, owner/operator RBAC, CSRF enforcement, cross-tenant `403` and foreign-`locationId` `404` isolation, soft-archival + active-name reuse, and updated `0001`–`0010` migration/index/constraint checks).
- Database-independent `npm test` (`TEST_DATABASE_URL` unset): **73 passed, 0 failed, 7 skipped** (live DB suites skip cleanly when `TEST_DATABASE_URL` is unset).

Limitations: no unarchive/restore endpoint is implemented for archived locations (re-creating a new location with the same name is supported); no self-service team-member invite/role-management endpoints exist yet; no frontend dashboard UI or assistant configuration (`04.04`) is implemented; `db:seed:staff` was updated to match the partial unique index and compiled via `npm run build`, though a standalone CLI run of `db:seed:staff` was not re-executed separately in this step.

## Versioned assistant configuration, tool scopes, knowledge visibility, and centralized branding (04.04) — verified approved scope

Date: 27 November 2026 (Asia/Kolkata). Implementation: **verified locally**. Learning: **not assessed**.

### Approved scope and design

Implemented roadmap step `04.04` (FR-04 and `packages/` public branding) without introducing monorepo tooling or new dependencies:

- **Business-level & location-level assistants**: Supports one business-level assistant (`locationId = null`) and/or one assistant per active business location within each tenant, enforced via partial unique indexes and composite tenant-consistent foreign keys (`assistants_business_location_fk`).
- **Immutable version lifecycle & concurrency-safe publishing**: Each assistant starts with draft `v1` and supports draft creation (`POST .../versions`), draft editing (`PATCH .../versions/:versionId`), version history (`GET .../versions`), and transactional publishing (`POST .../versions/:versionId/publish`). Publishing acquires `FOR UPDATE` on the parent `assistants` row, verifies draft status and active location references, supersedes any prior published version, and relies on partial unique indexes plus PostgreSQL immutability triggers (`enforce_assistant_version_immutability`, `enforce_assistant_knowledge_locations_draft`) to prevent race conditions or post-publish edits.
- **Tool scopes (deny by default)**: `allowedTools` defaults to `[]` and validates against `APPROVED_TOOL_REGISTRY` (`lookup_availability`, `request_lead_capture`, `request_appointment_booking`, `request_human_handoff`); unapproved tool IDs fail with `400 UNAPPROVED_TOOL_SCOPE`.
- **Knowledge visibility settings**: Stores `allowedKnowledgeScopes` (subset of `'public' | 'staff_only'`, defaulting to `['public']`), `knowledgeLocationScope` (`'business_wide' | 'assigned_location' | 'selected_locations'`), and tenant-verified `knowledgeLocationIds` backed by `assistant_version_knowledge_locations` composite foreign keys.
- **Centralized public branding**: `packages/branding/` (`branding.json`, `index.js`, `index.d.ts`) is the single source of truth for OnusSync platform branding (`productName`, `shortName`, `tagline`, `attributionText`), consumed by `backend/src/config/branding.ts` and exposed via `GET /api/v1/branding`, kept strictly separate from per-tenant assistant branding (`displayName`, `welcomeMessage`, `tone`, `description`). `toPublicAssistantProfile` omits private `systemInstructions`, `modelSettings`, `allowedTools`, and `allowedKnowledgeScopes`.

### New and updated files

| File | Responsibility |
| --- | --- |
| `packages/branding/branding.json`, `index.js`, `index.d.ts` | Shared dependency-free public platform branding configuration and typed ESM export |
| `backend/src/config/branding.ts` | Loads and validates platform branding from `packages/branding/branding.json` without duplicating product-name literals |
| `backend/src/modules/branding/branding.routes.ts` & `backend/src/routes/index.ts` | Exposes public `GET /api/v1/branding` returning centralized platform branding |
| `backend/database/migrations/0011_create_assistants.sql` | Creates `assistants` with tenant-consistent composite FK to `business_locations`, partial unique scope indexes, and `set_updated_at` trigger |
| `backend/database/migrations/0012_create_assistant_versions.sql` | Creates `assistant_versions` and `assistant_version_knowledge_locations` with bounded checks, one-draft/one-published partial unique indexes, composite tenant FKs, and immutability triggers |
| `backend/src/modules/assistants/*` | `assistants.types.ts`, `assistants.validation.ts`, `assistants.repository.ts`, `assistants.service.ts`, `assistants.controller.ts`, `assistants.routes.ts` |
| `backend/src/modules/businesses/businesses.routes.ts` | Mounts `assistantsRouter` under `/:businessId/assistants` (inheriting `requireAuth` and `requireCsrf`) |
| `backend/tests/assistants.unit.test.mjs`, `assistants.integration.test.mjs`, `app.test.mjs`, `migrations.integration.test.mjs` | Unit tests for branding, tool/model/knowledge validation, and public projection privacy; live PostgreSQL tests for CRUD, concurrent publishing, rollback, immutability, RBAC, CSRF, and cross-tenant isolation |

### API contracts and permissions

All assistant endpoints live under `/api/v1/businesses/:businessId/assistants`, require `onussync_session` (`401`), enforce `X-CSRF-Token` on mutations (`403`), and return `Cache-Control: no-store`.

| Method & Path | Access | Behavior & key responses |
| --- | --- | --- |
| `GET /api/v1/branding` | Public | Returns centralized platform branding (`{ productName, shortName, tagline, attributionText }`) |
| `GET /api/v1/businesses/:businessId/assistants/tools` | Tenant `owner` or `operator` | Lists `APPROVED_TOOL_REGISTRY` (`defaultAllowed: false`) |
| `GET /api/v1/businesses/:businessId/assistants` | Tenant `owner` or `operator` | Lists tenant assistants with `publishedVersion` and `draftVersion` (`200`) |
| `POST /api/v1/businesses/:businessId/assistants` | Tenant `owner` only | Creates assistant (`locationId` optional) + draft `v1` transactionally (`201`); duplicate scope -> `409 ASSISTANT_ALREADY_EXISTS`; foreign location -> `404 LOCATION_NOT_FOUND`; archived location -> `409 LOCATION_ARCHIVED` |
| `GET /api/v1/businesses/:businessId/assistants/:assistantId` | Tenant `owner` or `operator` | Returns assistant + `publishedVersion` + `draftVersion` (`200`; foreign -> `404 ASSISTANT_NOT_FOUND`) |
| `GET /api/v1/businesses/:businessId/assistants/:assistantId/versions` | Tenant `owner` or `operator` | Lists all versions ordered descending by `versionNumber` (`200`) |
| `POST /api/v1/businesses/:businessId/assistants/:assistantId/versions` | Tenant `owner` only | Clones latest version with optional overrides as a new `draft` (`201`; existing draft -> `409 DRAFT_ALREADY_EXISTS`) |
| `GET /api/v1/businesses/:businessId/assistants/:assistantId/versions/:versionId` | Tenant `owner` or `operator` | Returns single version (`200`; foreign -> `404 ASSISTANT_VERSION_NOT_FOUND`) |
| `PATCH /api/v1/businesses/:businessId/assistants/:assistantId/versions/:versionId` | Tenant `owner` only | Updates draft version (`200`; non-draft -> `409 VERSION_IMMUTABLE`) |
| `POST /api/v1/businesses/:businessId/assistants/:assistantId/versions/:versionId/publish` | Tenant `owner` only | Atomically supersedes prior published version and publishes draft (`200`; non-draft / concurrent loser -> `409 VERSION_NOT_DRAFT`) |

### Verification evidence

- `npm run typecheck`: passed with 0 errors.
- `npm run build`: passed with 0 errors.
- `npm run db:migrate`: applied `0011_create_assistants.sql` and `0012_create_assistant_versions.sql` to the running Docker PostgreSQL instance (`127.0.0.1:5433`) and confirmed idempotency on second run (`Database migrations are up to date.`).
- Live PostgreSQL `npm test` (`TEST_DATABASE_URL` set): **112 passed, 0 failed, 0 skipped** (covers centralized branding, tool registry, unsafe model limits, knowledge location scopes, draft/publish/version history, concurrent publish race, failed publish rollback, DB immutability triggers, composite FK cross-tenant rejection, owner/operator RBAC, and CSRF).
- Database-independent `npm test` (`TEST_DATABASE_URL` unset): **77 passed, 0 failed, 8 skipped** (live DB suites skip cleanly when `TEST_DATABASE_URL` is unset).

Limitations: no public visitor/widget assistant endpoint exists yet (visitor installation IDs and scoped visitor sessions are planned for Phase `12.01`; `toPublicAssistantProfile` is verified by unit tests); no actual AI tool execution, Gemini model calls, document ingestion, or RAG retrieval exists yet; frontend applications (`dashboard/`, `chat-widget/`, etc.) have not been wired to `packages/branding/` yet.

## Persistent conversation/message records and retention/deletion contract (04.05) — verified approved scope

Date: 27 November 2026 (Asia/Kolkata). Implementation: **verified locally**. Learning: **not assessed**.

### Approved scope and design

Implemented roadmap step `04.05` (FR-08 persistence, deterministic ordering, pagination, idempotency, and retention/deletion contract):

- **Tenant-scoped conversations & historical version preservation**: Conversations associate with `business_id`, optional `location_id`, `assistant_id`, and the assistant's active `'published'` `assistant_version_id` at creation time via tenant-consistent composite foreign keys. Subsequent assistant publishes supersede the old version without altering existing conversations' historical `assistant_version_id`.
- **Channel & role integrity**: Staff endpoints restrict conversation creation to `'playground'` (rejecting `'visitor'` spoofing with `403 FORBIDDEN_CONVERSATION_CHANNEL`) and restrict client-submitted messages to `'user'` and `'operator'` (rejecting `'assistant'` and `'system'` role impersonation with `403 FORBIDDEN_MESSAGE_ROLE`).
- **Deterministic message ordering & idempotency**: `conversation_messages` assigns monotonic per-conversation `sequence_number` values under a `FOR UPDATE` lock on the parent conversation row and enforces unique `(business_id, conversation_id, idempotency_key)` and `(business_id, idempotency_key)` indexes so retried requests replay cleanly without duplicate writes (`409 IDEMPOTENCY_KEY_CONFLICT` if reused with a different payload).
- **Retention & deletion contract**: Tracks `retain_until` per conversation using per-business `retention_days` (`1`–`3650`, optional override on `businesses`) or `CONVERSATION_RETENTION_DAYS` (default `90`). `DELETE` performs owner-only soft-deletion (`deleted_at`), immediately hiding the conversation and its messages from all normal APIs (`404 CONVERSATION_NOT_FOUND`), while `POST .../purge` performs owner-only hard deletion from PostgreSQL (cascading `conversation_messages`).

### New and updated files

| File under `backend/` | Responsibility |
| --- | --- |
| `src/config/env.ts`, `.env.example`, `tests/env.test.mjs` | Adds validated `CONVERSATION_RETENTION_DAYS` (1–3650, default 90) |
| `database/migrations/0013_add_business_retention_policy.sql` | Adds nullable `retention_days` (`1..3650`) to `businesses` |
| `database/migrations/0014_create_conversations.sql` | Adds `assistant_versions_assistant_id_unique`, creates `conversations` with composite tenant FKs, `channel`/`status` checks, `retain_until`, `deleted_at`, idempotency index, and `set_updated_at` trigger |
| `database/migrations/0015_create_conversation_messages.sql` | Creates `conversation_messages` with composite FK to `conversations`, unique `(conversation_id, sequence_number)`, role/content/metadata checks, and idempotency index |
| `src/modules/businesses/*` & `tests/businesses.unit.test.mjs` | Adds optional `retentionDays` to business profile types, validation, repository, controller, and mounts `conversationsRouter` under `/:businessId/conversations` |
| `src/modules/conversations/*` | `conversations.types.ts`, `conversations.validation.ts`, `conversations.repository.ts`, `conversations.service.ts`, `conversations.controller.ts`, `conversations.routes.ts` |
| `tests/conversations.unit.test.mjs`, `conversations.integration.test.mjs`, `migrations.integration.test.mjs` | Unit tests for role/channel/metadata/pagination/idempotency validation; live PostgreSQL tests for persistence across restart, ordering, pagination, idempotency, historical version preservation, soft-delete hiding, owner-only purge, RBAC, CSRF, and cross-tenant isolation |

### API contracts and permissions

All conversation endpoints live under `/api/v1/businesses/:businessId/conversations`, require `onussync_session` (`401`), enforce `X-CSRF-Token` on mutations (`403`), and return `Cache-Control: no-store`.

| Method & Path | Access | Behavior & key responses |
| --- | --- | --- |
| `GET /api/v1/businesses/:businessId/conversations` | Tenant `owner` or `operator` | Lists non-deleted conversations ordered by recent activity (`limit`, `offset`, `channel`, `status`, `assistantId`, `locationId`, `pagination`) (`200`) |
| `POST /api/v1/businesses/:businessId/conversations` | Tenant `owner` or `operator` | Creates `'playground'` conversation bound to published assistant version + `retainUntil` (`201`, or `200` on identical `Idempotency-Key` replay; draft-only assistant -> `409 ASSISTANT_NOT_PUBLISHED`; `'visitor'` -> `403 FORBIDDEN_CONVERSATION_CHANNEL`) |
| `GET /api/v1/businesses/:businessId/conversations/:conversationId` | Tenant `owner` or `operator` | Returns non-deleted conversation (`200`; deleted or foreign -> `404 CONVERSATION_NOT_FOUND`) |
| `PATCH /api/v1/businesses/:businessId/conversations/:conversationId` | Tenant `owner` or `operator` | Updates status (`active`, `pending_human`, `human_active`, `closed`) (`200`) |
| `GET /api/v1/businesses/:businessId/conversations/:conversationId/messages` | Tenant `owner` or `operator` | Paginated chronological messages ordered by `sequenceNumber ASC` (`limit`, `offset`, `afterSequence`, `pagination`) (`200`) |
| `POST /api/v1/businesses/:businessId/conversations/:conversationId/messages` | Tenant `owner` or `operator` | Persists `'user'` or `'operator'` message with monotonic `sequenceNumber` and validated `metadata` (`201`, or `200` on identical `Idempotency-Key` replay; `'assistant'`/`'system'` -> `403 FORBIDDEN_MESSAGE_ROLE`; conflicting key -> `409 IDEMPOTENCY_KEY_CONFLICT`) |
| `DELETE /api/v1/businesses/:businessId/conversations/:conversationId` | Tenant `owner` only | Soft-deletes conversation (`deleted_at`), hiding it from normal APIs (`200`; operator -> `403 INSUFFICIENT_PERMISSIONS`) |
| `POST /api/v1/businesses/:businessId/conversations/:conversationId/purge` | Tenant `owner` only | Hard-deletes conversation and cascaded messages from PostgreSQL (`200`; operator -> `403 INSUFFICIENT_PERMISSIONS`) |

### Verification evidence

- `npm run typecheck`: passed with 0 errors.
- `npm run build`: passed with 0 errors.
- `npm run db:migrate`: applied `0013`–`0015` to the running Docker PostgreSQL instance (`127.0.0.1:5433`) and confirmed idempotency (`Database migrations are up to date.`) with all 15 migration checksums matching `schema_migrations`.
- Live PostgreSQL `npm test` (`TEST_DATABASE_URL` set): **119 passed, 0 failed, 0 skipped**.
- Database-independent `npm test` (`TEST_DATABASE_URL` unset): **80 passed, 0 failed, 9 skipped**.

### Phase 04 completion review & limitations

- **Completed in Phase 04 (`04.01`–`04.05`)**: Versioned PostgreSQL migrations (`0001`–`0015`), staff session auth/CSRF/lockouts/RBAC, business profile & location CRUD with timezone/hours validation and soft-archival, versioned assistant configuration/tool scopes/knowledge visibility/`packages/branding`, and persistent playground conversations/messages with deterministic ordering, pagination, idempotency, and soft-delete/purge contracts.
- **Deferred / incomplete outside Phase 04**: Automated scheduled cleanup for expired `retain_until`, `staff_sessions`, and `auth_login_attempts` rows; cross-store deletion covering Qdrant/Redis/LangGraph checkpoints once introduced; PostgreSQL Row-Level Security (`13.01`); `'visitor'` channel creation & visitor sessions (`12.01`); automated `'assistant'`/`'system'` AI message generation, RAG, and frontend screens (`05+`).

## Roadmap reorganization and secure internal service authentication (03.01) — verified approved scope

Date: 27 November 2026 (Asia/Kolkata). Implementation: **verified locally**. Learning: **not assessed**.

### Approved scope and design

1. **Roadmap reorganization (`docs/ROADMAP.md`, `docs/JD_COVERAGE.md`)**: Reordered remaining unstarted work after Phase `04` using a backend-first, AI-first, dependency-based sequence so internal auth, LLM integration (`Phase 03`), document ingestion (`Phase 05`), RAG/Qdrant (`Phase 06`), LangChain/tools (`Phase 07`), LangGraph/HITL (`Phase 08`), Redis/MCP/webhooks (`Phase 09`), and LangSmith/eval/analytics (`Phase 10`) precede frontend applications (`Phase 11` React dashboard, `Phase 12` chat widget/demo). Preserved all `FR-01`–`FR-16` requirements, tech stack, verified steps, and pending statuses without marking incomplete items complete.
2. **Authentication mechanism (`HS256` short-lived signed JWT)**: Selected dependency-free `HMAC-SHA256` JWTs signed by Node.js (`node:crypto`) and verified in Python (`hmac`, `hashlib`, `base64`, `json`), avoiding third-party JWT libraries and keeping zero new runtime dependencies. A static pre-shared bearer key was rejected because short-lived signed tokens enforce bounded expiration (`iat`/`exp`), issuer/audience binding (`iss`/`aud`), unique token IDs (`jti`), and per-route scopes (`scope`) while preparing directly for scoped tenant/delegation claims in `03.02`.
3. **Configuration validation (fail-closed)**: Both services require `AI_INTERNAL_AUTH_SECRET` (>= 32 characters, no surrounding whitespace, no hardcoded default in code), `AI_INTERNAL_AUTH_ISSUER` (default `onussync-backend`), and `AI_INTERNAL_AUTH_AUDIENCE` (default `onussync-ai-backend`). Node.js bounds `AI_INTERNAL_AUTH_TOKEN_TTL_SECONDS` (`1`–`300`, default `60`); FastAPI bounds `AI_INTERNAL_AUTH_MAX_TTL_SECONDS` (`1`–`3600`, default `300`) and `AI_INTERNAL_AUTH_CLOCK_SKEW_SECONDS` (`0`–`60`, default `0`), storing the secret as Pydantic `SecretStr` and rejecting invalid configs without echoing secret values.
4. **Protected boundary and safe errors**: FastAPI keeps `GET /api/v1/health` as unauthenticated process liveness and adds `GET /api/v1/internal/health` protected by `require_internal_service_auth("ai:health")` returning `Cache-Control: no-store`. Missing, malformed, unsupported-algorithm (`alg != HS256` / `typ != JWT`), invalid-signature, invalid-claim, or expired tokens return `401` (`WWW-Authenticate: Bearer`) without secret/token leakage; valid tokens missing the required scope return `403`. Node.js `getAiHealth()` signs a fresh `ai:health` token for `/api/v1/internal/health` and maps upstream `401`/`403` to `502 AI_SERVICE_AUTH_FAILED` without logging tokens or upstream error bodies.

### New and updated files

| File | Responsibility |
| --- | --- |
| `docs/ROADMAP.md` & `docs/JD_COVERAGE.md` | Reorganized remaining phases to backend-first, AI-first order and synchronized step references |
| `backend/src/config/env.ts` & `backend/.env.example` | Validated `AI_INTERNAL_AUTH_SECRET`, `AI_INTERNAL_AUTH_TOKEN_TTL_SECONDS`, `AI_INTERNAL_AUTH_ISSUER`, `AI_INTERNAL_AUTH_AUDIENCE` |
| `backend/src/integrations/ai/ai-auth.ts` | Pure `signInternalServiceToken` and `createInternalServiceToken` using `node:crypto` `HS256` |
| `backend/src/integrations/ai/ai-client.ts` & `backend/src/modules/ai/ai.routes.ts` | Sends signed `Bearer` token to `/api/v1/internal/health`, handles `401`/`403` safely as `502 AI_SERVICE_AUTH_FAILED`, sets `Cache-Control: no-store` |
| `ai-backend/app/core/config.py` & `ai-backend/.env.example` | Validates `AI_INTERNAL_AUTH_SECRET` (`SecretStr`, >= 32 chars), issuer, audience, max TTL, and clock skew |
| `ai-backend/app/core/internal_auth.py` | Constant-time HS256 JWT verification (`verify_internal_service_token`) and `require_internal_service_auth` FastAPI dependency |
| `ai-backend/app/api/v1/internal.py` & `ai-backend/app/api/v1/router.py` | Mounts scope-protected `GET /api/v1/internal/health` under `/api/v1` |
| `backend/tests/ai.test.mjs`, `env.test.mjs`, `app.test.mjs`, `server.test.mjs`, and existing test envs | Cross-language HS256 fixture test, signer unit tests, `401`/`403` safe-error tests, config/startup secret checks, and live Node-to-FastAPI subprocess test |
| `ai-backend/tests/test_internal_auth.py`, `test_config.py`, `test_application.py` | Config validation tests, HS256 edge-case tests (`alg: none`, boolean timestamps, TTL/expiry, clock skew, scopes, secret redaction), cross-language fixture verification, and live HTTP tests |

### Commands and verification evidence

- `cd ai-backend && .venv/bin/python -m unittest discover -s tests -v`: **27 passed, 0 failed** (covers config validation, `SecretStr` redaction, `HS256` verification, expiration/clock skew, scopes, cross-language fixture matching Node.js output, and live HTTP `/api/v1/internal/health` allow/deny checks).
- `cd ai-backend && .venv/bin/python -m compileall -q app tests && .venv/bin/python -m pip check`: passed (`No broken requirements found.`).
- `cd backend && npm run typecheck && npm test`: **84 passed, 0 failed, 9 skipped** (database-independent run with `TEST_DATABASE_URL` unset; includes cross-language JWT fixture verification, upstream `401`/`403` safe handling, startup rejection of invalid/missing secrets, and live subprocess Node.js -> FastAPI authenticated health and mismatched-secret rejection).

Limitations: `TEST_DATABASE_URL` was not set during this step's run, so the 9 existing PostgreSQL integration tests skipped as designed (no database schema or PostgreSQL integration code changed in this step); Node-to-FastAPI transport uses local loopback HTTP (TLS is deferred until deployment); no `jti` replay cache is enforced in FastAPI yet (acceptable for stateless short-lived health/read checks; mutating callbacks/approvals use idempotency keys and replay protection in later phases); no correlation IDs or AI chat payload contracts exist yet (scheduled next in `03.02`).

## Private AI contract, correlation IDs, scoped delegation, deadlines, and async boundaries (03.02) — verified approved scope

Date: 27 November 2026 (Asia/Kolkata). Implementation: **verified locally**. Learning: **not assessed**.

### Approved scope and design

1. **Request correlation IDs (`01.02` completed)**: Added `backend/src/middlewares/request-id.ts` (`X-Request-Id` validated against `^[A-Za-z0-9._-]{8,64}$`, generating a UUIDv4 otherwise) and `ai-backend/app/middleware/request_id.py` (pure ASGI middleware binding `request_id` to `request.state`, `contextvars` log filter, and response headers, with fallback propagation in `unhandled_exception_handler`). Node.js propagates `X-Request-Id` on all FastAPI requests.
2. **Shared Node-to-FastAPI AI contract (`02.02` & `03.02` completed)**: Added canonical fixture `packages/ai-contract/respond-v1.fixture.json`, strict TypeScript/runtime validator `backend/src/integrations/ai/ai-contract.ts`, and strict Pydantic schemas `ai-backend/app/modules/respond/schemas.py` (`extra="forbid"`, `StrictInt`/`StrictBool`/`StrictFloat`, camelCase serialization). Rejects schema drift, `staff_only` knowledge on `visitor` channel, and message counts exceeding `maxContextMessages`. `POST /api/v1/internal/respond` returns `mode: "mock"`, `grounded: false` without calling Gemini.
3. **Scoped delegation binding**: Extended `backend/src/integrations/ai/ai-auth.ts` to embed `AiDelegationClaims` (`businessId`, `locationId`, `assistantId`, `assistantVersionId`, `conversationId`, `channel`, `actorType`, `actorId`, `allowedTools`, `allowedKnowledgeScopes`, `knowledgeLocationScope`, `knowledgeLocationIds`) inside the signed `HS256` JWT (`scope: "ai:respond"`). FastAPI `verify_delegation_binding` rejects tokens missing `delegation` or requests whose body context differs from the signed claims with HTTP `403`, mapped safely in Node.js to `502 AI_SERVICE_DELEGATION_REJECTED`.
4. **Deadlines, body limits, and async boundaries (`02.03` completed)**: Node.js `requestAiResponse()` computes a bounded `timeoutMs` (`1..AI_SERVICE_TIMEOUT_MS`), sets `deadlineAtMs`, passes `AbortSignal.timeout(timeoutMs)`, and caps token TTL to the hop budget. FastAPI `MaxBodySizeMiddleware` enforces `AI_INTERNAL_MAX_REQUEST_BYTES` (`262144` default) across both `Content-Length` and streamed/chunked bodies (`413`), enforces `remaining_ms` (`504` if expired, `422` if > `AI_INTERNAL_MAX_DEADLINE_MS`), and isolates CPU-bound work (`run_cpu_bound` via `anyio.to_thread.run_sync`) and deadline cancellation (`run_with_deadline` via `asyncio.wait_for`) in `ai-backend/app/core/async_boundary.py`.

### New and updated files

| File | Responsibility |
| --- | --- |
| `packages/ai-contract/respond-v1.fixture.json` | Canonical v1.0 request/response fixture shared by Node.js and Python tests |
| `backend/src/middlewares/request-id.ts`, `app.ts`, `error-handler.ts`, `types/express.d.ts` | Validates/generates `X-Request-Id`, sets response header, and attaches `requestId` to 500 error logs |
| `backend/src/integrations/ai/ai-contract.ts`, `ai-auth.ts`, `ai-client.ts`, `modules/ai/ai.routes.ts` | Strict `respond-v1` contract validation, delegation JWT signing, bounded deadlines, correlation propagation, and safe `401`/`403`/`504` mappings |
| `ai-backend/app/core/config.py` & `ai-backend/.env.example` | Adds validated `AI_INTERNAL_MAX_REQUEST_BYTES` (`1024..1048576`) and `AI_INTERNAL_MAX_DEADLINE_MS` (`100..300000`) |
| `ai-backend/app/middleware/request_id.py`, `body_limit.py`, `core/logging.py`, `core/exceptions.py`, `main.py` | ASGI `X-Request-Id` propagation + log context filter, streaming-safe `413` body-size enforcement, and safe `500` correlation header |
| `ai-backend/app/core/async_boundary.py` & `app/modules/respond/*` | Thread-pool offloading (`run_cpu_bound`), deadline cancellation (`run_with_deadline`), strict schemas, and non-LLM mock responder |
| `ai-backend/app/core/internal_auth.py` & `app/api/v1/internal.py` | Parses/validates `delegation` claims, enforces `verify_delegation_binding`, and exposes `POST /api/v1/internal/respond` |
| `backend/tests/ai.test.mjs`, `app.test.mjs` & `ai-backend/tests/test_ai_contract_and_async.py`, `test_application.py`, `test_config.py` | Cross-language contract/delegation/correlation/deadline/body-limit/async-boundary tests and live Node-to-FastAPI integration verification |

### Commands and verification evidence

- `cd ai-backend && .venv/bin/python -m unittest discover -s tests -v && .venv/bin/python -m compileall -q app tests && .venv/bin/python -m pip check`: **35 passed, 0 failed** (`compileall` and `pip check` clean; verifies shared fixture, `X-Request-Id` across `200`/`413`/`500`, missing/forged delegation `403`, schema drift `422`, expired/excessive deadlines `504`/`422`, `Content-Length` & chunked `413`, worker-thread CPU offloading without event-loop starvation, and coroutine deadline cancellation).
- `cd backend && npm run typecheck && TEST_DATABASE_URL='postgresql://<user>:<password>@127.0.0.1:5433/onusai' npm test`: **126 passed, 0 failed, 0 skipped** (all unit tests, live PostgreSQL `04.01`–`04.05` regression tests, shared contract fixture validation, delegation/timeout/error mapping tests, and live Node-to-FastAPI end-to-end `respond` + forged-delegation checks passed).

Limitations: `POST /api/v1/internal/respond` returns deterministic `mode: "mock"`, `grounded: false` responses until Gemini integration (`03.03`); backend conversation turn orchestration linking persisted `assistants` and `conversations` tables to `requestAiResponse()` is scheduled in `03.03`; transport remains local loopback HTTP without TLS until deployment.

## Direct Google Gemini integration and Node.js turn orchestration (03.03) — verified approved scope

Date: 27 November 2026 (Asia/Kolkata). Implementation: **verified locally (mocked SDK)**. Learning: **not assessed**.

### Approved scope and design

1. **Configuration & SDK pinning (`ai-backend/requirements.txt`, `app/core/config.py`, `.env.example`)**: Pinned `google-genai==3.6.1` and its installed runtime dependencies in `requirements.txt`. Added `AI_GENERATION_MODE` (`"gemini" | "mock"`, default `"gemini"`), `AI_GEMINI_API_KEY` (`SecretStr`, required when `gemini` mode is active, validated without echoing input), and `AI_GEMINI_MODEL` (default `"gemini-2.5-flash-lite"`, free-tier-eligible supported model). Mock mode remains explicit (`AI_GENERATION_MODE=mock`) for deterministic offline testing.
2. **Async Gemini adapter & prompt versioning (`app/integrations/gemini_client.py`, `app/modules/respond/prompts.py`, `service.py`)**: Uses `google.genai.Client(api_key=...).aio.models.generate_content(...)` with versioned prompts (`PROMPT_VERSION = "respond-v1"`), system instructions, chronological `types.Content` conversation mapping (`user`/`model` + labeled `[Operator note]`/`[System note]`), `temperature`, `max_output_tokens`, and token usage extraction (`inputTokens`, `outputTokens`, `totalTokens`). Handles prompt/candidate safety blocks via safe abstention (`status: "abstained"`, returning the assistant's `fallbackMessage`), maps rate limits (`429`), upstream timeouts (`408`/`504`), API/auth errors (`502`), and unexpected client errors safely without exposing API keys or conversation text in logs or HTTP responses.
3. **Node.js turn orchestration (`backend/src/modules/conversations/*`, `integrations/ai/*`)**: Added `POST /api/v1/businesses/:businessId/conversations/:conversationId/turns` (`requireAuth`, `requireCsrf`, `requireTenantMembership(['owner', 'operator'])`). Validates `{ content, idempotencyKey? }` strictly while rejecting any client-supplied `role` (`403 FORBIDDEN_MESSAGE_ROLE`), verifies `channel === 'playground'` and `status === 'active'` (`409 CONVERSATION_NOT_ACTIVE` during `pending_human`/`human_active`/`closed`), loads the conversation's **bound `assistantVersionId`** (preserving historical version consistency after newer assistant publishes) and bounded context messages (`<= maxContextMessages`), calls `requestAiResponse()`, maps upstream `429` to `429 AI_RATE_LIMITED`, and atomically persists both `'user'` and `'assistant'` messages (`authorUserId = null` for assistant) with paired SHA-256 idempotency keys (`turn-reply:<sha256>`) inside a single `FOR UPDATE` transaction.

### New and updated files

| File | Responsibility |
| --- | --- |
| `ai-backend/requirements.txt` | Pins `google-genai==3.6.1` and its installed dependencies |
| `packages/ai-contract/respond-v1.fixture.json` & `backend/src/integrations/ai/ai-contract.ts` | Extends `AiRespondResponse` with `mode` (`'mock' \| 'gemini'`), `model`, and `promptVersion` |
| `backend/src/integrations/ai/ai-client.ts` | Maps upstream `429` cleanly to `429 AI_RATE_LIMITED` |
| `backend/src/modules/conversations/*` | Adds `validateCreateTurnInput`, `findTurnByIdempotencyKey`, `findRecentTurnContextMessages`, `persistConversationTurn`, `executeStaffConversationTurn`, and `POST .../turns` |
| `ai-backend/app/core/config.py`, `ai-backend/.env.example`, `ai-backend/app/main.py` | Adds validated Gemini settings, initializes `GeminiAdapter` in `gemini` mode, and closes `client.aio` cleanly on shutdown |
| `ai-backend/app/modules/respond/prompts.py`, `schemas.py`, `service.py`, `app/api/v1/internal.py` | Versioned prompt builder, `GeminiAdapter` wiring, explicit `mock` vs `gemini` routing |
| `ai-backend/app/integrations/gemini_client.py` | Async `google-genai` wrapper with usage capture, safety abstention, and key-safe error handling |
| `ai-backend/tests/test_gemini_adapter.py`, `test_config.py`, `test_application.py`, `test_internal_auth.py`, `test_ai_contract_and_async.py` | Offline mocked-SDK tests for generation, usage, safety blocks, 429/502/504 errors, deadlines, secret redaction, and explicit mock mode |
| `backend/tests/ai.test.mjs`, `conversations.unit.test.mjs`, `conversations.integration.test.mjs` | Unit and live PostgreSQL integration tests for `POST .../turns`, idempotent replay/conflict, version consistency, context history, status gating, failure atomicity, and role/tenant protection |

### Commands and verification evidence

- `cd ai-backend && .venv/bin/python -m unittest discover -s tests -v && .venv/bin/python -m compileall -q app tests && .venv/bin/python -m pip check`: **42 passed, 0 failed** (`compileall` and `pip check` clean).
- `cd backend && npm run typecheck && TEST_DATABASE_URL='postgresql://<user>:<password>@127.0.0.1:5433/onusai' npm test`: **128 passed, 0 failed, 0 skipped** (all unit tests, live PostgreSQL `04.01`–`04.05` regressions, and new `POST .../turns` integration checks passed).
- Environment check (keys only, values unread): `ai-backend/.env` is not present on disk yet (`backend/.env` currently contains `GEMINI_API_KEY`, `AI_GEMINI_MODEL`, `AI_INTERNAL_AUTH_SECRET`). `ai-backend/.env` must be populated with `AI_GEMINI_API_KEY`, `AI_GEMINI_MODEL`, and `AI_INTERNAL_AUTH_SECRET` before running the live smoke test in Step `03.04`.

Limitations: All Gemini tests in Step `03.03` used a mocked `google-genai` async client; no live call to the Google Gemini API was performed (reserved for Step `03.04`). Answers remain ungrounded (`grounded: false`) until RAG is implemented in Phase `06`. No Git commit or push was performed.

## Live Gemini smoke test and baseline (03.04) — verified approved scope

Date: 27 November 2026 (Asia/Kolkata). Implementation: **verified locally against live Gemini API and PostgreSQL**. Learning: **not assessed**.

### Environment & model verification

- Verified `ai-backend/.env` (`AI_GENERATION_MODE=gemini`, `AI_GEMINI_MODEL=gemini-3.5-flash-lite`, `AI_GEMINI_API_KEY` length `53`, `AI_INTERNAL_AUTH_SECRET`) and `backend/.env` (`DATABASE_URL`, `AI_SERVICE_URL`, `AI_INTERNAL_AUTH_SECRET`, no `GEMINI_API_KEY` present) without printing secrets.
- Confirmed `AI_INTERNAL_AUTH_SECRET` matches across both `.env` files and `client.models.get(model="gemini-3.5-flash-lite")` resolved `models/gemini-3.5-flash-lite` (`Gemini 3.5 Flash Lite`).

### Synthetic end-to-end baseline (`Node.js → FastAPI → Gemini → PostgreSQL`)

Executed against compiled `backend/dist/server.js`, real `uvicorn app.main:app` (reading `ai-backend/.env` in live `gemini` mode with zero mock fallback), and an isolated migrated PostgreSQL schema (`0001`–`0015`) using synthetic business `"Northstar Dental Clinic"` and synthetic assistant `"Northstar Assistant"` (`promptVersion: respond-v1`, `temperature: 0.2`, `maxOutputTokens: 160`):

| Check | Result | Model / Mode | HTTP Latency | AI Latency | Tokens (In / Out / Total) |
| --- | --- | --- | --- | --- | --- |
| Authenticated health (`GET /api/v1/ai/health`) | `200 {"status":"ok"}` | Service auth only | — | — | `0 / 0 / 0` |
| Turn 1 (`POST .../turns`, `Idempotency-Key: smoke-turn-1`) | `201`, coherent ungrounded reply acknowledging no live documents/records (`grounded: false`) | `gemini-3.5-flash-lite` (`gemini`) | `2937` ms | `2906` ms | `188 / 35 / 223` |
| Idempotent replay (Turn 1 repeated) | `200`, `idempotentReplay: true`, same message IDs, `0` Gemini calls | Cached DB replay | — | — | `0 / 0 / 0` |
| Turn 2 (`POST .../turns`, context recall) | `201`, recalled synthetic visitor `"Riley"` and `"Northstar Dental Clinic"` from persisted Turn 1 history (`grounded: false`) | `gemini-3.5-flash-lite` (`gemini`) | `672` ms | `638` ms | `243 / 24 / 267` |
| PostgreSQL persistence | `4` rows in `conversation_messages` (`seq 1..4`: `user`, `assistant`, `user`, `assistant`) | — | — | — | — |
| Error handling & privacy | Unauth FastAPI `401`; stopped FastAPI → Node `503 AI_SERVICE_UNAVAILABLE` with `0` orphan DB rows; zero secret leakage in logs/DB | — | — | — | — |

*(Answers are explicitly ungrounded (`grounded: false`) until document ingestion and RAG are implemented in Phases `05`–`06`.)*

### Phase 03 completion review & limitations

- **Completed in Phase 03 (`03.01`–`03.04`)**: Scoped `HS256` internal service auth (`03.01`), `respond-v1` cross-language contract, `X-Request-Id` correlation propagation (`01.02`), delegation binding, deadlines/body limits, FastAPI async boundaries (`02.02`–`02.03`, `03.02`), direct async `google-genai` integration + Node.js `POST .../turns` persistence (`03.03`), and live `gemini-3.5-flash-lite` synthetic baseline (`03.04`).
- **Limitations**: Live test covered 2 synthetic turns on `gemini-3.5-flash-lite`; no RAG grounding, document uploads, tool calling, LangChain, LangGraph, Redis caching, LangSmith tracing, or frontend UI exists yet. Temporary test schema was dropped after verification; no `dashboard/` files, commits, or pushes were made.

## Upcoming phases and next proposed step

Phase `03` (`03.01`–`03.04`) is verified complete. Await user review and approval before any Git commit/push or starting **Phase `05` — Step `05.01`** (Text/Markdown upload metadata and bounded text storage with version/state transitions, `FR-05`). No further feature, commit, or push is authorized by this record.

| Phase | Planned work | Current state |
| --- | --- | --- |
| 01 | Node.js business-service foundation and tests | Verified (`01.01`–`01.03` complete) |
| 02 | FastAPI AI-service foundation and tests | Verified (`02.01`–`02.03` complete) |
| 04 | PostgreSQL, authentication/tenancy, business/location/assistant settings, branding, and conversations | Steps `04.01`–`04.05` (migrations `0001`–`0015`) verified; automated retention purge job, cross-store cleanup, RLS (`13.01`), and visitor sessions (`12.01`) remain deferred |
| 03 | Internal service auth, AI contracts, and Google Gemini | **Verified complete** (`03.01`–`03.04` verified, including live `gemini-3.5-flash-lite` baseline; answers labeled `grounded: false` until Phase `06`) |
| 05 | Documents, ingestion, and chunking (Backend + AI Worker) | Not started; steps `05.01`–`05.03` |
| 06 | Embeddings, Qdrant, semantic search, and grounded RAG | Not started; steps `06.01`–`06.04` |
| 07 | LangChain, deterministic business operations, and tool calling | Not started; steps `07.01`–`07.04` |
| 08 | LangGraph, memory, and human-in-the-loop approvals (Backend) | Not started; steps `08.01`–`08.03` |
| 09 | Redis, semantic caching, MCP, and asynchronous webhooks | Not started; steps `09.01`–`09.04` |
| 10 | LangSmith, evaluation, guardrails, and backend analytics | Not started; steps `10.01`–`10.04` |
| 11 | React dashboard and staff interfaces (Frontend) | Not verified; separately appearing `dashboard/` scaffold must be inspected at `11.01`; steps `11.01`–`11.03` |
| 12 | Chat widget and synthetic demo website (Frontend) | Not started; steps `12.01`–`12.03` |
| 13 | Consolidated testing/security, Docker, GitHub Actions, deployment readiness, and MVP review | Not started; steps `13.01`–`13.05` |
| 14 | Optional public website, super-admin, and commercial capabilities | Deferred; separate approval required |
| 15 | Optional multi-agent, long-term memory, real integrations, and justified fine-tuning experiments | Deferred; separate approval required |

Use [ROADMAP.md](ROADMAP.md) for individual step dependencies and checks. No implementation task is authorized by this progress record.

## Learning status and evidence policy

All topic learning remains **not assessed** unless the developer demonstrates it. Suggested progression: not assessed → studied → demonstrated. Implementation has a separate progression: not started → in progress → verified, with optional work explicitly deferred.

After an implementation step, record: what the developer can explain, a design alternative/tradeoff they discussed, and an exercise or debugging walkthrough they completed. Do not infer learning completion from generated files, passing tests, or time spent.

## Approval boundary

Stop after reporting the verified Step `03.04` live baseline and Phase `03` completion review. Await explicit user approval for Git commit/push or starting Phase `05` (`05.01` — Text/Markdown upload metadata and bounded text storage with version/state transitions). Completing Phase `03` does not authorize Phase `05`.

## Project Rebranding to OnusSync — verified approved scope

Date: 27 November 2026 (Asia/Kolkata). Scope: **branding-only rename from OnusAI to OnusSync**.

### Summary of changes

- **Centralized branding (`packages/branding/branding.json`)**: Updated `productName` and `shortName` to `OnusSync`, `tagline` to `AI-Powered Multi-Tenant Business Engagement Platform`, and `attributionText` to `Powered by OnusSync`.
- **Root & infrastructure config (`AGENTS.md`, `README.md`, `compose.yaml`)**: Updated project naming, naming standards (`onussync`, `ONUSSYNC_`, `onussync@gmail.com`), and default Docker Compose PostgreSQL service credentials (`POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`).
- **Node.js backend (`backend/`)**: Updated `AI_INTERNAL_AUTH_ISSUER` (`onussync-backend`), `AI_INTERNAL_AUTH_AUDIENCE` (`onussync-ai-backend`), cookie names (`onussync_session`, `onussync_csrf`), `.env.example`, and all unit/integration tests including the cross-language HS256 JWT fixture.
- **Python AI backend (`ai-backend/`)**: Updated `AI_APP_NAME` (`OnusSync AI Service`), `internal_auth_issuer`, `internal_auth_audience`, `.env.example`, and all unit tests including the cross-language HS256 JWT fixture.
- **Staff dashboard (`dashboard/`)**: Updated `index.html` title (`OnusSync Dashboard`), storage/event keys (`onussync_active_business_id`, `onussync_dashboard_theme`, `onussync:guarded-action`, `onussync_csrf`), CSS/README/architecture docs, and unit/browser test files.
- **Documentation & datasets (`docs/`, `Resources/OnusAI_Complete_Datasets/README.md`)**: Updated project documentation headers/prose and dataset README branding while preserving all SQL migrations (`0001`–`0015`), fictional hotel names, tenant IDs, and dataset records.

### Verification results

- `cd backend && npm run db:migrate`: **Database migrations are up to date** against `onussync` (`0001`–`0015` verified with matching checksums).
- `cd backend && set -a && . ./.env && set +a && export TEST_DATABASE_URL="$DATABASE_URL" && npm run typecheck && npm test`: **128 passed, 0 failed, 0 skipped** (includes live PostgreSQL integration tests on `onussync` and live Node.js-to-FastAPI internal auth).
- `cd ai-backend && .venv/bin/python -m unittest discover -s tests -v`: **42 passed, 0 failed**.
- `cd dashboard && npm run build && npm run lint && npm test`: **build clean, lint clean, 47 passed, 0 failed**.

### Compatibility & intentionally retained references

- **PostgreSQL & Docker Compose alignment**: Created role `onussync` (`SUPERUSER`) and database `onussync` via `CREATE DATABASE onussync WITH TEMPLATE onusai OWNER onussync` on the running PostgreSQL instance (`127.0.0.1:5433`) without deleting volumes or losing data. The original `onusai` role and `onusai` database remain intact, `onussync` preserves all 15 `schema_migrations` rows and existing records, and `backend/.env` `DATABASE_URL` now points to `postgresql://onussync:onussync_local_dev@127.0.0.1:5433/onussync`.
- **Internal auth & branding consistency**: `backend` and `ai-backend` share `onussync-backend` (issuer), `onussync-ai-backend` (audience), and matching `AI_INTERNAL_AUTH_SECRET`. Cookie names (`onussync_session`, `onussync_csrf`), dashboard storage/event keys (`onussync_*`), and `packages/branding/branding.json` (`OnusSync`) are aligned.
- **Completed roadmap steps & current phase**: Phases `00` (`00.01`–`00.03`), `01` (`01.01`–`01.03`), `02` (`02.01`–`02.03`), `03` (`03.01`–`03.04`), and `04` (`04.01`–`04.05`, migrations `0001`–`0015`) are verified complete. The next proposed step is **Phase `05` — Step `05.01`** (awaiting explicit user approval).
- `docs/PROGRESS.md`: Historical command-log lines (such as earlier `TEST_DATABASE_URL` / `DATABASE_URL` examples and the historical note about the initial `# onusAi` line in `README.md`) remain as historical records.
- `Resources/OnusAI_Complete_Datasets/` directory name and `Resources/OnusAI_Complete_Datasets.zip` archive: Untracked external dataset bundle retained intact.

### Remaining manual tasks

- Rename the physical project root directory (`OnusAi` → `OnusSync` or `onussync`) if desired.
- Rename the GitHub repository (`https://github.com/onussync/OnusSync.git` is already configured as `origin`).
- Run Docker commands locally as a user with Docker socket access when needed (e.g., `docker compose ps`, `docker compose up -d`, or `docker compose logs postgres`).
- Review and stage/commit the changes when ready.

### Final rebranding verification pass

- **PostgreSQL & Docker Compose**: Verified live connection to `onussync` as role `onussync` on `127.0.0.1:5433` with all `15` `schema_migrations` (`0001_create_users.sql`–`0015_create_conversation_messages.sql`) preserved; `onusai` role and database remain intact without volume deletion. Docker CLI (`docker ps -a`, `docker volume ls`, `docker compose ps`) could not run in this session due to `/var/run/docker.sock` permission denial.
- **Repository-wide reference check**: Case-insensitive `grep` for `onusai`, `onus_ai`, and `onus-ai` (excluding `.git`, `node_modules`, `.venv`, `dist`, `Resources/`, and `__pycache__`) found only intentional historical notes in `docs/PROGRESS.md`.
- **Regression suites**:
  - `backend`: `npm run db:migrate` (`Database migrations are up to date.`), `npm run typecheck` (clean), `npm test` with `TEST_DATABASE_URL="$DATABASE_URL"` (**128 passed, 0 failed, 0 skipped**).
  - `ai-backend`: `.venv/bin/python -m unittest discover -s tests -v` (**42 passed, 0 failed**), `compileall` clean, `pip check` (`No broken requirements found.`).
  - `dashboard`: `npm run build` clean, `npm run lint` clean, `npm test` (**47 passed, 0 failed**). Dashboard browser tests (`dashboard/tests/browser/`) were not executed in this pass.
