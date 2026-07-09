-- Schedule 8x8 CDR sync every 5 minutes via pg_cron + pg_net (Supabase).
-- Replaces Vercel Hobby cron (limited to once/day).
--
-- Prerequisites:
--   1. Deploy call-tracker to Vercel; set CRON_SECRET in Vercel env.
--   2. Run section A once in Supabase SQL Editor.
--   3. Replace placeholders below, then run section B.
--
-- Docs: https://supabase.com/docs/guides/database/extensions/pg_cron

-- =============================================================================
-- A) One-time: enable extensions + store secrets (use Vault or DB settings)
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;

-- Option 1 (recommended): Supabase Vault secret named 'cron_secret'
--   Dashboard → Project Settings → Vault → New secret: cron_secret = same as CRON_SECRET on Vercel
--
-- Option 2: database setting (run once, replace values):
-- ALTER DATABASE postgres SET app.settings.sync_url = 'https://YOUR-APP.vercel.app/api/cron/sync-8x8-analytics';
-- ALTER DATABASE postgres SET app.settings.cron_secret = 'your-cron-secret';

-- =============================================================================
-- B) Schedule: every 5 minutes → Vercel sync endpoint
-- =============================================================================

-- Remove previous job if re-running
SELECT cron.unschedule(jobid)
FROM cron.job
WHERE jobname = 'sync-8x8-cdr-every-5min';

-- Using Vault for CRON_SECRET (create secret 'cron_secret' in Dashboard first)
SELECT cron.schedule(
  'sync-8x8-cdr-every-5min',
  '*/5 * * * *',
  $$
  SELECT net.http_get(
    url := coalesce(
      current_setting('app.settings.sync_url', true),
      'https://YOUR-APP.vercel.app/api/cron/sync-8x8-analytics'
    ),
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (
        SELECT decrypted_secret
        FROM vault.decrypted_secrets
        WHERE name = 'cron_secret'
        LIMIT 1
      )
    ),
    timeout_milliseconds := 55000
  ) AS request_id;
  $$
);

-- Verify
SELECT jobid, jobname, schedule, active FROM cron.job WHERE jobname = 'sync-8x8-cdr-every-5min';

-- Optional: view recent pg_net responses (debug)
-- SELECT * FROM net._http_response ORDER BY created DESC LIMIT 10;
