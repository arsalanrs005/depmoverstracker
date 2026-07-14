import fs from 'fs';
import path from 'path';
import postgres from 'postgres';

// Load .env.local if DATABASE_URL not set
if (!process.env.DATABASE_URL) {
  const envPath = path.join(process.cwd(), '.env.local');
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
      const m = line.match(/^([^#=]+)=(.*)$/);
      if (m) process.env[m[1].trim()] = m[2].trim();
    }
  }
}
const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is required');
  process.exit(1);
}

const schemaPath = path.join(process.cwd(), 'db', 'schema.sql');
const migration002 = path.join(process.cwd(), 'db', 'migration-002-tracks.sql');
const migration003 = path.join(process.cwd(), 'db', 'migration-003-agents-unique.sql');
const migration004 = path.join(process.cwd(), 'db', 'migration-004-quote-details.sql');
const migration005 = path.join(process.cwd(), 'db', 'migration-005-app-users.sql');
const migration006 = path.join(process.cwd(), 'db', 'migration-006-inventory-intakes.sql');
const migration007 = path.join(process.cwd(), 'db', 'migration-007-agent-quote-manual.sql');
const migration008 = path.join(process.cwd(), 'db', 'migration-008-aloware-quote-dispositions.sql');
const seedPath = path.join(process.cwd(), 'db', 'seed-agents.sql');
const seedUsersPath = path.join(process.cwd(), 'db', 'seed-app-users.sql');
const sqlText = fs.readFileSync(schemaPath, 'utf8');

const db = postgres(url, { max: 1 });

async function applyFile(label, filePath) {
  if (fs.existsSync(filePath)) {
    await db.unsafe(fs.readFileSync(filePath, 'utf8'));
    console.log(`${label} applied:`, filePath);
  }
}

async function main() {
  await db.unsafe(sqlText);
  console.log('Schema applied:', schemaPath);
  await applyFile('Migration', migration002);
  await applyFile('Migration', migration003);
  await applyFile('Migration', migration004);
  await applyFile('Migration', migration005);
  await applyFile('Migration', migration006);
  await applyFile('Migration', migration007);
  await applyFile('Migration', migration008);
  if (fs.existsSync(seedPath)) {
    await db.unsafe(fs.readFileSync(seedPath, 'utf8'));
    console.log('Seed applied:', seedPath);
  }
  if (fs.existsSync(seedUsersPath)) {
    await db.unsafe(fs.readFileSync(seedUsersPath, 'utf8'));
    console.log('Seed applied:', seedUsersPath);
  }
  await db.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
