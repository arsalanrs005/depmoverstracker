export type InventoryIntakePayload = {
  call_id?: string;
  retell_call_id?: string;
  contact_id?: string;
  opportunity_id?: string;
  lead_name?: string;
  transcript?: string;
  recording_url?: string;
  call_summary?: string;
  outcome?: string;
  callback_confirmed?: string | boolean;
  move_date?: string;
  move_type?: string;
  home_size?: string;
  bedroom_contents?: string;
  living_room_contents?: string;
  dining_room_contents?: string;
  kitchen_contents?: string;
  office_contents?: string;
  garage_outdoor_contents?: string;
  special_items?: string;
  box_count_estimate?: string;
  storage_needed?: string;
  pickup_address?: string;
  dropoff_address?: string;
  access_notes?: string;
  lead_sentiment?: string;
};

export type ParsedInventoryIntake = {
  retellCallId: string | null;
  contactId: string | null;
  opportunityId: string | null;
  leadName: string | null;
  transcript: string | null;
  recordingUrl: string | null;
  callSummary: string | null;
  outcome: string | null;
  callbackConfirmed: string | null;
  moveDate: string | null;
  moveType: string | null;
  homeSize: string | null;
  bedroomContents: string | null;
  livingRoomContents: string | null;
  diningRoomContents: string | null;
  kitchenContents: string | null;
  officeContents: string | null;
  garageOutdoorContents: string | null;
  specialItems: string | null;
  boxCountEstimate: string | null;
  storageNeeded: string | null;
  pickupAddress: string | null;
  dropoffAddress: string | null;
  accessNotes: string | null;
  leadSentiment: string | null;
  raw: InventoryIntakePayload;
};

function str(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  const s = String(v).trim();
  return s.length ? s : null;
}

/** Pull a first name from summaries like "The agent called Shayaan to collect…" */
function guessLeadName(summary: string | null, transcript: string | null): string | null {
  if (summary) {
    const m = summary.match(/\bcalled\s+([A-Z][a-zA-Z'-]+)\b/);
    if (m?.[1]) return m[1];
  }
  if (transcript) {
    const m = transcript.match(/\bis this\s+([A-Z][a-zA-Z'-]+)\s*\?/i);
    if (m?.[1]) return m[1];
  }
  return null;
}

export function parseInventoryIntake(raw: unknown): ParsedInventoryIntake | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const body = raw as InventoryIntakePayload;

  const retellCallId = str(body.call_id) ?? str(body.retell_call_id);
  const contactId = str(body.contact_id);
  const opportunityId = str(body.opportunity_id);
  const transcript = str(body.transcript);
  const callSummary = str(body.call_summary);
  const leadName = str(body.lead_name) ?? guessLeadName(callSummary, transcript);

  // Need at least one stable identifier or meaningful content
  if (!retellCallId && !contactId && !transcript && !callSummary) return null;

  return {
    retellCallId,
    contactId,
    opportunityId,
    leadName,
    transcript,
    recordingUrl: str(body.recording_url),
    callSummary,
    outcome: str(body.outcome),
    callbackConfirmed: str(body.callback_confirmed),
    moveDate: str(body.move_date),
    moveType: str(body.move_type),
    homeSize: str(body.home_size),
    bedroomContents: str(body.bedroom_contents),
    livingRoomContents: str(body.living_room_contents),
    diningRoomContents: str(body.dining_room_contents),
    kitchenContents: str(body.kitchen_contents),
    officeContents: str(body.office_contents),
    garageOutdoorContents: str(body.garage_outdoor_contents),
    specialItems: str(body.special_items),
    boxCountEstimate: str(body.box_count_estimate),
    storageNeeded: str(body.storage_needed),
    pickupAddress: str(body.pickup_address),
    dropoffAddress: str(body.dropoff_address),
    accessNotes: str(body.access_notes),
    leadSentiment: str(body.lead_sentiment),
    raw: body,
  };
}

export function normalizeInventoryWebhookBody(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === 'object') {
    const obj = raw as Record<string, unknown>;
    if (Array.isArray(obj.items)) return obj.items;
    if (Array.isArray(obj.data)) return obj.data;
    return [raw];
  }
  return [];
}
