-- Manual agent quote / deposit totals entered from Granot (day or week)

CREATE TABLE IF NOT EXISTS agent_quote_manual (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  period_type TEXT NOT NULL CHECK (period_type IN ('day', 'week')),
  period_start DATE NOT NULL,
  quotes_call INTEGER NOT NULL DEFAULT 0 CHECK (quotes_call >= 0),
  quotes_email INTEGER NOT NULL DEFAULT 0 CHECK (quotes_email >= 0),
  deposits_collected INTEGER NOT NULL DEFAULT 0 CHECK (deposits_collected >= 0),
  entered_by TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (agent_id, period_type, period_start)
);

CREATE INDEX IF NOT EXISTS idx_agent_quote_manual_period
  ON agent_quote_manual (period_type, period_start DESC);

CREATE INDEX IF NOT EXISTS idx_agent_quote_manual_agent
  ON agent_quote_manual (agent_id);
