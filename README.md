# Foundr

> A finance tracking web app for solo founders who fund their own ventures.

**Live:** [foundr-xi.vercel.app](https://foundr-xi.vercel.app)

Most finance tools are built for funded startups with accountants. Foundr is built for the founder paying for the dream out of their own pocket — it turns the numbers you already track on paper into clear metrics: burn rate, runway, personal ROI, and margins.

Currently in pre-launch. Waitlist open.

---

## Stack

| Layer | Tech |
|---|---|
| Frontend | Lit (Web Components), TypeScript, GSAP |
| Backend | Node.js, Express, TypeScript |
| Database | MongoDB + Mongoose |
| Auth | Clerk *(in development)* |
| Bundler | Vite |
| Deploy | Vercel (frontend) + Render (API) |

---

## Architecture

```
foundr-xi.vercel.app          (static landing — Vercel)
        │
        │  POST /api/waitlist
        ▼
foundr.onrender.com           (Express API — Render)
        │
        ▼
MongoDB Atlas                 (waitlist emails)
```

The frontend and backend are deployed independently. The landing page is a static build (`dist-landing/`) served by Vercel. The waitlist API is a lightweight standalone Express server on Render — separate from the main app so the pre-launch site ships without exposing unfinished features.

---

## Project Structure

```
foundr/
├── client/
│   ├── features/
│   │   ├── landing/          # Landing page (Lit component + GSAP animations)
│   │   ├── auth/             # Sign in / Sign up (Clerk)
│   │   ├── dashboard/        # Main app dashboard (in development)
│   │   └── transactions/     # Transaction tracking (in development)
│   └── shared/
│       ├── lib/              # animations.ts, types.ts, waitlist.ts
│       └── css/              # Design tokens
├── server/
│   ├── waitlist-server.ts    # Standalone pre-launch API
│   └── models/               # Mongoose models
├── vite.config.ts            # Full app build
└── vite.landing.config.ts    # Landing-only build (what's deployed)
```

---

## Running Locally

**Prerequisites:** Node 18+, MongoDB (local or Atlas), a Clerk account

```bash
# Install dependencies
npm install

# Copy env template and fill in your keys
cp .env.example .env

# Start the frontend (Vite, hot-reload) — http://localhost:5173
npm run dev

# Start the waitlist API — http://localhost:3001
npx tsx server/waitlist-server.ts
```

---

## Environment Variables

```bash
MONGODB_URI=           # MongoDB connection string
CLERK_PUBLISHABLE_KEY= # From dashboard.clerk.com
CLERK_SECRET_KEY=      # From dashboard.clerk.com
VITE_WAITLIST_API=     # Waitlist API URL (Render in prod, localhost in dev)
```

---

## What's Built

- [x] Landing page with scroll animations (GSAP + ScrollTrigger)
- [x] Pricing section with collage-to-grid scroll reveal
- [x] Feature deck with pinned card animation
- [x] Intro loader animation
- [x] Waitlist API with rate limiting + MongoDB
- [x] Deployed to Vercel + Render
- [ ] Auth (Clerk) — in development
- [ ] Dashboard with metrics — in development
- [ ] Transaction tracking — in development
- [ ] Shopify + bank sync — roadmap

---

## Deployment

**Landing page (Vercel):**
```bash
npx vite build --config vite.landing.config.ts
# Output → dist-landing/ (what Vercel serves)
```

**Waitlist API (Render):**
```bash
npx tsx server/waitlist-server.ts
```

---

*Built by [Devarsh Lokwani](https://github.com/devarshlokwani)*
