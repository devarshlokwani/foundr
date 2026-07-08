# Foundr - Setup

## Prerequisites
- Node.js 18+ and npm
- A MongoDB database (local, or free at mongodb.com/atlas)
- A Clerk account (free at clerk.com)

## First-time setup
1. Install dependencies:
   ```
   npm install
   ```
2. Copy the env template and fill in your keys:
   ```
   cp .env.example .env
   ```
   Then edit `.env` with your MongoDB URI and Clerk keys.

## Daily development
- Start the frontend (Vite, hot-reload):
  ```
  npm run dev
  ```
  Opens at http://localhost:5173

- Start the backend (when built):
  ```
  npm run server
  ```
  Runs at http://localhost:3000, the frontend proxies /api to it.

## Useful commands
- `npm run type-check` - check TypeScript without building
- `npm run build` - production build into dist/
- `npm run preview` - preview the production build
- `npm run format` - auto-format with Prettier

## Stack
- Frontend: Lit (Web Components) + TypeScript + GSAP, bundled by Vite
- Backend: Node + Express + TypeScript (tsx)
- Database: MongoDB + Mongoose
- Auth: Clerk
- Future: swap Lit for React, Vite and the typed data layer carry over
