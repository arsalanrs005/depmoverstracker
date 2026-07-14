/**
 * Track-scoped KPI definitions for manager dashboard.
 */

import { ALOWARE_DISPOSITIONS } from './aloware-dispositions';
import type { CallTrack } from './tracks';

export type TrackKpiRow = {
  track: CallTrack;
  total_calls: number;
  inbound_total: number;
  inbound_answered: number;
  inbound_missed_abandoned: number;
  outbound_total: number;
  pending_dispositions: number;
  dispositions_submitted: number;
  outcome_good: number;
  outcome_bad: number;
  outcome_neutral: number;
  inbound_answer_rate: number | null;
  /** Aloware disposition code → count (exact statuses) */
  disposition_counts?: Record<string, number>;
  quoted_count?: number;
  booked_pending_count?: number;
  booked_collected_count?: number;
};

export type KpiCard = {
  key: string;
  label: string;
  value: string | number;
  sub?: string;
  tone?: 'default' | 'good' | 'warn' | 'bad' | 'highlight';
};

export const MANAGER_TRACKS: CallTrack[] = [
  'aloware_closer',
  '8x8_closer',
  'verification',
  'cs',
];

function n(v: unknown): number {
  return Number(v) || 0;
}

function pct(answered: number, total: number): number | null {
  if (total <= 0) return null;
  return Math.round((answered / total) * 1000) / 10;
}

export function normalizeTrackKpiRow(row: Record<string, unknown>): TrackKpiRow {
  const inboundTotal = n(row.inbound_total);
  const inboundAnswered = n(row.inbound_answered);
  const dispositionCounts =
    row.disposition_counts && typeof row.disposition_counts === 'object'
      ? (row.disposition_counts as Record<string, number>)
      : undefined;

  return {
    track: row.track as CallTrack,
    total_calls: n(row.total_calls),
    inbound_total: inboundTotal,
    inbound_answered: inboundAnswered,
    inbound_missed_abandoned: n(row.inbound_missed_abandoned),
    outbound_total: n(row.outbound_total),
    pending_dispositions: n(row.pending_dispositions),
    dispositions_submitted: n(row.dispositions_submitted),
    outcome_good: n(row.outcome_good),
    outcome_bad: n(row.outcome_bad),
    outcome_neutral: n(row.outcome_neutral),
    inbound_answer_rate:
      row.inbound_answer_rate != null
        ? Number(row.inbound_answer_rate)
        : pct(inboundAnswered, inboundTotal),
    disposition_counts: dispositionCounts,
    quoted_count: row.quoted_count != null ? n(row.quoted_count) : undefined,
    booked_pending_count:
      row.booked_pending_count != null ? n(row.booked_pending_count) : undefined,
    booked_collected_count:
      row.booked_collected_count != null ? n(row.booked_collected_count) : undefined,
  };
}

function alowareStatusTone(code: string): KpiCard['tone'] {
  if (code === 'quoted' || code === 'booked-deposit-collected' || code === 'closed-deal') {
    return 'good';
  }
  if (code === 'booked-deposit-pending') return 'highlight';
  if (
    code === 'do-not-call' ||
    code === 'no-answer' ||
    code === 'voicemail-left' ||
    code === 'wrong-number' ||
    code === 'connected-not-interested'
  ) {
    return 'bad';
  }
  if (code === 'callback-requested' || code === 'connected-objection') return 'warn';
  return 'default';
}

function countForDisposition(k: TrackKpiRow, code: string): number {
  if (code === 'quoted') {
    return (
      k.quoted_count ??
      (k.disposition_counts?.quoted ?? 0) + (k.disposition_counts?.['connected-quoted'] ?? 0)
    );
  }
  if (code === 'booked-deposit-pending') {
    return k.booked_pending_count ?? k.disposition_counts?.['booked-deposit-pending'] ?? 0;
  }
  if (code === 'booked-deposit-collected') {
    const closed = k.disposition_counts?.['closed-deal'] ?? 0;
    if (k.booked_collected_count != null) {
      // booked_collected_count includes closed-deal in SQL — keep Closed deal as its own card
      return Math.max(0, k.booked_collected_count - closed);
    }
    return k.disposition_counts?.['booked-deposit-collected'] ?? 0;
  }
  return k.disposition_counts?.[code] ?? 0;
}

