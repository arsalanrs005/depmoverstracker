-- Expand quote_type for Aloware Quote Tracking statuses
ALTER TABLE call_sessions DROP CONSTRAINT IF EXISTS call_sessions_quote_type_check;
ALTER TABLE call_sessions ADD CONSTRAINT call_sessions_quote_type_check
  CHECK (quote_type IS NULL OR quote_type IN ('quoted', 'booked_pending', 'booked'));
