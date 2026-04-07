<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Learned User Preferences

- Prefer Simplified Chinese for assistant replies in this workspace.

## Learned Workspace Facts

- Production custom domain is `leads.maxwelllai.com` (Vercel). If the site is unreachable, treat DNS propagation or resolver differences as likely causes before assuming a bad deploy; try another public DNS or the project’s `*.vercel.app` URL.
- Dashboard access is env-based (`AUTH_SECRET`, `AUTH_ALLOWED_EMAIL`, `AUTH_PASSWORD` — see `.env.local` / Vercel and `.env.example`); `middleware.ts` sends unauthenticated users to `/login`. n8n ingestion uses `/api/leads/upsert` with the webhook secret header and does not rely on the browser session.
- Framework note: Next.js may eventually replace the `middleware` file convention with `proxy`; follow `node_modules/next/dist/docs/` when migrating.
