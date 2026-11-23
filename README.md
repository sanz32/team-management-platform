# Team Management Platform

Full-stack web platform for running a service team: member and role management, rosters and
schedules, earnings and payout batches, performance goals, Discord notifications, and a public
storefront where customers browse a catalog and submit booking requests.

It was built for an online gaming community (a World of Warcraft raiding team), so much of the
domain data comes from game APIs; the engineering patterns are general.

> The UI copy is in Spanish; the public storefront is bilingual (English by default).

## Features

**Internal portal (Discord sign-in, role-based access)**
- Roles (`admin`, `manager`, `member`, `guest`, `friend`) enforced in the proxy layer and in every API route.
- Member directory with soft delete and restore, nickname onboarding, per-user appearance settings.
- Character data from the Blizzard Battle.net API (item level, spec, equipment, raid lockouts), plus Warcraft Logs and Raider.IO integrations.
- Roster generator that builds balanced groups from availability, roles and item level, with saved rosters and Discord webhook announcements.
- Schedules, days off with swap requests, weekly goals with history, points with evidence uploads and an appeal flow.
- Earnings ledger, service cuts, discounts and payout batches with rounding rules covered by tests.
- Desktop companion pairing (device-code flow) so a local app can upload data with a per-device bearer token.
- In-app product update notes and notifications.

**Public storefront (`/boost`, no account required)**
- Catalog with daily deals picked deterministically from the date (no cron, no table writes).
- Schedule of upcoming sessions with live capacity; customers pick content inside a session.
- Booking requests confirmed through Discord OAuth; an HMAC-signed draft carries the request across the OAuth round trip.
- Bilingual UI (English/Spanish); times rendered on the client in the visitor's time zone to avoid hydration mismatches.
- Admin panel to manage offers, import the external schedule (JSON sync endpoint or pasted table) and review leads.

## Architecture highlights

- **Atomic capacity in Postgres**: seats are claimed and released through SQL functions (`boost_claim_slot` / `boost_release_slot`), so concurrent bookings cannot oversell. Capacity is tracked as two counters (externally imported vs. locally held) so an import never erases local holds.
- **Idempotent schedule sync**: one shared upsert (`applyParsedSlots`) for both import paths, keyed by external id with a fallback key; sessions that already started are never deactivated by a sync. The decision logic is a pure function with its own tests.
- **Caching with explicit invalidation**: catalog queries use `unstable_cache` with tags and every write path calls `revalidateTag`; live capacity is intentionally never cached.
- **Maintenance without cron**: expired sessions are pruned lazily with `after()` from regular requests instead of scheduled jobs.
- **Abuse protection on public forms**: honeypot field, signed minimum form time and per-IP rate limiting.
- **Security headers**: Content Security Policy and related headers configured in `next.config.ts`.
- **Data isolation**: public tables use their own prefix with closed RLS; the database is only accessed server-side, and public pages use reduced column sets.
- **Safe fetch helpers** (`readJson`) so empty error responses never crash the UI.
- **Test suite**: about 800 Vitest tests covering business logic (capacity, pricing, deals, imports, payouts, rosters, goals).

## Tech stack

Next.js 16 (App Router, Turbopack) · React 19 · TypeScript · Tailwind CSS v4 · NextAuth v5 (Discord OAuth) ·
Supabase (Postgres) · Vitest · Blizzard, Warcraft Logs, Raider.IO and Discord APIs

## Project structure

```
app/(portal)/       internal screens
app/boost/          public storefront
app/api/            route handlers
lib/                business logic (tests next to each module)
proxy.ts            request gate (Next.js 16 proxy)
supabase/           schema.sql and incremental migrations
mrt-break-watcher/  small Node companion that reports raid breaks from the game chat log
```

## Running locally

Requirements: Node.js 20+ and a Supabase project.

```bash
npm install
cp .env.example .env.local    # fill in the values
npm run dev
```

Database: run `supabase/schema.sql` in the Supabase SQL editor, then the files in
`supabase/migrations/` in chronological order.

```bash
npm run test        # Vitest
npm run typecheck   # tsc --noEmit
npm run lint        # ESLint
npm run build       # production build
```

## Screenshots

_Coming soon._

## License

Copyright (c) 2026 Juan Sanz. All rights reserved.

The source code is published for viewing and evaluation only. No permission is granted to use, copy, modify, distribute or sublicense it without prior written permission. See [LICENSE](LICENSE).
