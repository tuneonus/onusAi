# OnusAI Progress Record

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
| Node.js business service | Foundation verified; now includes the approved native-fetch AI client and GET `/api/v1/ai/health`. No authentication, persistence, or business/AI workflows. |
| FastAPI service | Foundation verified; its existing `/api/v1/health` is called by Node.js. No Python source changes were required for basic communication. |
| PostgreSQL, Qdrant, Redis | Docker containers running and readiness checks passed as reported by the user before this step; no application integration added or readiness checks repeated here |
| Node.js-to-FastAPI communication | Local health contract verified with configurable URL/timeout, runtime response validation, safe errors, and real communication between both backend processes |
| Gemini, LangChain, LangGraph, MCP, LangSmith | Not integrated; no live-model calls, agents, embeddings, traces, or experiments |
| Business/AI features | Not implemented: no knowledge ingestion, RAG, widget, conversations, leads, bookings, approvals, or analytics |
| Centralized branding configuration | Backend product name centralized in `backend/src/config/branding.ts`; AI service title centralized in `Settings.app_name`. Cross-application shared configuration remains planned for 04.04 |
| Tests | 32 Node.js tests passed after the communication change. The unchanged FastAPI foundation has 16 tests recorded in its earlier step; actual cross-service communication verified separately below. |
| Docker, CI/CD, deployment | Existing `compose.yaml` and running data-service containers preserved; application containerization, CI/CD, and public deployment not implemented in this step |
| Dependencies | Existing Node.js/Python dependencies reused; no dependency installed or manifest changed by the communication step. Earlier Python `pip check` passed. Dashboard dependencies remain unverified. |

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

## Upcoming phases and next proposed step

The Node.js and FastAPI foundations and basic local health communication are verified in their respective records above. Await user review and approval of the next scope. Remaining roadmap items include request correlation IDs/general request validation, the validated mock AI request/response contract, and authenticated service communication. No further feature or model integration is authorized by this record.

| Phase | Planned work | Current state |
| --- | --- | --- |
| 01 | Node.js business-service foundation and tests | Approved foundation verified: 01.01 complete; 01.02 error/routing/shutdown portions complete with correlation IDs/general request validation pending; 01.03 foundation tests verified using the built-in runner |
| 02 | FastAPI AI-service foundation and tests | 02.01 verified with explicitly requested errors/logging/lifespan and proportionate tests; mock contract 02.02 and remaining async-boundary work 02.03 not implemented |
| 03 | Private backend integration and Gemini baseline | Basic health communication/timeout/error handling verified as the approved subset of 03.01; authentication, delegation, correlation IDs, and Gemini steps remain unimplemented |
| 04 | PostgreSQL, authentication/tenancy, business/location/assistant settings, branding, and conversations | Not started; steps 04.01–04.05 |
| 05 | React dashboard and staff playground | Not verified; separately appearing scaffold must be inspected at the approved step; steps 05.01–05.03 |
| 06 | Document lifecycle, durable ingestion jobs, and chunking | Not started; steps 06.01–06.03 |
| 07 | Embeddings, Qdrant, semantic search, and grounded RAG | Not started; steps 07.01–07.05 |
| 08 | LangChain, lead/slot operations, function/tool proposals | Not started; steps 08.01–08.04 |
| 09 | LangGraph, short-term memory, approvals, bookings, and handoff | Not started; steps 09.01–09.04 |
| 10 | Redis, semantic caching, MCP, REST/webhook asynchronous integration patterns | Not started; steps 10.01–10.04 |
| 11 | LangSmith, evaluation, guardrail improvements, and basic analytics | Not started; steps 11.01–11.04 |
| 12 | Scoped visitor API, widget, and synthetic demo site | Not started; steps 12.01–12.03 |
| 13 | Consolidated testing/security, Docker, GitHub Actions, deployment readiness, and MVP review | Not started; steps 13.01–13.05 |
| 14 | Optional public website, super-admin, and commercial capabilities | Deferred; separate approval required |
| 15 | Optional multi-agent, long-term memory, real integrations, and justified fine-tuning experiments | Deferred; separate approval required |

Use [ROADMAP.md](ROADMAP.md) for individual step dependencies and checks. No implementation task is authorized by this progress record.

## Learning status and evidence policy

All topic learning remains **not assessed** unless the developer demonstrates it. Suggested progression: not assessed → studied → demonstrated. Implementation has a separate progression: not started → in progress → verified, with optional work explicitly deferred.

After an implementation step, record: what the developer can explain, a design alternative/tradeoff they discussed, and an exercise or debugging walkthrough they completed. Do not infer learning completion from generated files, passing tests, or time spent.

## Approval boundary

Stop after reporting the verified basic service-communication step. Await explicit user approval for the next scope, additional dependencies, authentication/persistence/model integration, frontend changes, or any commit/push. Completing this step does not authorize the next one.
