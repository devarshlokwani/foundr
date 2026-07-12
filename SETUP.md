# Foundr - Local Setup

Everything you need to run Foundr on your own machine.

---

## Prerequisites

- Node.js 18+ and npm
- MongoDB - local install, or free cloud instance at [mongodb.com/atlas](https://mongodb.com/atlas)
- Clerk account - free at [clerk.com](https://clerk.com) (needed for auth pages)

---

## First-time Setup

**1. Install dependencies**
```bash
npm install
```

**2. Copy the env template and fill in your keys**
```bash
cp .env.example .env
```

Then open `.env` and fill in:

```bash
MONGODB_URI=           # mongodb://localhost:27017/foundr (local) or your Atlas URI
CLERK_PUBLISHABLE_KEY= # from dashboard.clerk.com → API Keys
CLERK_SECRET_KEY=      # from dashboard.clerk.com → API Keys
VITE_WAITLIST_API=     # http://localhost:3001 (for local waitlist API testing)
```

---

## Running the App

**Frontend** (Vite dev server with hot-reload):
```bash
npm run dev
```
Opens at [http://localhost:5173](http://localhost:5173)

**Waitlist API** (standalone pre-launch server):
```bash
npx tsx server/waitlist-server.ts
```
Runs at [http://localhost:3001](http://localhost:3001)

**Full backend** (main app API, auth, dashboard, transactions):
```bash
npm run server
```
Runs at [http://localhost:3000](http://localhost:3000), the frontend proxies `/api` here.

---

## Building for Production

**Landing page only** (what's deployed to Vercel):
```bash
npx vite build --config vite.landing.config.ts
# Output → dist-landing/
```

**Preview the landing build locally** (mirrors exactly what Vercel serves):
```bash
npx vite preview --config vite.landing.config.ts
```

**Full app:**
```bash
npm run build
# Output → dist/
```

---

## Useful Commands

| Command | What it does |
|---|---|
| `npm run dev` | Start frontend dev server |
| `npm run server` | Start main backend |
| `npm run type-check` | Check TypeScript without building |
| `npm run build` | Production build (full app) → `dist/` |
| `npm run preview` | Preview the production build locally |
| `npm run format` | Auto-format with Prettier |
| `npx vite build --config vite.landing.config.ts` | Landing-only build → `dist-landing/` |
| `npx vite preview --config vite.landing.config.ts` | Preview landing build locally (mirrors Vercel) |

---

## Two Build Configs, Why?

Foundr has two Vite configs intentionally:

- **`vite.config.ts`** - builds the full app (landing + dashboard + auth + transactions). Used for local development and when the full app launches.
- **`vite.landing.config.ts`** - builds only the landing page (`client/index.html`). This is what's deployed to Vercel pre-launch, so the unfinished dashboard and auth pages stay private while the waitlist is live.

---

## Project Structure

```
foundr/
├── client/
│   ├── features/
│   │   ├── landing/          # Landing page + loader
│   │   ├── auth/             # Sign in / Sign up (Clerk)
│   │   ├── dashboard/        # Metrics dashboard (in development)
│   │   └── transactions/     # Transaction tracking (in development)
│   └── shared/
│       ├── lib/              # animations.ts, types.ts, waitlist.ts
│       └── css/              # Design tokens (CSS custom properties)
├── server/
│   ├── waitlist-server.ts    # Standalone pre-launch waitlist API
│   └── models/               # Mongoose models (Waitlist, future: Transaction)
├── vite.config.ts            # Full app build config
├── vite.landing.config.ts    # Landing-only build config
└── .env.example              # Environment variable template
```

---

## Common Issues

**Waitlist form shows an error on submit**
→ Make sure `VITE_WAITLIST_API` in your `.env` points to a running waitlist server (`http://localhost:3001` locally).

**MongoDB connection fails**
→ If using Atlas, make sure your IP is whitelisted under Network Access. If using local MongoDB, make sure it's running (`mongod`).

**Clerk auth pages redirect incorrectly**
→ In your Clerk dashboard, set allowed redirect URLs to include `http://localhost:5173`.

---

*Back to [README](./README.md)*