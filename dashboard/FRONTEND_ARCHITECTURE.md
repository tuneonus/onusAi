# OnusAI Frontend Architecture & Design Standards

This document defines the architecture, design system standards, folder responsibilities, coding conventions, and incremental implementation plan for the OnusAI staff dashboard (`dashboard/`).

## 1. Guiding Principles

- **Backend-truthful UI**: Integrate directly with the Node.js Express API (`/api/v1`). Never invent fake business, member, assistant, or conversation data or fake analytics statistics.
- **Session & CSRF preservation**: Authenticate via `HttpOnly` cookie sessions (`onusai_session`) with `credentials: 'include'` and attach `X-CSRF-Token` (sourced from `session.csrfToken` / `onusai_csrf` cookie) on all mutating requests (`POST`, `PATCH`, `PUT`, `DELETE`).
- **Centralized branding**: Read platform branding from `packages/branding/branding.json` (and verify/sync via `GET /api/v1/branding`) instead of scattering product-name literals across components.
- **Commercial AI SaaS clarity**: Keep customer-facing navigation free of internal engineering/phase labels (e.g. "Step F4"), separate developer diagnostics (`/diagnostics`) from the business overview (`/`), and maintain calm visual hierarchy.
- **Simple, human-readable React**: Prefer explicit props, small focused components, centralized CSS custom properties, and React Router + native platform primitives over heavy abstractions or premature optimization.
- **Role-aware UI, server-enforced security**: Use membership roles (`owner` vs `operator`) to guide UI affordances while treating backend `401`/`403` responses as authoritative.

## 2. OnusAI Design System Standards (Standard for All Future Modules)

All visual tokens are centralized in `src/styles/tokens.css` and `src/styles/global.css`. Feature and component stylesheets must consume tokens rather than hardcoding colors, radii, or shadows.

### Color Palette & Theme Modes
Themes support **`light`**, **`dark`**, and **`system`** (`prefers-color-scheme`) via `useTheme()` and `[data-theme="dark"]` on `<html>`:

| Token | Light Mode | Dark Mode | Usage |
| --- | --- | --- | --- |
| `--color-bg` | `#F8FAFC` | `#050816` | Page canvas background |
| `--color-sidebar` | `#FFFFFF` | `#0A0F20` | Primary left navigation sidebar |
| `--color-surface` | `#FFFFFF` | `#101729` | Cards, forms, modals, topbar |
| `--color-surface-subtle` | `#F1F5F9` | `#162038` | Hover surfaces, segmented control tracks, nested panels |
| `--color-primary` | `#2563EB` | `#2563EB` | Primary actions, active focus, active indicators |
| `--color-secondary` | `#06B6D4` | `#06B6D4` | Secondary brand accent & gradient stop |
| `--color-accent` | `#8B5CF6` | `#8B5CF6` | Violet gradient stop & AI capability highlights |
| `--brand-gradient` | `135deg, #2563EB -> #06B6D4 -> #8B5CF6` | Same | Brand mark, hero accents, featured card top bar (`Card accent`) |
| `--color-text` | `#0F172A` | `#F8FAFC` | Primary headings & body copy |
| `--color-text-secondary` | `#475569` | `#CBD5E1` | Subtitles & secondary descriptions |
| `--color-text-muted` | `#64748B` | `#94A3B8` | Section labels, helper text, metadata |

### Typography, Icons, Elevation & Accessibility
- **Typography**: `'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif` (`--font-sans`) with `-0.02em` heading tracking and `--font-mono` for technical IDs, timestamps, and 24-hour time inputs.
- **Icons**: Consistent 1.75px-stroke outline SVG icons in `src/components/ui/Icons.tsx` (`Icon`). If `lucide-react` is approved later, `Icons.tsx` provides a single replacement point.
- **Elevation & Borders**: Subtle 1px hairline borders (`--color-border`) paired with restrained `--shadow-xs` / `--shadow-sm` / `--shadow-md` tokens; avoid heavy glow clutter or excessive animations.
- **Accessibility & Responsiveness**: Visible `:focus-visible` focus rings (`--focus-ring`), WCAG AA text contrast in both light and dark modes, semantic landmarks (`<header>`, `<nav>`, `<main>`), `prefers-reduced-motion` support, desktop sidebar collapsing cleanly into a keyboard-dismissible drawer below `960px`, and compact mobile controls below `640px`.

## 3. Feature-Based Folder Structure

