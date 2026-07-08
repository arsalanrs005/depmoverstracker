/**
 * Sync 8x8 Work CDR from start of current week (Monday 00:00 ET) through now.
 * Usage: npm run sync:week
 */
import fs from 'fs';
import path from 'path';
import { fetchWorkCdrRecords, isWorkCdrConfigured } from '../src/lib/x8x-work-cdr';
import { importCdrRows } from '../src/lib/db';

function loadEnvLocal() {
  if (process.env.DATABASE_URL) return;
  const envPath = path.join(process.cwd(), '.env.local');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) process.env[m[1].trim()] = m[2].trim();
  }
}

function weekStartMondayEt(now = new Date()): Date {
  const tz = 'America/New_York';
  const dayStr = now.toLocaleDateString('en-US', { timeZone: tz, weekday: 'short' });
  const daysFromMon = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 }[dayStr.slice(0, 3)] ?? 0;

  const dateParts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const y = dateParts.find((p) => p.type === 'year')?.value ?? '2026';
  const m = dateParts.find((p) => p.type === 'month')?.value ?? '01';
  const d = dateParts.find((p) => p.type === 'day')?.value ?? '01';
  const dayNum = Number(d) - daysFromMon;

  // Midnight ET on Monday — approximate via offset (EDT UTC-4)
  const iso = `${y}-${m}-${String(dayNum).padStart(2, '0')}T00:00:00-04:00`;
  return new Date(iso);
}

async function main() {
  loadEnvLocal();

  if (!isWorkCdrConfigured()) {
    console.error('Missing X8X_WORK_API_KEY, X8X_WORK_USERNAME, or X8X_WORK_PASSWORD');
    process.exit(1);
  }
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is required');
    process.exit(1);
  }

  const end = new Date();
  const start = weekStartMondayEt(end);
  console.log('Fetching 8x8 CDR:', start.toISOString(), '→', end.toISOString());

  const rows = await fetchWorkCdrRecords(start, end);
  console.log(`Fetched ${rows.length} call records from 8x8`);

  const result = await importCdrRows(rows, `work-api-week-${start.toISOString()}`, { skipGhl: true });
  console.log(JSON.stringify({ ok: true, window: { start: start.toISOString(), end: end.toISOString() }, fetched: rows.length, ...result }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
