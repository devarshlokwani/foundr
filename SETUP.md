# Foundr - Local Setup

Everything you need to run Foundr on your own machine.

---

## Prerequisites

- Node.js 18+ and npm
- MongoDB: local install, or a free cloud instance at [mongodb.com/atlas](https://mongodb.com/atlas)
- Clerk account: free at [clerk.com](https://clerk.com)

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
MONGODB_URI=                  # mongodb://localhost:27017/foundr (local) or your Atlas URI
CLERK_PUBLISHABLE_KEY=        # from dashboard.clerk.com -> API Keys
CLERK_SECRET_KEY=             # from dashboard.clerk.com -> API Keys
VITE_CLERK_PUBLISHABLE_KEY=   # same publishable key as above, read by the client at build time
```

**3. (Optional) Set up the Contact page**

`client/features/contact/foundr-contact.ts` has two constants near the top, `WEB3FORMS_ACCESS_KEY` and `CALCOM_BOOKING_URL`, needed only if you want the `/contact` page's booking calendar and message form to actually work. Not required to run the rest of the app locally.

---

## Running the App

**Frontend** (Vite dev server with hot-reload):
```bash
npm run dev
```
Opens at [http://localhost:5173](http://localhost:5173)

**Backend** (API, auth, dashboard, transactions, everything):
```bash
npm run server
```
Runs at [http://localhost:3000](http://localhost:3000). The frontend's dev server proxies `/api` requests here automatically.

Run both at once, in two terminals, for a full local setup.

---

## Building for Production

```bash
npm run build
# Output -> dist/
```

**Preview the production build locally** (mirrors what gets deployed):
```bash
npx vite preview
```

**Build the server** (what Render runs):
```bash
npm run server:build
node dist-server/index.js
```

---

## Useful Commands

| Command | What it does |
|---|---|
| `npm run dev` | Start the frontend dev server |
| `npm run server` | Start the backend API |
| `npm run type-check` | Check TypeScript across the whole project without building |
| `npm run build` | Production build of the frontend -> `dist/` |
| `npm run server:build` | Compile the server -> `dist-server/` |
| `npm run preview` | Preview the production frontend build locally |
| `npm run lint` | Run ESLint |
| `npm run format` | Auto-format with Prettier |
| `npm audit` | Check dependencies for known vulnerabilities |

---

## Project Structure

```
foundr/
├── client/
│   ├── features/
│   │   ├── landing/          # Public landing page + loader
│   │   ├── auth/              # Sign in / Sign up (Clerk)
│   │   ├── onboarding/        # Guided setup wizard
│   │   ├── business/          # Startup switcher
│   │   ├── dashboard/         # Metrics dashboard
│   │   ├── transactions/      # Ledger, recurring, trash
│   │   ├── margins/            # Margins report + balance sheet
│   │   ├── settings/           # Account, security, data, appearance
│   │   └── contact/            # Contact page (Cal.com + Web3Forms)
│   └── shared/
│       ├── components/         # Shared Lit components
│       ├── lib/                 # API client, formatting, theming, session handling
│       └── css/                 # Design tokens (one set of custom properties per theme)
├── server/
│   ├── routes/                  # One file per API resource
│   ├── models/                  # Mongoose schemas
│   ├── lib/                      # Business logic
│   └── middleware/               # Auth middleware
├── vite.config.ts                # Frontend build config, every page listed as a build input
├── vercel.json                    # Vercel build/output settings and the /api/* rewrite to Render
└── .env.example                   # Environment variable template
```

---

## Common Issues

**API calls fail locally with a network error**
Make sure `npm run server` is actually running in a separate terminal. The Vite dev server only proxies `/api` requests to it; it doesn't start the server itself.

**MongoDB connection fails**
If using Atlas, make sure your IP is allowed under Network Access. If using local MongoDB, make sure it's running (`mongod`).

**Clerk auth pages redirect incorrectly**
In your Clerk dashboard, set allowed redirect URLs and origins to include `http://localhost:5173` for local dev, and your real domain for production.

**Sign-up/sign-in works locally but fails once deployed**
Check that the production Clerk instance (not the test/dev one) has your live domain added to its allowed origins, and that Render has the production `CLERK_SECRET_KEY` and `CLERK_PUBLISHABLE_KEY` set, not blank or missing.

---

*Back to [README](./README.md)*