```text
dashboard/
├── .env.example                 # Safe Vite environment variable examples
├── index.html                   # SPA document entry point
├── vite.config.ts               # Vite dev server, /api proxy, and fs allowlist
├── FRONTEND_ARCHITECTURE.md     # Architecture, design standards, and step plan
├── tests/                       # Node native unit tests for validation, tenant selection, and API client
└── src/
    ├── main.tsx                 # React root mount and base stylesheet entry
    ├── App.tsx                  # BrowserRouter, AuthProvider, TenantProvider, protected routes
    ├── index.css                # Base stylesheet entry importing tokens + globals
    ├── config/                  # env.ts, branding.ts, routes.ts
    ├── styles/                  # tokens.css (all theme tokens), global.css (base reset & a11y)
    ├── types/                   # Shared cross-feature API & schedule contracts (api.ts, schedule.ts)
    ├── utils/                   # Pure utilities (cn.ts, cookies.ts)
    ├── validation/              # Shared pure field/schedule validators (common.ts)
    ├── services/api/            # Fetch transport (client.ts) and system probes (system.ts)
    ├── layouts/                 # AppShell (sidebar, topbar, drawer) and AuthLayout (sign-in shell)
    ├── components/
    │   ├── ui/                  # Alert, Badge, Button, Card, ConfirmDialog, FormField, Icons, SelectField, Spinner, TextareaField, ThemeToggle
    │   └── business/            # Reusable domain inputs (TimezoneField, OpeningHoursEditor)
    ├── hooks/                   # useSystemStatus, useTheme
    ├── pages/                   # LoginPage, DashboardHomePage, BusinessProfilePage, LocationsPage, DiagnosticsPage, ModulePlaceholderPage
    └── features/                # Self-contained business domains
        ├── auth/                # Step F2: API, validation, AuthProvider, useAuth, ProtectedRoute, LoginForm
        ├── businesses/          # Step F3: API, validation, TenantProvider, WorkspaceSwitcher, BusinessProfileForm
        ├── locations/           # Step F4: API, validation, LocationCard, LocationForm (create/edit/archive)
        ├── staff/               # Step F5: role permissions helpers & owner-only member directory
        ├── assistants/          # Step F6: assistant list, draft/publish editor, tools & knowledge scope
        └── conversations/       # Step F7: playground chat, turns, messages, status, delete/purge
```

## 4. Layer Responsibilities & Coding Conventions

| Layer | Owns | Must Not Own |
| --- | --- | --- |
| `config/` | Env parsing, route constants, centralized branding | Runtime mutable state or network calls |
| `styles/` | Design tokens (`--color-*`, `--brand-gradient`), light/dark variables, base a11y | Feature-specific layout hacks |
| `types/` | Shared DTOs and API error shapes | Runtime logic or validation side effects |
| `utils/` | Pure functions (class merging, cookie reading) | React state, DOM mutations, or `fetch` calls |
| `services/api/` | `fetch` transport, CSRF attachment, 401 expiry hook, error normalization, system endpoints | React components or UI notifications |
| `layouts/` | Outer SaaS frame (`AppShell`, `AuthLayout`), responsive navigation chrome | Feature domain mutations |
| `components/ui/` | Reusable accessible UI primitives and outline `Icons` | Tenant/auth business rules |
| `components/business/` | Shared business/location form controls | Direct API calls |
| `hooks/` | Reusable stateful React hooks (`useTheme`, `useSystemStatus`) | Hardcoded JSX templates |
| `features/<name>/` | Feature-local `api.ts`, `types.ts`, `validation.ts`, context/hooks, and feature components | Cross-feature internal imports |
| `pages/` | Route entry points connecting router state, auth/tenant context, and feature views | Low-level `fetch` calls or raw payload parsing |

1. **TypeScript strictness**: Keep `strict: true`, `verbatimModuleSyntax: true`, and `erasableSyntaxOnly: true` enabled. Use `import type` for type-only imports; avoid `enum` and `any`.
2. **React & ESLint compatibility**: Export only React components from `.tsx` component files (`react-refresh/only-export-components`); keep contexts and hooks in dedicated `.ts` files and abort in-flight `useEffect` requests with `AbortController`.
3. **API & Security hygiene**: Never store session secrets in browser storage. Attach `X-CSRF-Token` on mutations via `apiClient`, render backend error messages safely as text, and respect `Retry-After` on `429` responses.

## 5. Step-by-Step Frontend Implementation Plan

- **Step F1 — Foundation & Theme (Verified)**: Vite `/api` proxy, env config, centralized branding, CSS design tokens, `AppShell`, UI primitives, CSRF-ready `apiClient`, and live health probes.
- **Step F2 — Staff Authentication, Session Restoration & CSRF (Verified by User Login + Unit Tests)**: `AuthProvider`, `/login` with validation and `401`/`429` feedback, `ProtectedRoute`, mid-session `401` expiry redirect, `POST /api/v1/auth/logout`, and commercial SaaS design system refinement.
- **Step F3 — Workspace Switcher & Business Profile Management (Verified via Unit Tests/Build)**: `TenantProvider`, `WorkspaceSwitcher`, `DashboardHomePage` (`/`), `BusinessProfilePage` (`/businesses`), `DiagnosticsPage` (`/diagnostics`), `TimezoneField`, and 7-day `OpeningHoursEditor`.
- **Step F4 — Business Locations Management (Implemented — Review Pending)**: Tenant-scoped `LocationsPage` (`/locations`) with Active/Archived/All filters (`?includeArchived`), `LocationForm` reusing `TimezoneField` and `OpeningHoursEditor`, structured `LocationAddress`, `LocationCard`, `ConfirmDialog` for owner-only soft-archival (`DELETE .../locations/:locationId`), and read-only operator mode.
- **Step F5 — Staff Permissions & Team Directory**: Shared RBAC capability helpers (`owner` vs `operator`) and owner-only Staff Directory (`GET .../members`).
- **Step F6 — Assistant Configuration & Immutable Versioning**: Business/location assistants list, draft `v1` creation, draft editor (tone, prompts, bounded `modelSettings`, `APPROVED_TOOL_REGISTRY`, knowledge scopes/locations), version history, clone-to-draft, and atomic publish.
- **Step F7 — Playground & Conversation Management**: Filterable paginated inbox, playground creation (`Idempotency-Key`), chronological message thread (`afterSequence`), AI turn composer (`POST .../turns`) with usage metadata, operator notes, status transitions, and owner-only soft-delete & hard-purge.
