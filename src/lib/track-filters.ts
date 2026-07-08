import type { CallTrack } from './tracks';

/** Manager disposition queue — Aloware closers self-dispose, not in this UI */
export const X8X_DISPOSITION_TRACKS = ['8x8_closer', 'verification', 'cs'] as const;
export type X8xDispositionTrack = (typeof X8X_DISPOSITION_TRACKS)[number];

export function sourcesForTrack(track: CallTrack): string[] {
  if (track === 'aloware_closer') return ['aloware_inbound', 'aloware_outbound'];
  if (track === 'retell') return ['retell'];
  return ['8x8_inbound', '8x8_outbound'];
}

export function teamForTrack(track: CallTrack): string | null {
  if (track === 'aloware_closer') return 'inbound_closers';
  if (track === '8x8_closer') return '8x8_closer';
  if (track === 'verification') return 'verification';
  if (track === 'cs') return 'cs';
  return null;
}

export function platformForTrack(track: CallTrack): '8x8' | 'aloware' | null {
  if (track === 'aloware_closer') return 'aloware';
  if (track === 'retell') return null;
  return '8x8';
}
