import type { CardinalDir, Direction8, DirVec, LevelConfig, PieceKind, RingIndex } from './types';

export const BOARD_SIZE = 16;
export const CENTER_MIN = 6;
export const CENTER_MAX = 9;
export const RING_COUNT = 6;

export const RING_INDICES: readonly RingIndex[] = [1, 2, 3, 4, 5, 6];

export const RING_CELL_COUNTS: Record<RingIndex, number> = {
  1: 60,
  2: 52,
  3: 44,
  4: 36,
  5: 28,
  6: 20,
};

export const DIRECTIONS_8: readonly Direction8[] = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

export const DIR_VECTORS: Record<Direction8, DirVec> = {
  N: { dr: -1, dc: 0 },
  NE: { dr: -1, dc: 1 },
  E: { dr: 0, dc: 1 },
  SE: { dr: 1, dc: 1 },
  S: { dr: 1, dc: 0 },
  SW: { dr: 1, dc: -1 },
  W: { dr: 0, dc: -1 },
  NW: { dr: -1, dc: -1 },
};

export const CARDINAL_VECTORS: Record<CardinalDir, DirVec> = {
  N: DIR_VECTORS.N,
  E: DIR_VECTORS.E,
  S: DIR_VECTORS.S,
  W: DIR_VECTORS.W,
};

export const TETROMINO_KINDS: readonly PieceKind[] = ['I', 'O', 'T', 'J', 'L', 'S', 'Z'];
export const LUBRICANT_KINDS: readonly PieceKind[] = ['L3', 'D2'];

export const INTRO_DURATION_MS = 900;
export const LOCK_DELAY_MS = 250;
export const SOFT_DROP_MULTIPLIER = 5;

export const RING_CLEAR_BASE_SCORES: Record<1 | 2 | 3 | 4, number> = {
  1: 1000,
  2: 2800,
  3: 6000,
  4: 12000,
};

export const OUTER_RING_BONUS_MULTIPLIER = 1.2;

export const RING_CLEAR_CHARGE: Record<1 | 2 | 3 | 4, number> = {
  1: 25,
  2: 65,
  3: 100,
  4: 100,
};

export const RING_RESONANCE_CHARGE = 35;

export const LINE_CLEAR_BASE_SCORES: Record<1 | 2 | 3 | 4, number> = {
  1: 200,
  2: 500,
  3: 900,
  4: 1600,
};

export const LINE_CLEAR_CHARGE: Record<1 | 2 | 3 | 4, number> = {
  1: 10,
  2: 25,
  3: 45,
  4: 70,
};

export const ALL_CLEAR_BONUS_BASE = 10000;
export const ALL_CLEAR_CHARGE = 50;

export const QUICK_BASE_SCORE = 100;
export const QUICK_STREAK_STEP = 25;
export const QUICK_STREAK_MAX_BONUS = 250;
export const QUICK_CHARGE = 8;

export const HARD_DROP_SCORE_PER_STEP = 10;

export const FLOW_MULTIPLIERS = [1.0, 1.2, 1.5, 2.0, 2.5] as const;
export const FLOW_WINDOW_PIECES = 12;

export const PITY_MONOMINO_INTERVAL = 20;

export function getQuickWindowMs(hoverMs: number): number {
  return Math.min(500, Math.max(300, Math.round(hoverMs * 0.25)));
}

export function calculateLevelFromClears(linesCleared: number, ringsCleared: number): number {
  const pts =
    Math.max(0, Math.floor(linesCleared)) + Math.max(0, Math.floor(ringsCleared)) * 3;
  if (pts < 24) {
    return 1 + Math.floor(pts / 6);
  }
  return 5 + Math.floor((pts - 24) / 9);
}

export function calculateLevel(ringsCleared: number): number {
  return calculateLevelFromClears(0, ringsCleared);
}

export interface LevelProgressInfo {
  level: number;
  currentPoints: number;
  requiredPoints: number;
  ratio: number;
}

export function getLevelProgress(linesCleared: number, ringsCleared: number): LevelProgressInfo {
  const pts =
    Math.max(0, Math.floor(linesCleared)) + Math.max(0, Math.floor(ringsCleared)) * 3;
  const level = calculateLevelFromClears(linesCleared, ringsCleared);
  const currentPoints = pts < 24 ? pts % 6 : (pts - 24) % 9;
  const requiredPoints = pts < 24 ? 6 : 9;
  return {
    level,
    currentPoints,
    requiredPoints,
    ratio: currentPoints / requiredPoints,
  };
}

export function getLevelConfig(level: number): LevelConfig {
  const safeLevel = Math.max(1, Math.floor(level));
  if (safeLevel <= 2) {
    return { hoverMs: 3500, stepMs: 460, lubricantRatio: 0.25 };
  }
  if (safeLevel <= 5) {
    return { hoverMs: 2600, stepMs: 340, lubricantRatio: 0.20 };
  }
  if (safeLevel <= 8) {
    return { hoverMs: 1800, stepMs: 240, lubricantRatio: 0.15 };
  }
  return {
    hoverMs: 1200,
    stepMs: Math.max(110, 180 - (safeLevel - 9) * 10),
    lubricantRatio: 0.10,
  };
}
