export function normalizePhone(phone: string | null | undefined): string {
  const digits = (phone ?? '').replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  if ((phone ?? '').startsWith('+')) return phone!.trim();
  return (phone ?? '').trim();
}

export type RetellWebhookBody = {
  event?: string;
  call?: {
    call_id?: string;
    agent_id?: string;
    from_number?: string;
    to_number?: string;
    start_timestamp?: number;
    end_timestamp?: number;
    duration_ms?: number;
    transcript?: string;
    call_analysis?: Record<string, unknown>;
    metadata?: {
      contact_id?: string;
      opportunity_id?: string;
      source?: string;
    };
    retell_llm_dynamic_variables?: Record<string, string>;
  };
};

export function parseRetellEvent(body: RetellWebhookBody) {
  const event = body.event ?? 'unknown';
  const call = body.call ?? {};
  const metadata = call.metadata ?? {};
  const phone = normalizePhone(call.to_number ?? call.from_number);
  const durationSec = call.duration_ms ? Math.round(call.duration_ms / 1000) : undefined;

  return {
    event,
    retellCallId: call.call_id ?? '',
    retellAgentId: call.agent_id,
    phone,
    ghlContactId: metadata.contact_id,
    ghlOpportunityId: metadata.opportunity_id,
    transcript: call.transcript,
    analysis: call.call_analysis,
    durationSec,
    retellOutcome: typeof call.call_analysis?.call_outcome === 'string'
      ? call.call_analysis.call_outcome
      : undefined,
  };
}
