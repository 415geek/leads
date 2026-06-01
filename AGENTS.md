<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Learned User Preferences

- Prefer Simplified Chinese for assistant replies in this workspace.
- After implementing changes, user expects them pushed/deployed to production (Vercel), not just committed locally — recurring check-in is “同步到服务器了吗”.
- User typically asks the agent to execute/deploy the plan directly after approval (e.g., “帮我执行”, “部署上线”), rather than stopping at a plan.
- Prioritize business value over raw coverage: focus on high-value metros and high-quality restaurant leads rather than 100% nationwide scraping.
- On mobile, the `/leads` list should show each row without requiring horizontal scrolling.

## Learned Workspace Facts

- Public UI and site title: **Restaurant Leads Finder** (user-facing name for the dashboard and marketing pages).
- Leads data is stored in **Supabase** (schema and migrations under `supabase/schema.sql`; server routes use the service role — see `.env.example`).
- Lead targeting and import logic align with **newly registered food-service businesses**; business context is selling restaurant POS (MenuSifu-related sales KPI).
- Production custom domain is `leads.maxwelllai.com` (Vercel). If the site is unreachable, treat DNS propagation or resolver differences as likely causes before assuming a bad deploy; try another public DNS or the project’s `*.vercel.app` URL.
- Dashboard access is env-based (`AUTH_SECRET`, `AUTH_ALLOWED_EMAIL`, `AUTH_PASSWORD`, optional `AUTH_USERS_JSON` for additional email/password pairs — see `.env.local` / Vercel and `.env.example`); `middleware.ts` sends unauthenticated users to `/login`. n8n ingestion uses `/api/leads/upsert` and `/api/leads/filings/sync` with the webhook secret header and does not rely on the browser session.
- Lead sourcing spans multiple US metros (SF Bay Area, LA, NYC, Chicago, Houston, Seattle, Austin, Berkeley, Boston); per-city adapters live under `lib/sources/` with a shared `registry.ts`, `metro-config.ts`, and a `socrata.ts` helper for Socrata-based portals. Houston also ingests City Planning Weekly Permit eReport XLSX archives (`dev_reports-archives` on houstontx.gov) via `lib/houston-dev-reports/` and `lib/sources/houston-*`.
- LA sourcing targets newly registered restaurant businesses; routine license renewals on existing locations are labeled 「已存在店铺，牌照更新」 (not treated as new openings).
- NYC DOHMH (Socrata 43nn-pn8j) defaults to **Pre-permit** `inspection_type` rows only (90-day lookback); Cycle 年检需 `NYC_INCLUDE_CYCLE_INSPECTIONS=1`。规则层见 `lib/nyc-opening-intel.ts`，写入 `ai_classification.nyc_opening`。
- Preferred data sources are government open-data portals (food permits / health inspections) over generic LLC/business registrations, with enrichment via third-party APIs (e.g., Google Places, Yelp) and AI classification to filter true restaurants.
- Ingestion pipeline lives under `lib/pipeline/` (`ingest`, `normalize`, `dedupe`, `classify`, `enrich`, `score`, `run`) with cron at `app/api/cron/ingest-all/route.ts` (`vercel.json`). Interactive `/api/leads/import` is single-source-per-request with a frontend loop (timeouts); accepts `{ sourceId }` / `{ metro }` / `{ metro: 'all' }` (list-only); skips AI classify and Google Places by default (deferred to cron or future `/reclassify`).
- Dashboard includes a region filter, searchable city filter (cities from `city` column plus address parsing in `lib/lead-city.ts`; suggestions via `GET /api/leads/cities`; list `city` query matches both `city` and `address`), optional hide-chains toggle, and a leads map; each lead links out to government filing search entry points (e.g., CA SOS, cabizfile) and surfaces all registration fields (owner name, DBA, etc.) on the lead profile. Ingest `normalizeDraft` backfills missing `city` from `address`.
- Supabase schema migrations are **not** auto-applied by Vercel deploys — paste `supabase/schema.sql` or `supabase/migration_*.sql` into the SQL Editor manually. `/api/leads/import` degrades via `lib/pipeline/write-leads.ts` to legacy columns when new columns are missing. `.upsert({ onConflict: 'col_a,col_b' })` needs a **non-partial** unique index on `(col_a, col_b)` (not `WHERE …` partial); see `tests/schema-migration.test.ts`.
- Vercel validates `CRON_SECRET` at build time when `vercel.json` declares `crons` — leading/trailing whitespace (e.g. newline from `openssl rand -base64 32` without `tr -d '\n'`) causes all builds to ERROR. Either re-save the secret without whitespace or temporarily remove the `crons` array from `vercel.json` to unblock deploys.
