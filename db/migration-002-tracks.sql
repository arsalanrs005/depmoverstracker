-- Track columns: Aloware closers + 8x8 closers / Verification / CS
-- Run after schema.sql on existing databases: psql $DATABASE_URL -f db/migration-002-tracks.sql

ALTER TABLE agents ADD COLUMN IF NOT EXISTS platform TEXT DEFAULT '8x8';
ALTER TABLE agents ADD COLUMN IF NOT EXISTS agent_id_aloware TEXT;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS team TEXT;

-- Full UNIQUE (required for seed ON CONFLICT); partial index alone is insufficient
DROP INDEX IF EXISTS idx_agents_aloware;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'agents'::regclass AND conname = 'agents_agent_id_aloware_key'
  ) THEN
    ALTER TABLE agents ADD CONSTRAINT agents_agent_id_aloware_key UNIQUE (agent_id_aloware);
  END IF;
END $$;

ALTER TABLE call_sessions ADD COLUMN IF NOT EXISTS track TEXT DEFAULT '8x8_closer';
ALTER TABLE call_sessions ADD COLUMN IF NOT EXISTS aloware_communication_id TEXT;
ALTER TABLE call_sessions ADD COLUMN IF NOT EXISTS aloware_disposition_id TEXT;
ALTER TABLE call_sessions ADD COLUMN IF NOT EXISTS aloware_user_id TEXT;
ALTER TABLE call_sessions ADD COLUMN IF NOT EXISTS aloware_user_name TEXT;
ALTER TABLE call_sessions ADD COLUMN IF NOT EXISTS disposition_source TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_call_sessions_aloware_comm
  ON call_sessions (aloware_communication_id) WHERE aloware_communication_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_call_sessions_track ON call_sessions (track);
CREATE INDEX IF NOT EXISTS idx_call_sessions_track_started ON call_sessions (track, started_at DESC);

-- Widen source check for Aloware legs
ALTER TABLE call_sessions DROP CONSTRAINT IF EXISTS call_sessions_source_check;
ALTER TABLE call_sessions ADD CONSTRAINT call_sessions_source_check
  CHECK (source IN ('retell', '8x8_outbound', '8x8_inbound', 'aloware_inbound', 'aloware_outbound'));

UPDATE call_sessions SET track = 'retell' WHERE source = 'retell' AND (track IS NULL OR track = '8x8_closer');