/** KPI cards shown when a single track tab is selected */
export function kpiCardsForTrack(k: TrackKpiRow): KpiCard[] {
  if (k.track === 'aloware_closer') {
    const ops: KpiCard[] = [
      {
        key: 'inbound_answer_rate',
        label: 'Inbound answer rate',
        value: k.inbound_answer_rate != null ? `${k.inbound_answer_rate}%` : '—',
        sub: `${k.inbound_answered} of ${k.inbound_total} inbound`,
        tone: 'highlight',
      },
      {
        key: 'inbound_missed',
        label: 'Missed / abandoned inbound',
        value: k.inbound_missed_abandoned,
        tone: k.inbound_missed_abandoned > 0 ? 'bad' : 'default',
      },
      {
        key: 'outbound',
        label: 'Outbound calls',
        value: k.outbound_total,
        sub: 'Count only',
      },
      {
        key: 'disposed',
        label: 'Agent dispositions',
        value: k.dispositions_submitted,
      },
      {
        key: 'total',
        label: 'Total calls',
        value: k.total_calls,
      },
    ];

    const statusCards: KpiCard[] = ALOWARE_DISPOSITIONS.map((d) => ({
      key: `disp-${d.code}`,
      label: d.label,
      value: countForDisposition(k, d.code),
      tone: alowareStatusTone(d.code),
    }));

    return [...ops, ...statusCards];
  }

  if (k.track === '8x8_closer') {
    return [
      {
        key: 'missed_inbound',
        label: 'Missed inbound (no disposition)',
        value: k.inbound_missed_abandoned,
        tone: k.inbound_missed_abandoned > 0 ? 'warn' : 'default',
      },
      {
        key: 'pending',
        label: 'Pending manager disposition',
        value: k.pending_dispositions,
        tone: k.pending_dispositions > 0 ? 'warn' : 'default',
      },
      {
        key: 'inbound_answer_rate',
        label: 'Inbound answer rate',
        value: k.inbound_answer_rate != null ? `${k.inbound_answer_rate}%` : '—',
        sub: `${k.inbound_answered} of ${k.inbound_total} inbound`,
        tone: 'highlight',
      },
      {
        key: 'outbound',
        label: 'Outbound calls',
        value: k.outbound_total,
      },
      {
        key: 'quoted',
        label: 'Quoted (logged)',
        value: k.outcome_good,
        tone: 'good',
      },
      {
        key: 'total',
        label: 'Total calls',
        value: k.total_calls,
      },
    ];
  }

  // Verification & CS — simple
  return [
    {
      key: 'total',
      label: 'Total calls',
      value: k.total_calls,
      tone: 'highlight',
    },
    {
      key: 'pending',
      label: 'Pending disposition',
      value: k.pending_dispositions,
      tone: k.pending_dispositions > 0 ? 'warn' : 'default',
    },
    {
      key: 'disposed',
      label: 'Disposed',
      value: k.dispositions_submitted,
      tone: 'good',
    },
    {
      key: 'inbound',
      label: 'Inbound',
      value: k.inbound_total,
    },
    {
      key: 'outbound',
      label: 'Outbound',
      value: k.outbound_total,
    },
  ];
}

/** Compact cards for All-tab track summary row */
export function summaryCardsForTrack(k: TrackKpiRow): KpiCard[] {
  if (k.track === 'aloware_closer') {
    const quoted = countForDisposition(k, 'quoted');
    const pending = countForDisposition(k, 'booked-deposit-pending');
    const collected = countForDisposition(k, 'booked-deposit-collected');
    return [
      {
        key: 'rate',
        label: 'Inbound answer rate',
        value: k.inbound_answer_rate != null ? `${k.inbound_answer_rate}%` : '—',
        tone: 'highlight',
      },
      { key: 'out', label: 'Outbound', value: k.outbound_total },
      { key: 'quoted', label: 'Quoted', value: quoted, tone: 'good' },
      { key: 'pending', label: 'Deposit Pending', value: pending, tone: 'highlight' },
      { key: 'collected', label: 'Deposit Collected', value: collected, tone: 'good' },
    ];
  }
  if (k.track === '8x8_closer') {
    return [
      {
        key: 'missed',
        label: 'Missed inbound',
        value: k.inbound_missed_abandoned,
        tone: k.inbound_missed_abandoned > 0 ? 'warn' : 'default',
      },
      {
        key: 'pending',
        label: 'Pending',
        value: k.pending_dispositions,
        tone: k.pending_dispositions > 0 ? 'warn' : 'default',
      },
      {
        key: 'rate',
        label: 'Inbound answer rate',
        value: k.inbound_answer_rate != null ? `${k.inbound_answer_rate}%` : '—',
      },
    ];
  }
  return [
    { key: 'total', label: 'Calls', value: k.total_calls, tone: 'highlight' },
    {
      key: 'pending',
      label: 'Pending',
      value: k.pending_dispositions,
      tone: k.pending_dispositions > 0 ? 'warn' : 'default',
    },
    { key: 'done', label: 'Disposed', value: k.dispositions_submitted, tone: 'good' },
  ];
}

export function trackKpiFromTotals(t: Record<string, unknown>, track: CallTrack): TrackKpiRow {
  const inbound = n(t.inbound_total);
  const answered = n(t.inbound_answered);
  return normalizeTrackKpiRow({
    track,
    total_calls: t.total_calls,
    inbound_total: inbound,
    inbound_answered: answered,
    inbound_missed_abandoned: t.inbound_missed_abandoned,
    outbound_total: t.outbound_total,
    pending_dispositions: t.pending_dispositions,
    dispositions_submitted: t.dispositions_submitted,
    outcome_good: t.outcome_good,
    outcome_bad: t.outcome_bad,
    outcome_neutral: t.outcome_neutral,
    inbound_answer_rate: pct(answered, inbound),
    disposition_counts: t.disposition_counts,
    quoted_count: t.quoted_count,
    booked_pending_count: t.booked_pending_count,
    booked_collected_count: t.booked_collected_count,
  });
}
