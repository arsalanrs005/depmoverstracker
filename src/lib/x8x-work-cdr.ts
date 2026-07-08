/**
 * 8x8 Work Analytics CDR API (Basic / X-series — NOT Contact Center).
 * @see https://developer.8x8.com/analytics/docs/work-analytics-cdr-report/
 */

import { transformCdrRow, type ParsedCdrCall } from './cdr-parser';
import { importCdrRows } from './db';

const WORK_BASE = 'https://api.8x8.com/analytics/work';

export type WorkCdrRecord = {
  callId: string;
  direction?: string;
  caller?: string;
  callerName?: string;
  callee?: string;
  calleeName?: string;
  startTime?: string;
  disconnectedTime?: string;
  talkTime?: string;
  talkTimeMS?: number;
  callTime?: number;
  ringDuration?: number;
  answered?: string;
  missed?: string;
  abandoned?: string;
  lastLegDisposition?: string;
  pbxId?: string;
};

type TokenCache = { token: string; expiresAt: number };
let tokenCache: TokenCache | null = null;

function env(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set`);
  return v;
}

function config() {
  return {
    apiKey: env('X8X_WORK_API_KEY'),
    username: env('X8X_WORK_USERNAME'),
    password: env('X8X_WORK_PASSWORD'),
    pbxId: process.env.X8X_WORK_PBX_ID ?? 'allpbxes',
    timeZone: process.env.X8X_WORK_TIMEZONE ?? 'America/New_York',
    pageSize: Number(process.env.X8X_WORK_PAGE_SIZE ?? '200'),
  };
}

/** Format date for 8x8 query: YYYY-MM-DD HH:MM:SS in account timezone */
export function format8x8DateTime(d: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(d);

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '00';
  return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}:${get('second')}`;
}

export async function getWorkAccessToken(): Promise<string> {
  if (tokenCache && Date.now() < tokenCache.expiresAt - 60_000) {
    return tokenCache.token;
  }

  const { apiKey, username, password } = config();
  const body = new URLSearchParams({ username, password });

  const res = await fetch(`${WORK_BASE}/v1/oauth/token`, {
    method: 'POST',
    headers: {
      '8x8-apikey': apiKey,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`8x8 Work auth failed (${res.status}): ${text}`);
  }

  const data = (await res.json()) as { access_token: string; expires_in: number };
  tokenCache = {
    token: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
  return data.access_token;
}

export function transformApiCdrRecord(r: WorkCdrRecord): ParsedCdrCall | null {
  const talkTimeSec = r.talkTimeMS
    ? Math.round(r.talkTimeMS / 1000)
    : r.callTime
      ? Math.round(r.callTime / 1000)
      : 0;

  const answered =
    (r.answered ?? '').toLowerCase() === 'answered'
      ? 'Answered'
      : talkTimeSec > 0 && (r.missed ?? '-') === '-' && (r.abandoned ?? '-') === '-'
        ? 'Answered'
        : r.answered ?? '-';

  return transformCdrRow({
    callId: String(r.callId ?? ''),
    startTime: r.startTime ? new Date(r.startTime) : null,
    answeredTime: null,
    stopTime: r.disconnectedTime ? new Date(r.disconnectedTime) : null,
    direction: r.direction ?? '',
    talkTimeSec,
    callTimeSec: talkTimeSec,
    caller: r.caller ?? '',
    callee: r.callee ?? '',
    callerName: r.callerName ?? '',
    calleeName: r.calleeName ?? '',
    ringDurationSec: r.ringDuration ?? 0,
    answered,
    missed: r.missed ?? '-',
    abandoned: r.abandoned ?? '-',
  });
}

async function fetchCdrPage(params: {
  token: string;
  apiKey: string;
  pbxId: string;
  startTime: string;
  endTime: string;
  timeZone: string;
  pageSize: number;
  scrollId?: string;
}): Promise<{ records: WorkCdrRecord[]; scrollId: string | null; total: number }> {
  const qs = new URLSearchParams({
    pbxId: params.pbxId,
    startTime: params.startTime,
    endTime: params.endTime,
    timeZone: params.timeZone,
    pageSize: String(params.pageSize),
    isCallRecord: 'true',
  });
  if (params.scrollId) qs.set('scrollId', params.scrollId);

  const url = `${WORK_BASE}/v1/cdr?${qs.toString()}`;
  const res = await fetch(url, {
    headers: {
      '8x8-apikey': params.apiKey,
      Authorization: `Bearer ${params.token}`,
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`8x8 Work CDR fetch failed (${res.status}): ${text}`);
  }

  const json = (await res.json()) as {
    meta?: { totalRecordCount?: number; scrollId?: string };
    data?: WorkCdrRecord[];
  };

  const scrollId = json.meta?.scrollId ?? null;
  return {
    records: json.data ?? [],
    scrollId: scrollId === 'No Data' ? null : scrollId,
    total: json.meta?.totalRecordCount ?? 0,
  };
}

/** Fetch all call records in window with pagination */
export async function fetchWorkCdrRecords(start: Date, end: Date): Promise<ParsedCdrCall[]> {
  const { apiKey, pbxId, timeZone, pageSize } = config();
  const token = await getWorkAccessToken();
  const startTime = format8x8DateTime(start, timeZone);
  const endTime = format8x8DateTime(end, timeZone);

  const parsed: ParsedCdrCall[] = [];
  let scrollId: string | undefined;
  let pages = 0;
  const maxPages = 500;

  do {
    const page = await fetchCdrPage({
      token,
      apiKey,
      pbxId,
      startTime,
      endTime,
      timeZone,
      pageSize,
      scrollId,
    });

    for (const rec of page.records) {
      const row = transformApiCdrRecord(rec);
      if (row) parsed.push(row);
    }

    scrollId = page.scrollId ?? undefined;
    pages++;
    if (!scrollId || page.records.length === 0) break;
  } while (pages < maxPages);

  return parsed;
}

/** Sync recent calls from Work Analytics API into call_sessions */
export async function syncWorkCdr(options?: { sinceMinutes?: number }) {
  const sinceMinutes = options?.sinceMinutes ?? Number(process.env.X8X_WORK_SYNC_MINUTES ?? '30');
  const end = new Date();
  const start = new Date(end.getTime() - sinceMinutes * 60_000);

  const rows = await fetchWorkCdrRecords(start, end);
  const result = await importCdrRows(rows, `work-api-${start.toISOString()}`, { skipGhl: true });

  return {
    sinceMinutes,
    fetched: rows.length,
    ...result,
    window: { start: start.toISOString(), end: end.toISOString() },
  };
}

export function isWorkCdrConfigured(): boolean {
  return Boolean(
    process.env.X8X_WORK_API_KEY &&
      process.env.X8X_WORK_USERNAME &&
      process.env.X8X_WORK_PASSWORD
  );
}
