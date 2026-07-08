# UGVL Call Tracker

Vercel app for Retell + 8x8 CDR call sessions, agent dispositions, manager dashboard, and GHL sync.

**No 8x8 Contact Center required** — human calls ingested via CDR CSV export.

## Quick start

```bash
cp .env.example .env.local   # set DATABASE_URL
npm install
npm run db:push
npm run dev
```

Open http://localhost:3000

## Pages

| Route | Purpose |
|-------|---------|
| `/import` | Upload 8x8 CDR CSV |
| `/calls` | Recent call list |
| `/agent/dispositions` | Agent queue + guidelines |
| `/manager/dashboard` | Daily / week / month metrics |

## API

| Route | Method |
|-------|--------|
| `/api/health` | GET |
| `/api/imports/8x8-cdr` | POST (CSV file or body) |
| `/api/dispositions/pending` | GET |
| `/api/dispositions/submit` | POST |
| `/api/dashboard/stats?period=day` | GET |
| `/api/webhooks/retell` | POST |

## Build phases

| Phase | Status |
|-------|--------|
| T0 Schema + shell | Done |
| T1 Retell webhook | Done |
| T-CDR CSV import + UI | Done |
| T3 GHL sync on disposition | Partial |
| T2 CC Analytics API | Deferred (needs CC) |

## Docs

- [DISPOSITION-TRACKER-JASON-PLAN.md](../docs/DISPOSITION-TRACKER-JASON-PLAN.md)
- [CALL-TRACKER-DEPLOY.md](../docs/CALL-TRACKER-DEPLOY.md)
- [WF-CDR-START-HERE.md](../docs/WF-CDR-START-HERE.md)
- [CALL-TRACKER-BASIC-PLAN.md](../docs/CALL-TRACKER-BASIC-PLAN.md)

## Test CDR import

```bash
curl -X POST http://localhost:3000/api/imports/8x8-cdr \
  -F "file=@test-data/sample-8x8-cdr.csv"
```

Sample file: `test-data/sample-8x8-cdr.csv`
