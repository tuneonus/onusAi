# OnusSync Dashboard

React + TypeScript + Vite staff dashboard for the OnusSync AI-Powered Multi-Tenant Business Engagement Platform.

See [FRONTEND_ARCHITECTURE.md](./FRONTEND_ARCHITECTURE.md) for the folder structure, layer responsibilities, coding conventions, and step-by-step implementation plan.

## Prerequisites

- Node.js and npm installed (dependencies are already present in `dashboard/package.json`).
- Running `backend/` API server (defaults to `http://127.0.0.1:3000`) for live API integration.

## Environment Configuration

Copy `.env.example` to `.env.local` if you need non-default API origins:

- `VITE_API_BASE_URL` — Leave empty in local development to use the Vite `/api` proxy (same-origin cookie & CSRF flow), or set to an explicit backend origin (e.g., `https://api.example.com`).
- `VITE_DEV_API_PROXY_TARGET` — Backend origin used by the Vite dev server proxy (defaults to `http://127.0.0.1:3000`).

## Scripts

Run from `dashboard/`:

```bash
npm run dev      # Start Vite development server (default http://localhost:5173)
npm run lint     # Run ESLint across TypeScript/React files
npm test         # Run Node native unit tests in tests/
npm run build    # Run strict TypeScript project check (tsc -b) and Vite production build
npm run preview  # Preview the built production bundle locally
```
