/** Scoreboard week: Monday 00:00 ET through Saturday 23:59:59 ET; resets each Monday. */

export const SCOREBOARD_DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;
export type ScoreboardDay = (typeof SCOREBOARD_DAYS)[number];

export const SCOREBOARD_DAY_LABELS: Record<ScoreboardDay, string> = {
  mon: 'Monday',
  tue: 'Tuesday',
  wed: 'Wednesday',
  thu: 'Thursday',
  fri: 'Friday',
  sat: 'Saturday',
};

export type DayMetrics = {
  leads: number;
  deals: number;
  revenue: number;
};

export type ScoreboardAgentRow = {
  agent_name: string;
  team: string;
  days: Record<ScoreboardDay, DayMetrics>;
  totals: DayMetrics;
};

export type ScoreboardPayload = {
  weekLabel: string;
  weekStart: string;
  weekEnd: string;
  weekRangeLabel: string;
  days: ScoreboardDay[];
  agents: ScoreboardAgentRow[];
  dayTotals: Record<ScoreboardDay, DayMetrics>;
  grandTotal: DayMetrics;
};

const TZ = 'America/New_York';

const DOW_TO_KEY: Record<number, ScoreboardDay> = {
  1: 'mon',
  2: 'tue',
  3: 'wed',
  4: 'thu',
  5: 'fri',
  6: 'sat',
};

export function emptyDayMetrics(): DayMetrics {
  return { leads: 0, deals: 0, revenue: 0 };
}

export function emptyDaysRecord(): Record<ScoreboardDay, DayMetrics> {
  return {
    mon: emptyDayMetrics(),
    tue: emptyDayMetrics(),
    wed: emptyDayMetrics(),
    thu: emptyDayMetrics(),
    fri: emptyDayMetrics(),
    sat: emptyDayMetrics(),
  };
}

function etDateParts(d: Date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
  }).formatToParts(d);

  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? '';

  return {
    year: Number(get('year')),
    month: Number(get('month')),
    day: Number(get('day')),
    weekday: get('weekday'),
  };
}


function addDaysUtc(d: Date, days: number): Date {
  return new Date(d.getTime() + days * 86_400_000);
}

function isoWeekNumber(year: number, month: number, day: number): number {
  const target = new Date(Date.UTC(year, month - 1, day));
  const dayNr = (target.getUTCDay() + 6) % 7;
  target.setUTCDate(target.getUTCDate() - dayNr + 3);
  const firstThursday = target.getTime();
  target.setUTCMonth(0, 1);
  if (target.getUTCDay() !== 4) {
    target.setUTCMonth(0, 1 + ((4 - target.getUTCDay() + 7) % 7));
  }
  return 1 + Math.ceil((firstThursday - target.getTime()) / 604_800_000);
}

function parseEtMidnightUtc(ymd: string): Date {
  const [y, m, d] = ymd.split('-').map(Number);
  const base = Date.UTC(y, m - 1, d, 5, 0, 0);
  for (let h = -6; h <= 6; h++) {
    const t = new Date(base + h * 3600_000);
    const dateEt = t.toLocaleDateString('en-CA', { timeZone: TZ });
    const hourEt = Number(
      new Intl.DateTimeFormat('en-US', {
        timeZone: TZ,
        hour: 'numeric',
        hour12: false,
      }).format(t)
    );
    if (dateEt === ymd && hourEt === 0) return t;
  }
  return new Date(base);
}

export function getScoreboardWeek(now = new Date()) {
  let monYmd = '';
  for (let back = 0; back <= 6; back++) {
    const test = new Date(now.getTime() - back * 86_400_000);
    const parts = etDateParts(test);
    if (parts.weekday === 'Mon') {
      monYmd = test.toLocaleDateString('en-CA', { timeZone: TZ });
      break;
    }
  }
  if (!monYmd) {
    monYmd = now.toLocaleDateString('en-CA', { timeZone: TZ });
  }

  const weekStart = parseEtMidnightUtc(monYmd);
  const weekEnd = addDaysUtc(weekStart, 7);

  const monParts = etDateParts(weekStart);
  const satParts = etDateParts(addDaysUtc(weekStart, 5));
  const weekNum = isoWeekNumber(monParts.year, monParts.month, monParts.day);

  const fmt = (p: { year: number; month: number; day: number }) =>
    `${p.month}/${p.day}/${p.year}`;

  return {
    weekStart,
    weekEnd,
    weekLabel: `W${String(weekNum).padStart(2, '0')}`,
    weekRangeLabel: `${fmt(monParts)} – ${fmt(satParts)}`,
  };
}

export function dowToScoreboardDay(dow: number): ScoreboardDay | null {
  return DOW_TO_KEY[dow] ?? null;
}

export function addDayMetrics(a: DayMetrics, b: DayMetrics): DayMetrics {
  return {
    leads: a.leads + b.leads,
    deals: a.deals + b.deals,
    revenue: a.revenue + b.revenue,
  };
}

export function formatRevenue(n: number): string {
  if (n <= 0) return '$0';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(n);
}

type RawScoreboardRow = {
  agent_name: string;
  dow: number;
  leads: number;
  deals: number;
  revenue_cents?: number;
};

export function buildScoreboardPayload(
  roster: Array<{ agent_name: string; team: string }>,
  rows: RawScoreboardRow[],
  weekMeta: ReturnType<typeof getScoreboardWeek>
): ScoreboardPayload {
  const dayTotals = emptyDaysRecord();
  const agents: ScoreboardAgentRow[] = roster.map((ag) => ({
    agent_name: ag.agent_name,
    team: ag.team,
    days: emptyDaysRecord(),
    totals: emptyDayMetrics(),
  }));

  const agentMap = new Map(agents.map((a) => [a.agent_name, a]));

  for (const row of rows) {
    const dayKey = dowToScoreboardDay(Number(row.dow));
    if (!dayKey) continue;

    const leads = Number(row.leads) || 0;
    const deals = Number(row.deals) || 0;
    const revenue = Math.round(Number(row.revenue_cents ?? 0) / 100);
    const cell: DayMetrics = { leads, deals, revenue };

    let agent = agentMap.get(row.agent_name);
    if (!agent) {
      agent = {
        agent_name: row.agent_name,
        team: 'unknown',
        days: emptyDaysRecord(),
        totals: emptyDayMetrics(),
      };
      agents.push(agent);
      agentMap.set(row.agent_name, agent);
    }

    agent.days[dayKey] = cell;
    agent.totals = addDayMetrics(agent.totals, cell);
    dayTotals[dayKey] = addDayMetrics(dayTotals[dayKey], cell);
  }

  agents.sort((a, b) => b.totals.leads - a.totals.leads || a.agent_name.localeCompare(b.agent_name));

  const grandTotal = SCOREBOARD_DAYS.reduce(
    (acc, d) => addDayMetrics(acc, dayTotals[d]),
    emptyDayMetrics()
  );

  return {
    weekLabel: weekMeta.weekLabel,
    weekStart: weekMeta.weekStart.toISOString(),
    weekEnd: weekMeta.weekEnd.toISOString(),
    weekRangeLabel: weekMeta.weekRangeLabel,
    days: [...SCOREBOARD_DAYS],
    agents,
    dayTotals,
    grandTotal,
  };
}
