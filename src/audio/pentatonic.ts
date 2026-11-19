export type SfxId =
  | 'aim_tick'
  | 'rotate'
  | 'hover_urgent'
  | 'launch'
  | 'launch_quick'
  | 'launch_blind'
  | 'hold'
  | 'lock'
  | 'clear_single'
  | 'clear_multi'
  | 'all_clear'
  | 'collapse_click'
  | 'star_core_activate'
  | 'nova_blast'
  | 'piercer_snipe'
  | 'level_up'
  | 'countdown_tick'
  | 'countdown_go'
  | 'game_over'
  | 'game_over_record'
  | 'ui_click';

export type BgmTrackId = 'main' | 'danger';

export type BgmMode = 'stopped' | 'title' | 'gameplay' | 'gameover';

export interface AudioOverrideManifest {
  sfx?: Partial<Record<SfxId, string>>;
  bgm?: Partial<Record<BgmTrackId, string>>;
}

export interface BgmBarSpec {
  readonly bassHz: number;
  readonly padHz: readonly [number, number, number];
  readonly arpHz: readonly [number, number, number, number, number, number, number, number];
}

// Strictly ascending C major pentatonic scale across octaves 3-6 (18 notes)
export const PENTATONIC_HZ: readonly number[] = [
  130.81, // 0: C3
  146.83, // 1: D3
  164.81, // 2: E3
  196.0, // 3: G3
  220.0, // 4: A3
  261.63, // 5: C4
  293.66, // 6: D4
  329.63, // 7: E4
  392.0, // 8: G4
  440.0, // 9: A4
  523.25, // 10: C5
  587.33, // 11: D5
  659.25, // 12: E5
  783.99, // 13: G5
  880.0, // 14: A5
  1046.5, // 15: C6
  1174.66, // 16: D6
  1318.51, // 17: E6
] as const;

// 4-bar ethereal Synthwave / Lo-Fi progression: Cadd9 -> Am7 -> Fmaj7 -> G6
export const BGM_BAR_CHORDS: readonly [BgmBarSpec, BgmBarSpec, BgmBarSpec, BgmBarSpec] = [
  {
    bassHz: 65.41, // C2
    padHz: [130.81, 196.0, 293.66], // C3, G3, D4
    arpHz: [261.63, 329.63, 392.0, 523.25, 587.33, 523.25, 392.0, 329.63],
  },
  {
    bassHz: 55.0, // A1
    padHz: [146.83, 220.0, 329.63], // D3, A3, E4
    arpHz: [220.0, 261.63, 329.63, 440.0, 523.25, 440.0, 329.63, 261.63],
  },
  {
    bassHz: 87.31, // F2
    padHz: [130.81, 220.0, 329.63], // C3, A3, E4
    arpHz: [261.63, 329.63, 440.0, 523.25, 659.25, 523.25, 440.0, 329.63],
  },
  {
    bassHz: 98.0, // G2
    padHz: [146.83, 196.0, 293.66], // D3, G3, D4
    arpHz: [293.66, 392.0, 440.0, 587.33, 659.25, 587.33, 392.0, 293.66],
  },
] as const;

export function getQuickStreakNoteHz(streak: number): number {
  const clampedOffset = Math.max(0, Math.min(PENTATONIC_HZ.length - 11, Math.floor(streak) - 1));
  return PENTATONIC_HZ[10 + clampedOffset];
}

export function getClearChordHz(
  clearCount: number,
  flowCombo: number,
  isRing: boolean,
): number[] {
  const rootShift = Math.max(0, Math.min(5, Math.floor(flowCombo)));
  const baseIdx = 5 + rootShift; // Starts from C4 (idx 5) up to C5 (idx 10)
  const chord = [
    PENTATONIC_HZ[baseIdx],
    PENTATONIC_HZ[Math.min(PENTATONIC_HZ.length - 1, baseIdx + 2)],
    PENTATONIC_HZ[Math.min(PENTATONIC_HZ.length - 1, baseIdx + 3)],
  ];

  if (clearCount >= 2 || isRing) {
    const fifthHigh = PENTATONIC_HZ[Math.min(PENTATONIC_HZ.length - 1, baseIdx + 5)];
    if (fifthHigh > chord[chord.length - 1]) {
      chord.push(fifthHigh);
    }
  }
  if (clearCount >= 2 && isRing) {
    const shimmerHigh = PENTATONIC_HZ[Math.min(PENTATONIC_HZ.length - 1, baseIdx + 7)];
    if (shimmerHigh > chord[chord.length - 1]) {
      chord.push(shimmerHigh);
    }
  }

  return chord;
}

export function getArpeggioHz(steps: number, startIdx = 10): number[] {
  const count = Math.max(0, Math.floor(steps));
  if (count === 0) {
    return [];
  }
  const safeStart = Math.max(0, Math.min(PENTATONIC_HZ.length - 1, Math.floor(startIdx)));
  const out: number[] = [];
  for (let i = 0; i < count; i++) {
    const idx = Math.min(PENTATONIC_HZ.length - 1, safeStart + i);
    out.push(PENTATONIC_HZ[idx]);
  }
  return out;
}

export function computeEffectiveGain(volume: number, muted: boolean, duck = 1): number {
  if (muted || volume <= 0 || duck <= 0) {
    return 0;
  }
  const clampedVol = Math.min(1, Math.max(0, volume));
  const clampedDuck = Math.min(1, Math.max(0, duck));
  return clampedVol * clampedDuck;
}
