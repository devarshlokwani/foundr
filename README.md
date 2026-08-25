# Foundr

> The simple finance tracker built for solo founders funding their own dream.

**Live:** [foundr-xi.vercel.app](https://foundr-xi.vercel.app)

Most finance tools are built for funded startups with accountants. Foundr is built for the founder paying for the dream out of their own pocket. It turns the numbers you already track on paper into clear metrics: burn rate, runway, personal ROI, and margins.

**Status: v1.0 (Prototype), live.**

---

## Stack

| Layer | Tech |
|---|---|
| Frontend | Lit (Web Components), TypeScript, GSAP |
| Backend | Node.js, Express, TypeScript |
| Database | MongoDB + Mongoose |
| Auth | Clerk |
| Bundler | Vite |
| Deploy | Vercel (frontend) + Render (API) |

---

## Architecture

```
foundr-xi.vercel.app          (static app, all pages - Vercel)
        |
        |  /api/* requests, proxied via vercel.json rewrite
        v
foundr.onrender.com           (Express API - Render)
        |
        v
MongoDB Atlas                 (all app data)
```

Clerk sits alongside both sides: the client talks to Clerk directly for sign-in/sign-up, and the server verifies each request's session token against Clerk before touching any data.

The frontend and backend deploy independently. Vercel builds and serves every page as a static file (no server-side rendering); Vercel's `vercel.json` rewrites any `/api/*` request through to the Render-hosted API, so the two look like one site to a visitor even though they're two separate deployments.

---

## Features

- **Multi-business dashboard**: every startup you track gets its own fully isolated set of numbers, switchable from one account.
- **Ledger**: expenses, revenue, investments, draws, and debts, with search, filters, and date-range/granularity controls.
- **Metrics**: burn rate, runway, personal ROI, gross margin, computed live from your entries.
- **Reports**: margins breakdown and a full balance sheet, with CSV and PDF export.
- **Recurring entries**: schedule a rule once (weekly, monthly, yearly) and it materializes into a real entry automatically when due.
- **Trash and undo**: nothing is ever hard-deleted by accident. Soft-deleted entries can be restored or permanently removed from Settings.
- **Activity log**: a timestamped history of every create/update/delete/restore across the account.
- **Bulk import**: an LLM-prompt-based rulebook wizard for migrating data in from CSV.
- **Onboarding**: a guided setup wizard plus an in-app product tour.
- **Six themes**: light, dark, royal, ocean, sunset, slate.
- **Contact page**: a reason-driven flow that books a real Cal.com slot for sales/hiring/partnership inquiries, or sends a direct message for everything else.
- **Auth**: full Clerk-backed sign-up/sign-in, with email verification, Google sign-in, password reset, and a recovery-email flow.

---

## Project Structure

```
foundr/
├── client/
│   ├── features/
│   │   ├── landing/          # Public landing page (Lit + GSAP animations)
│   │   ├── auth/              # Sign in / Sign up (Clerk)
│   │   ├── onboarding/        # Guided setup wizard
│   │   ├── business/          # Startup switcher
│   │   ├── dashboard/         # Metrics dashboard
│   │   ├── transactions/      # Ledger: all entries, recurring, trash
│   │   ├── margins/            # Margins report + balance sheet
│   │   ├── settings/           # Account, security, data, appearance
│   │   └── contact/            # Contact page (Cal.com + Web3Forms)
│   └── shared/
│       ├── components/         # Shared Lit components (topbar, activity feed, import panel, etc.)
│       ├── lib/                 # API client, formatting, theming, session handling
│       └── css/                 # Design tokens (CSS custom properties, one set per theme)
├── server/
│   ├── routes/                  # One file per API resource
│   ├── models/                  # Mongoose schemas
│   ├── lib/                      # Business logic (metrics, insights, recurring, etc.)
│   └── middleware/               # Auth middleware
├── vite.config.ts                # Full app build config
└── vercel.json                    # Vercel build/output settings and the /api/* rewrite to Render
```

---

## Running Locally

See [SETUP.md](./SETUP.md) for full local setup instructions, environment variables, and common issues.

---

## Environment Variables

```bash
MONGODB_URI=                   # MongoDB connection string
CLERK_PUBLISHABLE_KEY=         # From dashboard.clerk.com, read by the server
CLERK_SECRET_KEY=              # From dashboard.clerk.com, server-only, never exposed to the client
VITE_CLERK_PUBLISHABLE_KEY=    # Same publishable key, read by the client at build time
PORT=                          # Server port (Render sets this itself in production)
```

The Contact page also needs two constants filled in directly in `client/features/contact/foundr-contact.ts`: a Cal.com booking link and a Web3Forms access key. See that file's comments for where.

---

## Deployment

**Frontend (Vercel):**
```bash
npm run build
# Output -> dist/, which vercel.json points Vercel at
```

**API (Render):**
```bash
npm run server:build
node dist-server/index.js
```

**Preview the production build locally:**
```bash
npm run build
npx vite preview
```

---

*Built by [Devarsh Lokwani](https://github.com/devarshlokwani)*
