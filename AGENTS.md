<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Learned User Preferences

- Prefer Simplified Chinese for assistant replies in this workspace.
- After implementing changes, user expects them pushed/deployed to production (Vercel), not just committed locally — recurring check-in is “同步到服务器了吗”.
- User typically asks the agent to execute/deploy the plan directly after approval (e.g., “帮我执行”, “部署上线”), rather than stopping at a plan.
- Prioritize business value over raw coverage: focus on high-value metros and high-quality restaurant leads rather than 100% nationwide scraping.

## Learned Workspace Facts

- Public UI and site title: **Restaurant Leads Finder** (user-facing name for the dashboard and marketing pages).
- Leads data is stored in **Supabase** (schema and migrations under `supabase/schema.sql`; server routes use the service role — see `.env.example`).
- Lead targeting and import logic align with **newly registered food-service businesses**; business context is selling restaurant POS (MenuSifu-related sales KPI).
- Production custom domain is `leads.maxwelllai.com` (Vercel). If the site is unreachable, treat DNS propagation or resolver differences as likely causes before assuming a bad deploy; try another public DNS or the project’s `*.vercel.app` URL.
- Dashboard access is env-based (`AUTH_SECRET`, `AUTH_ALLOWED_EMAIL`, `AUTH_PASSWORD`, optional `AUTH_USERS_JSON` for additional email/password pairs — see `.env.local` / Vercel and `.env.example`); `middleware.ts` sends unauthenticated users to `/login`. n8n ingestion uses `/api/leads/upsert` and `/api/leads/filings/sync` with the webhook secret header and does not rely on the browser session.
- Framework note: Next.js may eventually replace the `middleware` file convention with `proxy`; follow `node_modules/next/dist/docs/` when migrating.
- Lead sourcing spans multiple US metros (SF Bay Area, LA, NYC, Chicago, Houston, Seattle, Austin, Berkeley, Boston); per-city adapters live under `lib/sources/` with a shared `registry.ts`, `metro-config.ts`, and a `socrata.ts` helper for Socrata-based portals.
- Preferred data sources are government open-data portals (food permits / health inspections) over generic LLC/business registrations, with enrichment via third-party APIs (e.g., Google Places, Yelp) and AI classification to filter true restaurants.
- Ingestion pipeline lives under `lib/pipeline/` (`ingest`, `normalize`, `dedupe`, `classify`, `enrich`, `score`, `run`) with a scheduled entrypoint at `app/api/cron/ingest-all/route.ts` (see `vercel.json` for cron wiring).
- Dashboard includes a region/city filter and a leads map; each lead links out to government filing search entry points (e.g., CA SOS, cabizfile) and surfaces all registration fields (owner name, DBA, etc.) on the lead profile.
- Interactive imports use single-source-per-request + frontend loop to stay within Vercel function timeouts; `/api/leads/import` accepts `{ sourceId }` / `{ metro }` / `{ metro: 'all' }` (list-only). AI classify and Google Places enrichment are skipped by default on the interactive path and deferred to cron or a future `/reclassify` endpoint.
- Supabase schema migrations are **not** auto-applied by Vercel deploys — changes to `supabase/schema.sql` (or standalone files under `supabase/migration_*.sql`) must be pasted into the Supabase SQL Editor and run manually. `/api/leads/import` has a degradation fallback in `lib/pipeline/write-leads.ts` that writes only the legacy columns when new columns are missing, so the app stays functional in the interval between code deploy and DB migration.
- Supabase `.upsert({ onConflict: 'col_a,col_b' })` requires a **non-partial** unique index on `(col_a, col_b)`; a `WHERE`-clause partial index is not matched by PostgREST's generated `ON CONFLICT (col_a, col_b)` and yields `there is no unique or exclusion constraint matching the ON CONFLICT specification`. Use Postgres default `NULLS DISTINCT` semantics instead of a `WHERE column IS NOT NULL` partial index. Test covered by `tests/schema-migration.test.ts` (`idx_leads_source_external` must not contain `WHERE`).
- Vercel validates `CRON_SECRET` at build time when `vercel.json` declares `crons` — leading/trailing whitespace (e.g. newline from `openssl rand -base64 32` without `tr -d '\n'`) causes all builds to ERROR. Either re-save the secret without whitespace or temporarily remove the `crons` array from `vercel.json` to unblock deploys.
