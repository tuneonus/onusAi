# OnusAI Frontend Architecture & Design Standards

This document defines the architecture, design system standards, folder responsibilities, coding conventions, and incremental implementation plan for the OnusAI staff dashboard (`dashboard/`).

> **Latest implementation record:** [Section 11](#11-f7-conversations-and-real-gemini-playground) records F7 completion and live verification. **F6 implementation record:** [Section 10](#10-f6-ai-assistant-configuration-and-publishing) contains the latest assistant status and checks. **F5 record:** [Section 9](#9-f5-current-implementation-and-verification) records the fresh F5 implementation and verified architecture. It supersedes the earlier feature numbering, tooling descriptions, token examples, and verification counts below. Earlier workspace edits have been preserved.

## 1. Guiding Principles

- **Backend-truthful UI**: Integrate directly with the Node.js Express API (`/api/v1`). Never invent fake business, member, assistant, or conversation data or fake analytics statistics.
- **Session & CSRF preservation**: Authenticate via `HttpOnly` cookie sessions (`onusai_session`) with `credentials: 'include'` and attach `X-CSRF-Token` (sourced from `session.csrfToken` / `onusai_csrf` cookie) on all mutating requests (`POST`, `PATCH`, `PUT`, `DELETE`).
- **Centralized branding**: Read platform branding from `packages/branding/branding.json` (and verify/sync via `GET /api/v1/branding`) instead of scattering product-name literals across components.
- **Commercial AI SaaS clarity**: Keep customer-facing navigation free of internal engineering/phase labels (e.g. "Step F4"), separate developer diagnostics (`/diagnostics`) from user-facing paths.
- **Progressive enhancement**: Implement one feature step at a time; never initialize applications, install dependencies, create folders, or implement future features speculatively.
- **Modular architecture**: Feature-based modular architecture with self-contained `features/` folders; each feature owns its API, types, hook, and component.
- **Design tokens everywhere**: All visual properties (colors, radii, shadows, spacing) use CSS custom properties (`var(--token)`) defined in `dashboard/src/styles/`. Never hardcode hex values or numeric literals in component styles.
- **Role-based UI**: Backend enforces `requireTenantMembership(['owner'])` on `GET /api/v1/businesses/:businessId/members`; UI mirrors this with equivalent checks using `activeMembership.role`.
- **Design tokens used throughout**: All styling uses `var(--token)` references, no hardcoded colors/radii/shadows in components.

## 2. Folder Responsibilities

| Folder | Owner |
|--------|-------|
| `features/staff/` | Staff Permissions + Team Directory (F5) |
| `features/businesses/` | Business management |
| `features/locations/` | Location/venue management |
| `features/auth/` | Authentication & session management |
| `components/ui/` | Shared UI primitives (Card, Button, Badge, Table, etc.) |
| `styles/` | Design tokens, themes, responsive breakpoints |
| `utils/` | Reusable utilities (cn, formatCurrency, etc.) |
| `services/api/` | API client and service functions |

## 3. Design Token Reference

| Token | Light | Dark | Description |
|-------|-------|------|-------------|
| `--color-canvas` | `#F8FAFC` | `#050816` | Page background |
| `--color-sidebar` | `#F1F5F9` | `#0A0F20` | Sidebar background |
| `--color-primary` | `#2563EB` | `#2563EB` | Primary action color |
| `--color-secondary` | `#06B6D4` | `#06B6D4` | Secondary accent |
| `--color-accent` | `#8B5CF6` | `#8B5CF6` | Accent/highlight |
| `--color-text` | `#1e293b` | `#f1f5f9` | Main text color |
| `--color-text-muted` | `#64748b` | `#94a3b8` | Secondary text |
| `--color-border` | `#e2e8f0` | `#334155` | Border color |
| `--color-surface` | `#ffffff` | `#0f172a` | Surface/panel background |
| `--color-surface-subtle` | `#f8fafc` | `#1e293b` | Subtle surface (cards, badges) |
| `--radius-sm` | `6px` | `6px` | Small border radius |
| `--radius-md` | `8px` | `8px` | Medium border radius |
| `--radius-full` | `9999px` | `9999px` | Full circle (avatars) |
| `--space-2` | `8px` | `8px` | Small spacing |
| `--space-3` | `12px` | `12px` | Medium spacing |
| `--space-4` | `16px` | `16px` | Large spacing |
| `--text-xs` | `11px` | `11px` | Small text |
| `--text-sm` | `13px` | `13px` | Small text |
| `--text-lg` | `16px` | `16px` | Large text |
| `--text-xl` | `20px` | `20px` | Extra large text |

## 4. Coding Conventions

- **TypeScript strict mode**: `noImplicitAny`, `strictNullChecks`, `strictFunctionTypes` enabled
- **ESLint**: `airbnb-base` with `import/no-default-import`, `no-unused-vars`, `react-hooks/exhaustive-deps`
- **Component structure**: `features/<feature>/api.ts`, `features/<feature>/types.ts`, `features/<feature>/useStaff.ts`, `features/<feature>/StaffDirectory.tsx`
- **State shape**: `kind: 'idle' | 'loading' | 'loaded' | 'error' | 'empty'` with corresponding data
- **AbortController**: Use `signal` parameter on API calls for request cancellation on unmount
- **isMounted ref**: Prevent stale state updates from cross-tenant navigation
- **CSS-in-JS vs styled-components**: Inline `style={{}}` with `var()` tokens preferred; CSS modules for complex layouts

## 5. Implementation Steps

### F1 — Authentication & Session Management
- ✅ Complete: Google OAuth login, session cookie, CSRF token attachment

### F2 — Business Profile Page
- ✅ Complete: Business details display, editing, logo upload

### F3 — Locations Directory
- ✅ Complete: CRUD operations, table with pagination, role-based access

### F4 — Assistant Configuration
- ✅ Complete: Assistant creation, model selection, system prompt editor

### F5 — Staff Permissions and Team Directory
- ✅ Complete: API integration, owner-only access, role-based navigation, staff table with summary cards

### F6 — Assistant Configuration (Advanced)
- Pending: Advanced assistant settings, workflow automation, analytics

## 6. API Contracts

| Endpoint | Method | Auth | Backend Check |
|----------|--------|------|---------------|
| `GET /api/v1/businesses/:businessId/members` | GET | session cookie | `requireTenantMembership(['owner'])` |
| `GET /api/v1/branding` | GET | session cookie | public |
| `POST /api/v1/auth/login` | POST | none | local validation |
| `POST /api/v1/auth/logout` | POST | session cookie | session invalidation |

## 7. Verification Checklist

- [x] `npm run lint` — passes
- [x] `npm test` — all 11 tests passing
- [x] `npx tsc --noEmit` — TypeScript strict mode passes
- [x] `npm run build` — Vite production build succeeds
- [x] Backend-truthful UI with real API data
- [x] Session & CSRF preservation
- [x] Role-based navigation visibility
- [x] Light/dark theme support via CSS tokens
- [x] Tenant switching with stale-data prevention
- [x] Loading, empty, error, and retry states
- [x] Read-only staff management (no invitation/removal/role-update)
- [x] Design system compliance (tokens, colors, spacing, radii)

## 8. Current Feature State

| Feature | Status |
|---------|--------|
| F1 — Auth & Session | Implemented |
| F2 — Business Profile | Implemented |
| F3 — Locations Directory | Implemented |
| F4 — Assistant Configuration | Implemented |
| F5 — Staff Directory | **Implemented** |
| F6 — Advanced Assistant | Pending |

---
**F5 Staff Permissions and Team Directory — Implemented and Verified.**

## 9. F5: Current Implementation and Verification

### Actual feature status and tooling

| Step | Scope | State |
| --- | --- | --- |
| F1 | React foundation and premium design system | Existing implementation preserved |
| F2 | Email/password authentication, session restoration, CSRF | Existing implementation preserved; no Google OAuth |
| F3 | Business management and workspace selection | Existing implementation preserved |
| F4 | Location management | Existing implementation preserved |
| F5 | Staff permissions and team directory at `/staff` | Fresh implementation verified below |
| F6 | Assistant configuration and publishing | Pending; no implementation added |
| F7 | Conversations and Gemini playground | Pending; no implementation added |

Backend Phase 05 remains on hold. Logo upload, location pagination, and assistant editing are not completed frontend capabilities. Current tooling is React, TypeScript strict mode, React Router, Vite, TypeScript ESLint, React Hooks lint rules, React Refresh lint rules, and the Node native test runner. No Airbnb config, component test framework, CSS-in-JS library, or new dependency was introduced for F5.

### Files and responsibilities

| File | Responsibility |
| --- | --- |
| `src/pages/StaffPage.tsx` / `StaffPage.css` | Auth/tenant gate, keyed owner workspace, page composition, loading, empty, retry, denied and expired-session states; responsive hero and summary layout |
| `src/features/staff/types.ts` | Backend-derived member DTO, response DTO, and discriminated loading/loaded/forbidden/unauthenticated/error state |
| `src/features/staff/api.ts` | Read-only tenant-scoped request, role preflight, cancellation checks, runtime response validation and business-ID match |
| `src/features/staff/useStaff.ts` | Request lifecycle, AbortController cleanup, error mapping, manual refresh and retry |
| `src/features/staff/permissions.ts` | Owner-only directory capability and display-only backend permission matrix |
| `src/features/staff/summary.ts` | Actual member/owner/operator totals and Unicode-aware initials |
| `src/features/staff/components/StaffSummary.tsx` | Summary cards; unknown counts use a dash until a response is verified |
| `src/features/staff/components/StaffDirectory.tsx` | Semantic directory table, separate name/email/role columns, initials avatars, current-user indicator |
| `src/features/staff/components/RoleBadge.tsx` | Consistent owner/operator badge shared with the permissions table |
| `src/features/staff/components/RolePermissions.tsx` | Current backend capability comparison with explicit notice that assistant/conversation dashboard pages are pending |
| `src/features/staff/components/StaffDirectory.css` | Table, avatar and permission styling; keyboard-focusable horizontal scrolling regions |
| `src/config/routes.ts` | Implemented staff route metadata and `getVisibleNavItems` shared by sidebar and overview launchpad |
| `src/App.tsx`, `src/layouts/AppShell.tsx`, `src/pages/DashboardHomePage.tsx` | Dedicated protected route and role-aware navigation integration |
| `tests/staff.test.mts` | Fifteen dedicated F5 native tests, alongside all eleven existing tests |
| `tests/browser/staff.browser.mjs` | Thirteen browser regressions using mocked API responses |
| `tests/browser/staff.live.mjs` | Explicit live browser/Express/PostgreSQL smoke test using a temporary isolated schema |

### API contract and tenant isolation

`GET /api/v1/businesses/:businessId/members` returns:

```ts
{
  businessId: string;
  members: Array<{
    membershipId: string;
    userId: string;
    displayName: string;
    email: string;
    role: 'owner' | 'operator';
    createdAt: string; // ISO timestamp serialized by Express
  }>;
}
```

The contract comes from `backend/src/modules/businesses/businesses.controller.ts` and `businesses.types.ts`. The Express route uses `requireAuth` and `requireTenantMembership(['owner'])`; membership lookup and the member query are scoped to the requested business. The API remains the authoritative permission boundary.

`StaffPage` checks authenticated user, selected business, matching membership business ID, and owner role before mounting the request hook. Operators never mount the directory. Both sidebar links and overview launch cards use the same visibility helper. The API service independently prevents requests for operator memberships and missing business IDs; it validates the response shape, member roles, timestamp values, and echoed business ID before exposing data.

The owner workspace's React key includes user ID, business ID, membership ID and role. Switching scope unmounts the previous workspace and renders fresh loading state, so old rows and totals disappear immediately. Effect cleanup aborts requests; both the service and hook check the abort signal before applying successful results. This also prevents a transport that ignores cancellation from displaying a late response. No staff records are stored in browser storage or a shared cache.

The existing shared API client remains unchanged: cookie credentials, CSRF headers on writes, normalized errors and session-expiry handling continue to apply. A members `401` triggers the existing sign-in redirect; a `403` removes the directory and shows access denied. Generic failures show error/retry without falsely reporting an empty directory. No invitation, removal or role-edit APIs or controls were added.

### UI and design system

F5 reuses `Card`, `CardHeader`, `CardBody`, `Badge`, `Button`, `Alert`, `Spinner`, outline `Icon` and the existing shell/theme controls. Feature styles live in CSS files. Colors, spacing, radii, shadows and text sizes consume existing variables in `src/styles/tokens.css`; `--color-bg` is the canvas token. The actual dark canvas/sidebar/surface are `#050816`, `#0A0F20`, `#101729`; light canvas/surface are `#F8FAFC`, `#FFFFFF`. Existing blue/cyan/violet gradients and light/dark/system theme behavior are reused unchanged.

The page contains a gradient-accent heading, actual member totals, a directory with initials avatars and shared role badges, and a permissions overview derived from current business, assistant and conversation route guards. Staff management is explicitly read-only. Tables use captions, column and row headers, and labeled, focusable scroll regions. Summary cards stack on mobile; tables scroll within their cards instead of widening the page.

### Verification and reproducibility

Verified locally on 27 November 2026:

- `cd dashboard && npm test`: **26 passed, 0 failed, 0 skipped** (11 existing + 15 F5 tests). These use mocked fetch responses for API behavior.
- `cd dashboard && npm run lint`: passed.
- `cd dashboard && npm run build`: passed, including TypeScript project checks and Vite production output.
- `node --test tests/browser/staff.browser.mjs`: **13 passed, 0 failed, 0 skipped**. Actual Chromium rendering and React interactions, with mocked HTTP responses. Covers owner/operator route and navigation access; summaries; empty/error/retry; tenant switching and immediate clearing; request cancellation and stale response rejection even when transport ignores abort; route-exit cancellation; `401`/`403`; mismatched tenant responses; no-workspace handling; 1440px/768px/390px layouts; light/dark/system themes. No browser runtime errors were observed.
- `node --test tests/browser/staff.live.mjs`: **1 passed, 0 failed, 0 skipped**. Real PostgreSQL, existing compiled Express application, real cookie login, verified member DTO and `no-store`, browser-rendered staff totals, workspace switching, operator request prevention, server-enforced operator/foreign-tenant `403`, CSRF-protected sign-out, revoked-session verification and subsequent `401`. API traffic is transparently forwarded to the isolated live server; member responses are not mocked. The temporary schema and owned server/browser are cleaned up. AI service availability is outside this test's scope.
- Desktop dark/light and mobile screenshots were inspected. Screenshot fixtures use synthetic staff; they are browser QA artifacts, not application data.

The optional browser suites require an already-running dashboard and existing browser tooling. They intentionally do not install Playwright or change package files. From `dashboard/`, supply `PLAYWRIGHT_MODULE_PATH` (absolute path to Playwright Core's `index.mjs`) and `CHROMIUM_EXECUTABLE_PATH` (absolute path to Chromium). `DASHBOARD_TEST_URL` defaults to `http://127.0.0.1:5173`. The live suite additionally requires `TEST_DATABASE_URL`, an existing compiled `backend/dist`, and permission for a temporary test schema; keep connection credentials in the environment. Never use browser mocking as evidence of live integration.

Limitations: browser regression coverage uses Chromium only; tables deliberately retain horizontal scrolling on narrow screens. No production deployment, other-browser/accessibility audit, or full F1–F4 browser regression was performed. Existing frontend native tests all remain passing. No manual dependency installation was needed in this environment, and no backend, AI backend, shared package or SQL migration source was changed. No commit or push was performed. Stop for F5 review before proposing F6.

## 10. F6: AI Assistant Configuration and Publishing

This is the current F6 record; earlier F6-pending statements describe the pre-F6 snapshot. F1–F5 remain implemented. F7 and backend Phase 05 remain pending.

### Implementation and boundaries

`/assistants` now lists the active business’s business-level and location-level assistants, with draft/published badges and version numbers. Owners can create one assistant per scope, save configuration drafts, create a new draft from the latest version, and publish a saved draft after confirmation. Operators can inspect configurations and version history with disabled form fields and no write actions. The listing retains both draft and current published version information; history includes superseded versions and publication timestamps.

Configuration covers versioned name/description, language, five supported tones, instructions, welcome/fallback messages, temperature (0–1), output tokens (64–2048), context messages (1–20), public/staff-only visibility, business/assigned/selected-location knowledge access, and tools from the server’s approved registry. Active-location checks mirror the backend. Assistant scope is chosen at creation and cannot be edited afterward. Published versions remain immutable; a new draft must be created before further edits. Publishing uses the saved server draft, with explicit instructions that unsaved form edits are excluded.

Knowledge retrieval and automated tool execution remain unimplemented. Both page and form explicitly explain that permissions do not activate RAG or agents. No API keys, provider selection, model credentials, assistant deletion, or unsupported endpoints were introduced.

### Files and API

- `src/features/assistants/types.ts`: serialized assistant/version/configuration/tool contracts, defaults, and configuration-only projection (excludes version metadata from writes).
- `src/features/assistants/api.ts`: scoped list/tools/history/create/draft/update/publish requests; owner preflight for writes; response shape, version identity, tenant and model-limit checks; cancellation guards before/after transport.
- `src/features/assistants/validation.ts`: text lengths, language pattern, model bounds, approved tools, knowledge visibility, and active-location consistency.
- `src/features/assistants/useAssistants.ts`: list/location/tool loading and request lifecycle; tracks and aborts reads and mutations on scope exit.
- `src/features/assistants/components/AssistantForm.tsx`: reusable owner/read-only form, four themed sections, validation and save errors.
- `src/pages/AssistantsPage.tsx` and `AssistantsPage.css`: tenant gate, listing, scope selection, configuration, history, publish confirmation and feedback; responsive two-column workspace and stacked mobile layout.
- `src/App.tsx` and `src/config/routes.ts`: dedicated implemented assistant route and existing navigation integration.
- `src/features/staff/components/RolePermissions.tsx`: updates the existing F5 availability note to reflect the completed assistant page.
- `tests/assistants.test.mts`, `tests/browser/assistants.browser.mjs`, `tests/browser/assistants.live.mjs`: native, mocked browser and isolated live verification respectively.

All assistant endpoints are under `/api/v1/businesses/:businessId/assistants`: GET root and `/tools`, GET `/:assistantId/versions`, POST root, POST `/:assistantId/versions`, PATCH `/:assistantId/versions/:versionId`, POST `/:assistantId/versions/:versionId/publish` with `{}`. Contracts and version lifecycle were inspected in backend assistant types, validation, controllers, service, repository and routes. The existing API client preserves cookie sessions, CSRF on writes, and global 401 handling. Backend RBAC remains authoritative.

The workspace is keyed by authenticated user, business and role. Scope changes immediately unmount forms, history, list, modal and feedback; cleanup aborts pending work. Signal checks discard late results even if fetch ignores abort. No assistant data is persisted in local storage. Canceling a browser request cannot undo a write already accepted by the backend; revisiting the business reloads authoritative state. Refresh and switching assistants discard unsaved edits; publishing explicitly confirms the saved draft.

### Verification

- `npm test`: **35 passed, 0 failed, 0 skipped**: all 26 pre-F6 tests plus 9 F6 tests. Covers config/model limits, scopes and active-location rules, approved tools, version contract and tenant identity, operator write prevention, draft/create/update/publish paths and CSRF, late cancellation and publish errors.
- `npm run lint`: passed.
- `dashboard/node_modules/.bin/tsc -b dashboard/tsconfig.json` from repository root: passed.
- `npm run build`: passed (TypeScript and Vite).
- Mocked Chromium: **5 F6 tests passed** for owner empty/form layouts, operator write-control hiding, version rendering and publish confirmation/conflict handling, load error/retry, and workspace data clearing. **13 existing F5 browser tests passed** unchanged.
- Live browser → Express → PostgreSQL: **1 F6 smoke test passed** using an isolated temporary schema and the existing compiled backend. Verified real login/session cookies, creation, draft updates, publishing, new v2 draft, persisted version status/name, operator disabled fields and absent Save action, server-enforced forbidden writes, foreign-tenant access rejection, CSRF logout and revoked sessions. API responses were forwarded from the real server without mocked assistant bodies. Temporary schema/server/browser cleanup is registered in the test. AI availability is outside this configuration test.
- Browser screenshots inspected for the live configuration page and mobile dark form. Layout assertions cover 1440px, 768px and 390px. Browser suites require the existing tooling/environment variables documented in section 9; no dependencies were installed or package files changed.

Limitations: Chromium only; no formal accessibility audit or full F1–F4 browser suite. Location scope handling is covered by contract/validation tests; the live create/publish workflow exercised a business assistant. Knowledge retrieval, automated tools and the conversation playground remain outside F6. Backend, AI backend, shared packages and migration sources were not changed. No commit, push or deployment was performed. Stop for user review before F7.

## 11. F7: Conversations and Real Gemini Playground

This is the current frontend completion record. F1–F7 are implemented; backend Phase 05 remains on hold. Prior pending-feature statements above are historical records and are superseded by this section.

### Experience and API integration

`/conversations` now provides a paginated business conversation sidebar, published assistant selector (business or active location), optional business-assistant location context, new staff playground creation, persisted chronological history, bound assistant name/version, status controls, owner deletion/purge confirmations, a message composer, generating state, errors and safe retry. The page explicitly states that it is a staff test playground, not a public widget, and that RAG, grounded retrieval, automated tools, appointments and agents remain unavailable.

The UI uses the existing shell, themed Card/Badge/Button/SelectField/TextareaField/Alert/Spinner/ConfirmDialog components and centralized CSS tokens. The sidebar and thread stack on tablet/mobile. History scrolls inside the thread, messages preserve whitespace and render as plain text, and timestamps and actual persisted generation metadata accompany responses. No fabricated answers or simulated streaming are used.

The inspected backend supports these routes beneath `/api/v1/businesses/:businessId/conversations`:

| Action | Method and suffix | Behavior |
| --- | --- | --- |
| List | GET root, `limit=20&offset=…` | All visible business conversations; load-more pagination |
| Create | POST root | `{assistantId, locationId, channel:'playground'}` with stable `Idempotency-Key` |
| Detail | GET `/:conversationId` | Includes the immutable bound assistant version ID |
| Messages | GET `/:conversationId/messages?limit=100&offset=…` | Fetches all pages, sorts by sequence number |
| AI turn | POST `/:conversationId/turns` | `{content}` and stable `Idempotency-Key`; returns complete user/assistant messages, AI summary and replay flag |
| Status | PATCH `/:conversationId` | One of active, pending_human, human_active, closed; backend accepts all these status updates |
| Soft delete | DELETE `/:conversationId` | Owner only; removes the record from active listings |
| Purge | POST `/:conversationId/purge`, `{}` | Owner only; permanently removes conversation and messages |

The assistant API supplies published choices and version history to resolve the conversation’s actual bound version, including superseded versions. Location choices come from the business location API and exclude archived locations for creation. Backend membership, assistant ownership/publication, location relationships, active playground status, idempotency and transactional turn persistence remain authoritative. Visitor conversations can be inspected and have supported statuses updated; the playground composer is disabled for them.

### Files and security

- `src/features/conversations/types.ts`: serialized conversation/message/pagination/turn contracts.
- `src/features/conversations/api.ts`: tenant-scoped transport, runtime response/identity validation, history pagination, status/turn/deletion methods and owner deletion preflight.
- `src/features/conversations/validation.ts`: published assistant/location eligibility, the backend’s 4000-character turn limit, logical-request key reuse.
- `src/features/conversations/useConversation.ts`: abortable detail/history/version loading, composer state, synchronous request lock, status updates, complete turn handling and message deduplication.
- `src/features/conversations/components/ConversationThread.tsx`: thread, version/status metadata, message log, composer, generation/error feedback and destructive confirmations.
- `src/pages/ConversationsPage.tsx` and `ConversationsPage.css`: keyed workspace, list and selectors, creation, pagination, deleted-conversation purge affordance and responsive styles.
- `src/App.tsx`, `src/config/routes.ts`: dedicated implemented route; `features/staff/components/RolePermissions.tsx` updates its conversation availability note.
- `tests/conversations.test.mts`: ten dedicated native tests.
- `tests/browser/conversations.browser.mjs`: five mocked browser tests.
- `tests/browser/conversations.live.mjs`: explicitly enabled real Gemini end-to-end test using an owned FastAPI process and isolated PostgreSQL schema.
- `tests/browser/conversations.management.live.mjs`: live lifecycle/RBAC/deletion test without model calls.

Every request uses the existing credentialed, CSRF-protected shared API client. Keys identify logical creation/turn requests and remain stable for unchanged-payload retries during the current visit; changed payloads get new keys. A ref lock prevents duplicate submissions before React updates the disabled state. Failed requests retain composer text. No automatic model retries are performed. Server network, timeout, rate-limit and service errors are displayed as errors, never as assistant messages.

The workspace is keyed by user/business/role; the thread is keyed by conversation. Cleanup aborts requests and response guards reject late results even when a transport ignores cancellation. Switching scope immediately removes history, text, keys, pending confirmations and metadata. Selection URLs include both workspace and conversation IDs, so a different workspace does not request the old selected thread. Responses validate tenant/thread identities before rendering. No session secrets, API keys or internal credentials are sent to the browser or stored in application source.

### Actual verification

- Native frontend suite: **45 passed, 0 failed, 0 skipped** (all 35 existing F1–F6 tests plus 10 F7 tests). Covers contracts, message limits, key reuse, publication/location eligibility, credentialed CSRF/idempotent creation, history pagination, operator destructive-action prevention, status updates, cancellation, foreign-tenant payload rejection and 401/403/409/429/503/504 errors.
- `npm run lint`, explicit TypeScript project check and `npm run build`: passed.
- Mocked Chromium: **5 F7 tests passed**: creation/response rendering, retained text and stable-key failure retry, generating-state duplicate prevention and tenant switching, operator status controls with hidden destructive actions, and 1440px/768px/390px layout checks. **All 18 existing F5/F6 mocked browser regressions passed**. Browser HTTP fixture responses are not evidence of Gemini generation.
- Real browser → Express → PostgreSQL → owned FastAPI → Gemini: **1 test passed**, using the existing configured environment, without modifying credentials. Exactly two intended real turns used `gemini-3.5-flash-lite`, `mode: gemini`, `grounded: false`. The first acknowledged synthetic code word “lavender”; the second recalled it from persisted context. Screenshot metadata recorded 172 and 190 total tokens respectively. Four chronological PostgreSQL messages were verified. Replaying the second request returned `idempotentReplay: true` and left four messages. Browser refresh restored all four. After stopping only the test-owned FastAPI process, a new send produced an actual service error, retained unsent text and persisted no extra messages. No third paid generation was made.
- Live lifecycle test: **1 test passed**, without model calls. Verified actual browser creation, all four supported status values, foreign-tenant 403, operator read access after membership assignment, forbidden operator delete/purge, owner soft-delete confirmation, subsequent detail 404, purge confirmation and physical PostgreSQL removal.
- Live tests register cleanup for their temporary schema, owned Express/browser processes, and (where applicable) owned FastAPI process. Existing user services were not stopped. Browser screenshots of the live Gemini conversation and mobile dark layout were inspected.

Browser tooling uses the same explicit environment variables documented in section 9. The real Gemini suite additionally requires the existing `ai-backend/.venv`, a configured `ai-backend/.env` in Gemini mode and an available model/key; credentials are read into memory only. It launches the configured FastAPI service on a temporary loopback port. Run this suite explicitly to avoid unintended paid calls. The management suite needs no Gemini service. No dependencies or package-file changes were needed.

### Limits and review boundary

Chromium was used; no formal accessibility audit or full F1–F4 browser regression was performed. Successful Gemini generation is a two-turn synthetic baseline, not a model-quality evaluation. Rate limits and timeouts have native error coverage; real outage behavior was verified, while rate limiting was not deliberately induced against Gemini. Creating an assistant scoped to a location is contract/eligibility covered; the paid smoke used a business assistant.

Draft composer text and retry keys are memory-only and are cleared on refresh/navigation; persisted messages restore from the backend. Canceling cannot undo a request already accepted server-side. A fresh page submission after losing its in-memory retry key is a new logical request. There is no backend deleted-conversation listing, so the UI retains a purge affordance for a just-deleted conversation only during the current workspace visit. Permanent purge can also be chosen directly on a visible conversation, with confirmation. Reopening closed or human-handled conversations is an explicit supported status change; AI turns remain disabled until active.

Backend, AI backend, shared package and applied migration sources are unchanged. No commit, push or deployment was performed. Stop for F7 review; do not start Phase 05 without separate approval.
