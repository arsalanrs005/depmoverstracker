-- UGVL Call Tracker schema (T0–T4 + CDR ingest)
-- Apply: npm run db:push

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  agent_id_8x8 TEXT UNIQUE,
  agent_id_aloware TEXT UNIQUE,
  platform TEXT NOT NULL DEFAULT '8x8' CHECK (platform IN ('8x8', 'aloware')),
  ghl_user_id TEXT,
  email TEXT,
  ring_group TEXT,
  team TEXT CHECK (team IN ('inbound_closers', '8x8_closer', 'verification', 'cs', 'retell')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS call_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ghl_contact_id TEXT,
  ghl_opportunity_id TEXT,
  phone TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('retell', '8x8_outbound', '8x8_inbound', 'aloware_inbound', 'aloware_outbound')),
  track TEXT NOT NULL DEFAULT '8x8_closer' CHECK (track IN ('aloware_closer', '8x8_closer', 'verification', 'cs', 'retell')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'ringing', 'in_progress', 'completed', 'failed')),
  retell_call_id TEXT UNIQUE,
  retell_agent_id TEXT,
  x8x_interaction_id TEXT UNIQUE,
  aloware_communication_id TEXT UNIQUE,
  aloware_disposition_id TEXT,
  aloware_user_id TEXT,
  aloware_user_name TEXT,
  x8x_transaction_id TEXT,
  x8x_campaign_id TEXT,
  agent_id_8x8 TEXT,
  agent_name TEXT,
  queue_name TEXT,
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  duration_sec INTEGER,
  hangup_reason TEXT,
  disposition_code TEXT,
  disposition_source TEXT CHECK (disposition_source IN ('manager', 'aloware_agent', 'auto', 'retell')),
  wrap_up_code TEXT,
  outbound_phone_code TEXT,
  call_outcome TEXT NOT NULL DEFAULT 'pending' CHECK (call_outcome IN ('good', 'bad', 'neutral', 'pending')),
  agent_notes_8x8 TEXT,
  agent_notes_app TEXT,
  recording_files JSONB DEFAULT '[]'::jsonb,
  retell_transcript TEXT,
  retell_analysis JSONB,
  synced_to_ghl_at TIMESTAMPTZ,
  needs_disposition BOOLEAN NOT NULL DEFAULT false,
  disposition_submitted_at TIMESTAMPTZ,
  callback_at TIMESTAMPTZ,
  cdr_direction TEXT,
  cdr_answered TEXT,
  cdr_missed TEXT,
  cdr_abandoned TEXT,
  caller_name TEXT,
  lead_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_call_sessions_phone ON call_sessions (phone);
CREATE INDEX IF NOT EXISTS idx_call_sessions_ghl_contact ON call_sessions (ghl_contact_id);
CREATE INDEX IF NOT EXISTS idx_call_sessions_retell ON call_sessions (retell_call_id);
CREATE INDEX IF NOT EXISTS idx_call_sessions_x8x ON call_sessions (x8x_interaction_id);
CREATE INDEX IF NOT EXISTS idx_call_sessions_started ON call_sessions (started_at DESC);
CREATE INDEX IF NOT EXISTS idx_call_sessions_outcome ON call_sessions (call_outcome);
CREATE INDEX IF NOT EXISTS idx_call_sessions_needs_disp ON call_sessions (needs_disposition) WHERE needs_disposition = true;
CREATE INDEX IF NOT EXISTS idx_call_sessions_track ON call_sessions (track);
CREATE INDEX IF NOT EXISTS idx_call_sessions_aloware ON call_sessions (aloware_communication_id);
CREATE INDEX IF NOT EXISTS idx_call_sessions_agent ON call_sessions (agent_id_8x8);

CREATE TABLE IF NOT EXISTS deal_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ghl_contact_id TEXT NOT NULL,
  ghl_opportunity_id TEXT,
  stage_id TEXT NOT NULL,
  stage_name TEXT,
  agent_name TEXT,
  event_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  raw_payload JSONB
);

CREATE INDEX IF NOT EXISTS idx_deal_events_opp ON deal_events (ghl_opportunity_id);
CREATE INDEX IF NOT EXISTS idx_deal_events_at ON deal_events (event_at DESC);

CREATE TABLE IF NOT EXISTS webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source TEXT NOT NULL,
  event_type TEXT NOT NULL,
  external_id TEXT,
  payload JSONB NOT NULL,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_webhook_events_source ON webhook_events (source, created_at DESC);

CREATE TABLE IF NOT EXISTS cdr_imports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  filename TEXT,
  rows_total INTEGER NOT NULL DEFAULT 0,
  rows_inserted INTEGER NOT NULL DEFAULT 0,
  rows_skipped INTEGER NOT NULL DEFAULT 0,
  rows_updated INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Run seed separately: psql $DATABASE_URL -f db/seed-agents.sql
