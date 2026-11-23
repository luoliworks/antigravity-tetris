export interface GridPos {
  r: number;
  c: number;
}

export type Direction8 = 'N' | 'NE' | 'E' | 'SE' | 'S' | 'SW' | 'W' | 'NW';

export type CardinalDir = 'N' | 'E' | 'S' | 'W';

export interface DirVec {
  dr: -1 | 0 | 1;
  dc: -1 | 0 | 1;
}

export type Difficulty = 'easy' | 'hard';

export type RotationState = 0 | 1 | 2 | 3;

export type PieceKind =
  | 'I'
  | 'O'
  | 'T'
  | 'J'
  | 'L'
  | 'S'
  | 'Z'
  | 'L3'
  | 'D2'
  | 'M1'
  | 'NOVA_BOMB'
  | 'STARDUST_PIERCER';

export type StarCoreKind = 'NOVA_BOMB' | 'STARDUST_PIERCER';

export type RingIndex = 1 | 2 | 3 | 4 | 5 | 6;

export type SlideBias = 'vertical' | 'horizontal' | null;

export interface CellData {
  kind: PieceKind;
  id: number;
}

export type BoardGrid = (CellData | null)[][];

export interface ActivePiece {
  kind: PieceKind;
  origin: GridPos;
  rotation: RotationState;
  direction: Direction8 | null;
  slideBias: SlideBias;
}

export type GamePhase = 'INTRO' | 'HOVER' | 'FLIGHT' | 'LOCK_DELAY' | 'GAME_OVER';

export interface LevelConfig {
  hoverMs: number;
  stepMs: number;
  lubricantRatio: number;
}

export interface CellMovement {
  cell: CellData;
  from: GridPos;
  to: GridPos;
}

export interface ClearedCell {
  pos: GridPos;
  ring: RingIndex;
  cell: CellData;
}

export interface ClearedLineCell {
  pos: GridPos;
  cell: CellData;
}

export interface FullLines {
  northRows: number[];
  southRows: number[];
  westCols: number[];
  eastCols: number[];
}

export interface ResonanceSides {
  north: boolean;
  south: boolean;
  west: boolean;
  east: boolean;
}

export interface GhostPlacement {
  finalPiece: ActivePiece;
  path: GridPos[];
  steps: number;
  targetValid: boolean;
}

export type GameEvent =
  | { type: 'INTRO_COMPLETE' }
  | { type: 'PIECE_SPAWNED'; piece: ActivePiece; nextPiece: PieceKind }
  | { type: 'AIM_CHANGED'; direction: Direction8 }
  | { type: 'PIECE_ROTATED'; piece: ActivePiece; delta: 1 | -1 }
  | {
      type: 'PIECE_LAUNCHED';
      piece: ActivePiece;
      direction: Direction8;
      blind: boolean;
      isQuick: boolean;
      quickStreak: number;
      scoreDelta: number;
      chargeDelta: number;
    }
  | {
      type: 'PIECE_MOVED';
      piece: ActivePiece;
      reason: 'flight' | 'nudge' | 'soft_drop' | 'hard_drop';
    }
  | {
      type: 'PIECE_LOCKED';
      kind: PieceKind;
      placed: { pos: GridPos; cell: CellData }[];
      hardDropSteps: number;
      scoreDelta: number;
    }
  | {
      type: 'NOVA_DETONATED';
      center: GridPos;
      destroyed: { pos: GridPos; cell: CellData }[];
      hardDropSteps: number;
      scoreDelta: number;
    }
  | {
      type: 'RINGS_CLEARED';
      rings: RingIndex[];
      source?: 'direct' | 'resonance';
      clearedCells: ClearedCell[];
      movements: CellMovement[];
      isAllClear: boolean;
      scoreDelta: number;
      chargeDelta: number;
      flowCombo: number;
      flowMultiplier: number;
      newLevel: number;
      leveledUp: boolean;
    }
  | {
      type: 'LINES_CLEARED';
      rows: number[];
      cols: number[];
      lineCount: number;
      isCrossClear: boolean;
      clearedCells: ClearedLineCell[];
      movements: CellMovement[];
      isAllClear: boolean;
      scoreDelta: number;
      chargeDelta: number;
      flowCombo: number;
      flowMultiplier: number;
      newLevel: number;
      leveledUp: boolean;
    }
  | {
      type: 'HOLD_SWAPPED';
      heldPiece: PieceKind;
      activePiece: ActivePiece;
      nextPiece: PieceKind;
      consecutiveHolds: number;
    }
  | {
      type: 'STAR_CORE_ACTIVATED';
      coreKind: StarCoreKind;
      target: 'active' | 'next';
    }
  | { type: 'DANGER_CHANGED'; inDanger: boolean }
  | {
      type: 'GAME_OVER';
      score: number;
      level: number;
      linesCleared: number;
      ringsCleared: number;
      maxFlowCombo: number;
      quickRate: number;
    };

export interface GameStateSnapshot {
  phase: GamePhase;
  difficulty: Difficulty;
  board: BoardGrid;
  activePiece: ActivePiece | null;
  nextPiece: PieceKind;
  holdPiece: PieceKind | null;
  holdUsedThisTurn: boolean;
  consecutiveHolds: number;
  score: number;
  level: number;
  linesCleared: number;
  ringsCleared: number;
  charge: number;
  flowCombo: number;
  maxFlowCombo: number;
  piecesSinceLastClear: number;
  quickCount: number;
  quickStreak: number;
  totalLaunches: number;
  quickRate: number;
  inDanger: boolean;
  introElapsedMs: number;
  introDurationMs: number;
  hoverElapsedMs: number;
  hoverDurationMs: number;
  lockDelayElapsedMs: number;
  lockDelayDurationMs: number;
  softDropActive: boolean;
  resonanceSides: ResonanceSides;
}
