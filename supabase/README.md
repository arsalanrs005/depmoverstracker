# Supabase cron (replaces Vercel Hobby 5-min cron)

Vercel **Hobby** only allows cron jobs **once per day**. For 8x8 CDR every 5 minutes, use **Supabase `pg_cron` + `pg_net`** to HTTP-call your deployed sync endpoint.

This is **not** a Postgres row trigger — nothing in the DB fires on insert. It is a **scheduled HTTP ping** from Supabase to Vercel.

## Architecture

```
Supabase pg_cron (every 5 min, UTC)
        ↓  net.http_get + Authorization: Bearer CRON_SECRET
Vercel  GET /api/cron/sync-8x8-analytics
        ↓
8x8 Work CDR API → Postgres (DATABASE_URL)
```

All sync logic stays in the Next.js app (`src/lib/x8x-work-cdr.ts`). No Edge Function rewrite required.

## Setup

### 1. Vercel

1. Deploy [depmoverstracker](https://github.com/arsalanrs005/depmoverstracker).
2. Set env vars: `DATABASE_URL`, `X8X_WORK_*`, `CRON_SECRET` (random string).
3. **Remove** or ignore the daily-only cron in `vercel.json` (already cleared for Hobby).

Test manually:

```bash
curl -H "Authorization: Bearer YOUR_CRON_SECRET" \
  "https://YOUR-APP.vercel.app/api/cron/sync-8x8-analytics"
```

### 2. Supabase SQL Editor

1. **Database → Extensions:** enable `pg_cron` and `pg_net` (if not already).
2. **Vault:** create secret `cron_secret` = same value as Vercel `CRON_SECRET`.
3. Run `supabase/cron-sync-8x8.sql` — replace `YOUR-APP.vercel.app` in the SQL if not using `app.settings.sync_url`.

Or set URL once:

```sql
ALTER DATABASE postgres SET app.settings.sync_url = 'https://YOUR-APP.vercel.app/api/cron/sync-8x8-analytics';
```

### 3. Confirm

```sql
SELECT jobid, jobname, schedule, active FROM cron.job;
```

After 5–10 minutes, check new rows in `call_sessions` or Vercel function logs.

## Alternatives

| Approach | Pros | Cons |
|----------|------|------|
| **pg_cron → Vercel** (recommended) | Reuses existing code | Needs Vault + Vercel URL |
| **Supabase Edge Function** | Runs inside Supabase | Must port 8x8 sync to Deno |
| **n8n schedule** | You already use n8n | Another moving part |
| **Vercel Pro cron** | Simplest ops | Paid |

## Timezone

`pg_cron` uses **UTC**. `*/5 * * * *` = every 5 minutes UTC (same wall-clock interval everywhere).

## Unschedule

```sql
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'sync-8x8-cdr-every-5min';
```
