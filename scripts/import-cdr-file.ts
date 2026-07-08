/**
 * Bulk import 8x8 CDR CSV into Supabase.
 * Usage: npm run import:cdr -- "/path/to/file.csv"
 */
import fs from 'fs';
import path from 'path';
import { parseCdrCsv } from '../src/lib/cdr-parser';
import { importCdrRows } from '../src/lib/db';

// Load .env.local
const envPath = path.join(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) process.env[m[1].trim()] = m[2].trim();
  }
}

async function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error('Usage: npm run import:cdr -- "/path/to/Call_Records.csv"');
    process.exit(1);
  }

  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved)) {
    console.error('File not found:', resolved);
    process.exit(1);
  }

  console.log('Reading', resolved);
  const text = fs.readFileSync(resolved, 'utf8');
  const rows = parseCdrCsv(text);
  console.log('Parsed', rows.length, 'call rows');

  const batchSize = 500;
  let totalInserted = 0;
  let totalSkipped = 0;

  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const result = await importCdrRows(batch, path.basename(resolved));
    totalInserted += result.inserted;
    totalSkipped += result.skipped;
    console.log(
      `Batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(rows.length / batchSize)}:`,
      `+${result.inserted} inserted, ${result.skipped} skipped`
    );
  }

  console.log('\nDone.', { totalInserted, totalSkipped, parsed: rows.length });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
