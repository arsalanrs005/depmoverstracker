-- Fix ON CONFLICT for seed: partial unique index is not enough for INSERT ... ON CONFLICT (col)
-- Run on DBs that already applied migration-002 with idx_agents_aloware partial index.

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

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'agents'::regclass AND conname = 'agents_agent_id_8x8_key'
  ) THEN
    ALTER TABLE agents ADD CONSTRAINT agents_agent_id_8x8_key UNIQUE (agent_id_8x8);
  END IF;
END $$;
