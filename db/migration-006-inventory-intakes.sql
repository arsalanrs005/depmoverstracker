-- After-hour Retell inventory intakes (n8n → webhook)

CREATE TABLE IF NOT EXISTS inventory_intakes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  retell_call_id TEXT UNIQUE,
  contact_id TEXT,
  opportunity_id TEXT,
  lead_name TEXT,
  transcript TEXT,
  recording_url TEXT,
  call_summary TEXT,
  outcome TEXT,
  callback_confirmed TEXT,
  move_date TEXT,
  move_type TEXT,
  home_size TEXT,
  bedroom_contents TEXT,
  living_room_contents TEXT,
  dining_room_contents TEXT,
  kitchen_contents TEXT,
  office_contents TEXT,
  garage_outdoor_contents TEXT,
  special_items TEXT,
  box_count_estimate TEXT,
  storage_needed TEXT,
  pickup_address TEXT,
  dropoff_address TEXT,
  access_notes TEXT,
  lead_sentiment TEXT,
  raw_payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inventory_intakes_created
  ON inventory_intakes (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_inventory_intakes_contact
  ON inventory_intakes (contact_id)
  WHERE contact_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_inventory_intakes_outcome
  ON inventory_intakes (outcome)
  WHERE outcome IS NOT NULL;
