import { normalizePhone } from './cdr-parser';

const GHL_BASE = () => process.env.GHL_BASE_URL ?? 'https://services.leadconnectorhq.com';
const GHL_VERSION = () => process.env.GHL_VERSION ?? '2021-07-28';

function ghlHeaders() {
  const key = process.env.GHL_API_KEY;
  if (!key) return null;
  return {
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
    Version: GHL_VERSION(),
  };
}

export type GhlContactMatch = {
  contactId: string;
  opportunityId: string | null;
  firstName: string | null;
  lastName: string | null;
  pickupCity: string | null;
  dropoffCity: string | null;
  inventoryLink: string | null;
};

function digits10(phone: string): string {
  const d = phone.replace(/\D/g, '');
  if (d.length === 11 && d.startsWith('1')) return d.slice(1);
  return d.length >= 10 ? d.slice(-10) : d;
}

export async function findGhlContactByPhone(phone: string): Promise<GhlContactMatch | null> {
  const headers = ghlHeaders();
  const locationId = process.env.GHL_LOCATION_ID;
  if (!headers || !locationId) return null;

  const normalized = normalizePhone(phone);
  const last10 = digits10(normalized);

  try {
    const res = await fetch(`${GHL_BASE()}/contacts/search`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        locationId,
        page: 1,
        pageLimit: 5,
        filters: [{ field: 'phone', operator: 'eq', value: normalized }],
      }),
    });

    if (!res.ok) {
      const alt = await fetch(`${GHL_BASE()}/contacts/search`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          locationId,
          page: 1,
          pageLimit: 5,
          filters: [{ field: 'phone', operator: 'contains', value: last10 }],
        }),
      });
      if (!alt.ok) return null;
      return parseSearchResult(await alt.json());
    }
    return parseSearchResult(await res.json());
  } catch {
    return null;
  }
}

function getCustomField(contact: Record<string, unknown>, key: string): string | null {
  const fields = contact.customFields as Array<{ key?: string; id?: string; value?: string; field_value?: string }> | undefined;
  if (!fields) return null;
  const f = fields.find((x) => x.key === key || x.id === key);
  return f?.value ?? f?.field_value ?? null;
}

function parseSearchResult(data: Record<string, unknown>): GhlContactMatch | null {
  const contacts = (data.contacts ?? data.items ?? []) as Record<string, unknown>[];
  if (!contacts.length) return null;
  const c = contacts[0];
  const opps = (c.opportunities ?? []) as Array<{ id?: string }>;

  return {
    contactId: String(c.id ?? ''),
    opportunityId: opps[0]?.id ?? null,
    firstName: (c.firstName as string) ?? null,
    lastName: (c.lastName as string) ?? null,
    pickupCity: getCustomField(c, 'pickup_city') ?? getCustomField(c, 'pickup_location'),
    dropoffCity: getCustomField(c, 'dropoff_city') ?? getCustomField(c, 'dropoff_location'),
    inventoryLink: getCustomField(c, 'inventory_session_link'),
  };
}

export async function syncDispositionToGhl(params: {
  contactId: string;
  dispositionCode: string;
  dispositionTag: string;
  notes?: string;
  callbackAt?: string | null;
}) {
  const headers = ghlHeaders();
  if (!headers) return { skipped: true, reason: 'no_ghl_key' };

  await fetch(`${GHL_BASE()}/contacts/${params.contactId}/tags`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ tags: [params.dispositionTag, 'inbound-call-received'] }),
  });

  const customFields: Array<{ key: string; field_value: string }> = [
    { key: 'last_disposition', field_value: params.dispositionCode },
    { key: 'last_call_source', field_value: 'call-tracker' },
  ];
  if (params.callbackAt) {
    customFields.push({ key: 'callback_datetime', field_value: params.callbackAt });
  }

  await fetch(`${GHL_BASE()}/contacts/${params.contactId}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ customFields }),
  });

  if (params.notes) {
    await fetch(`${GHL_BASE()}/contacts/${params.contactId}/notes`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ body: params.notes }),
    }).catch(() => null);
  }

  return { ok: true, tag: params.dispositionTag };
}
