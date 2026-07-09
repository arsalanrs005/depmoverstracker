-- Manager-entered quote / booking details (Aloware + closers)
ALTER TABLE call_sessions ADD COLUMN IF NOT EXISTS quote_type TEXT
  CHECK (quote_type IS NULL OR quote_type IN ('quoted', 'booked'));
ALTER TABLE call_sessions ADD COLUMN IF NOT EXISTS job_value_cents INTEGER;
ALTER TABLE call_sessions ADD COLUMN IF NOT EXISTS move_date DATE;
ALTER TABLE call_sessions ADD COLUMN IF NOT EXISTS origin_city TEXT;
ALTER TABLE call_sessions ADD COLUMN IF NOT EXISTS destination_city TEXT;
ALTER TABLE call_sessions ADD COLUMN IF NOT EXISTS quote_details_at TIMESTAMPTZ;
ALTER TABLE call_sessions ADD COLUMN IF NOT EXISTS quote_entered_by TEXT;

CREATE INDEX IF NOT EXISTS idx_call_sessions_quote_type ON call_sessions (quote_type)
  WHERE quote_type IS NOT NULL;
