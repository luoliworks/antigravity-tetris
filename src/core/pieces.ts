import { BOARD_SIZE, CENTER_MIN } from './constants';
import type {
  ActivePiece,
  BoardGrid,
  Direction8,
  GridPos,
  PieceKind,
  RotationState,
} from './types';

type ShapeRotations = readonly [
  readonly GridPos[],
  readonly GridPos[],
  readonly GridPos[],
  readonly GridPos[],
];

interface KickOffset {
  dr: number;
  dc: number;
}

const SINGLE_CELL_SHAPE: ShapeRotations = [
  [{ r: 0, c: 0 }],
  [{ r: 0, c: 0 }],
  [{ r: 0, c: 0 }],
  [{ r: 0, c: 0 }],
];

const O_SHAPE: ShapeRotations = [
  [
    { r: 0, c: 0 },
    { r: 0, c: 1 },
    { r: 1, c: 0 },
    { r: 1, c: 1 },
  ],
  [
    { r: 0, c: 0 },
    { r: 0, c: 1 },
    { r: 1, c: 0 },
    { r: 1, c: 1 },
  ],
  [
    { r: 0, c: 0 },
    { r: 0, c: 1 },
    { r: 1, c: 0 },
    { r: 1, c: 1 },
  ],
  [
    { r: 0, c: 0 },
    { r: 0, c: 1 },
    { r: 1, c: 0 },
    { r: 1, c: 1 },
  ],
];

const PIECE_SHAPES: Record<PieceKind, ShapeRotations> = {
  I: [
    [
      { r: 1, c: 0 },
      { r: 1, c: 1 },
      { r: 1, c: 2 },
      { r: 1, c: 3 },
    ],
    [
      { r: 0, c: 2 },
      { r: 1, c: 2 },
      { r: 2, c: 2 },
      { r: 3, c: 2 },
    ],
    [
      { r: 2, c: 0 },
      { r: 2, c: 1 },
      { r: 2, c: 2 },
      { r: 2, c: 3 },
    ],
    [
      { r: 0, c: 1 },
      { r: 1, c: 1 },
      { r: 2, c: 1 },
      { r: 3, c: 1 },
    ],
  ],
  O: O_SHAPE,
  T: [
    [
      { r: 0, c: 1 },
      { r: 1, c: 0 },
      { r: 1, c: 1 },
      { r: 1, c: 2 },
    ],
    [
      { r: 0, c: 1 },
      { r: 1, c: 1 },
      { r: 1, c: 2 },
      { r: 2, c: 1 },
    ],
    [
      { r: 1, c: 0 },
      { r: 1, c: 1 },
      { r: 1, c: 2 },
      { r: 2, c: 1 },
    ],
    [
      { r: 0, c: 1 },
      { r: 1, c: 0 },
      { r: 1, c: 1 },
      { r: 2, c: 1 },
    ],
  ],
  J: [
    [
      { r: 0, c: 0 },
      { r: 1, c: 0 },
      { r: 1, c: 1 },
      { r: 1, c: 2 },
    ],
    [
      { r: 0, c: 1 },
      { r: 0, c: 2 },
      { r: 1, c: 1 },
      { r: 2, c: 1 },
    ],
    [
      { r: 1, c: 0 },
      { r: 1, c: 1 },
      { r: 1, c: 2 },
      { r: 2, c: 2 },
    ],
    [
      { r: 0, c: 1 },
      { r: 1, c: 1 },
      { r: 2, c: 0 },
      { r: 2, c: 1 },
    ],
  ],
  L: [
    [
      { r: 0, c: 2 },
      { r: 1, c: 0 },
      { r: 1, c: 1 },
      { r: 1, c: 2 },
    ],
    [
      { r: 0, c: 1 },
      { r: 1, c: 1 },
      { r: 2, c: 1 },
      { r: 2, c: 2 },
    ],
    [
      { r: 1, c: 0 },
      { r: 1, c: 1 },
      { r: 1, c: 2 },
      { r: 2, c: 0 },
    ],
    [
      { r: 0, c: 0 },
      { r: 0, c: 1 },
      { r: 1, c: 1 },
      { r: 2, c: 1 },
    ],
  ],
  S: [
    [
      { r: 0, c: 1 },
      { r: 0, c: 2 },
      { r: 1, c: 0 },
      { r: 1, c: 1 },
    ],
    [
      { r: 0, c: 1 },
      { r: 1, c: 1 },
      { r: 1, c: 2 },
      { r: 2, c: 2 },
    ],
    [
      { r: 1, c: 1 },
      { r: 1, c: 2 },
      { r: 2, c: 0 },
      { r: 2, c: 1 },
    ],
    [
      { r: 0, c: 0 },
      { r: 1, c: 0 },
      { r: 1, c: 1 },
      { r: 2, c: 1 },
    ],
  ],
  Z: [
    [
      { r: 0, c: 0 },
      { r: 0, c: 1 },
      { r: 1, c: 1 },
      { r: 1, c: 2 },
    ],
    [
      { r: 0, c: 2 },
      { r: 1, c: 1 },
      { r: 1, c: 2 },
      { r: 2, c: 1 },
    ],
    [
      { r: 1, c: 0 },
      { r: 1, c: 1 },
      { r: 2, c: 1 },
      { r: 2, c: 2 },
    ],
    [
      { r: 0, c: 1 },
      { r: 1, c: 0 },
      { r: 1, c: 1 },
      { r: 2, c: 0 },
    ],
  ],
  L3: [
    [
      { r: 0, c: 0 },
      { r: 0, c: 1 },
      { r: 1, c: 0 },
    ],
    [
      { r: 0, c: 0 },
      { r: 0, c: 1 },
      { r: 1, c: 1 },
    ],
    [
      { r: 0, c: 1 },
      { r: 1, c: 0 },
      { r: 1, c: 1 },
    ],
    [
      { r: 0, c: 0 },
      { r: 1, c: 0 },
      { r: 1, c: 1 },
    ],
  ],
  D2: [
    [
      { r: 0, c: 0 },
      { r: 0, c: 1 },
    ],
    [
      { r: 0, c: 1 },
      { r: 1, c: 1 },
    ],
    [
      { r: 1, c: 0 },
      { r: 1, c: 1 },
    ],
    [
      { r: 0, c: 0 },
      { r: 1, c: 0 },
    ],
  ],
  M1: SINGLE_CELL_SHAPE,
  NOVA_BOMB: SINGLE_CELL_SHAPE,
  STARDUST_PIERCER: SINGLE_CELL_SHAPE,
};

// Standard SRS kicks converted from (+x right, +y up) to grid (+r down, +c right)
const JLSTZ_CW_KICKS: Record<RotationState, readonly KickOffset[]> = {
  0: [
    { dr: 0, dc: 0 },
    { dr: 0, dc: -1 },
    { dr: -1, dc: -1 },
    { dr: 2, dc: 0 },
    { dr: 2, dc: -1 },
  ],
  1: [
    { dr: 0, dc: 0 },
    { dr: 0, dc: 1 },
    { dr: 1, dc: 1 },
    { dr: -2, dc: 0 },
    { dr: -2, dc: 1 },
  ],
  2: [
    { dr: 0, dc: 0 },
    { dr: 0, dc: 1 },
    { dr: -1, dc: 1 },
    { dr: 2, dc: 0 },
    { dr: 2, dc: 1 },
  ],
  3: [
    { dr: 0, dc: 0 },
    { dr: 0, dc: -1 },
    { dr: 1, dc: -1 },
    { dr: -2, dc: 0 },
    { dr: -2, dc: -1 },
  ],
};

const I_CW_KICKS: Record<RotationState, readonly KickOffset[]> = {
  0: [
    { dr: 0, dc: 0 },
    { dr: 0, dc: -2 },
    { dr: 0, dc: 1 },
    { dr: 1, dc: -2 },
    { dr: -2, dc: 1 },
  ],
  1: [
    { dr: 0, dc: 0 },
    { dr: 0, dc: -1 },
    { dr: 0, dc: 2 },
    { dr: -2, dc: -1 },
    { dr: 1, dc: 2 },
  ],
  2: [
    { dr: 0, dc: 0 },
    { dr: 0, dc: 2 },
    { dr: 0, dc: -1 },
    { dr: -1, dc: 2 },
    { dr: 2, dc: -1 },
  ],
  3: [
    { dr: 0, dc: 0 },
    { dr: 0, dc: 1 },
    { dr: 0, dc: -2 },
    { dr: 2, dc: 1 },
    { dr: -1, dc: -2 },
  ],
};

const SMALL_KICKS: readonly KickOffset[] = [
  { dr: 0, dc: 0 },
  { dr: 0, dc: -1 },
  { dr: 0, dc: 1 },
  { dr: -1, dc: 0 },
  { dr: 1, dc: 0 },
];

export function isStarCore(kind: PieceKind): boolean {
  return kind === 'NOVA_BOMB' || kind === 'STARDUST_PIERCER';
}

export function isSingleCell(kind: PieceKind): boolean {
  return kind === 'M1' || kind === 'NOVA_BOMB' || kind === 'STARDUST_PIERCER';
}

export function getLocalPieceCells(kind: PieceKind, rotation: RotationState): readonly GridPos[] {
  return PIECE_SHAPES[kind][rotation];
}

export function getPieceCells(kind: PieceKind, rotation: RotationState, origin: GridPos): GridPos[] {
  return PIECE_SHAPES[kind][rotation].map((cell) => ({
    r: origin.r + cell.r,
    c: origin.c + cell.c,
  }));
}

export function getSpawnOrigin(kind: PieceKind, aimDir?: Direction8 | null): GridPos {
  if (isSingleCell(kind)) {
    switch (aimDir) {
      case 'NE':
      case 'E':
        return { r: CENTER_MIN + 1, c: CENTER_MIN + 2 };
      case 'SW':
        return { r: CENTER_MIN + 2, c: CENTER_MIN + 1 };
      case 'SE':
      case 'S':
        return { r: CENTER_MIN + 2, c: CENTER_MIN + 2 };
      case 'NW':
      case 'N':
      case 'W':
      default:
        return { r: CENTER_MIN + 1, c: CENTER_MIN + 1 };
    }
  }
  if (kind === 'O' || kind === 'L3' || kind === 'D2') {
    return { r: CENTER_MIN + 1, c: CENTER_MIN + 1 };
  }
  return { r: CENTER_MIN, c: CENTER_MIN };
}

function getKickOffsets(
  kind: PieceKind,
  from: RotationState,
  to: RotationState,
  delta: 1 | -1,
): readonly KickOffset[] {
  if (kind === 'L3' || kind === 'D2') {
    return SMALL_KICKS;
  }
  const table = kind === 'I' ? I_CW_KICKS : JLSTZ_CW_KICKS;
  if (delta === 1) {
    return table[from];
  }
  return table[to].map((k) => ({ dr: -k.dr, dc: -k.dc }));
}

function fitsOnBoard(board: BoardGrid, kind: PieceKind, rotation: RotationState, origin: GridPos): boolean {
  const cells = getPieceCells(kind, rotation, origin);
  for (const pos of cells) {
    if (pos.r < 0 || pos.r >= BOARD_SIZE || pos.c < 0 || pos.c >= BOARD_SIZE) {
      return false;
    }
    if (board[pos.r][pos.c] !== null) {
      return false;
    }
  }
  return true;
}

export function tryRotatePiece(
  board: BoardGrid,
  piece: ActivePiece,
  delta: 1 | -1,
): ActivePiece | null {
  if (piece.kind === 'O' || isSingleCell(piece.kind)) {
    return {
      ...piece,
      origin: { ...piece.origin },
    };
  }

  const nextRotation = (((piece.rotation + delta) % 4 + 4) % 4) as RotationState;
  const kicks = getKickOffsets(piece.kind, piece.rotation, nextRotation, delta);

  for (const kick of kicks) {
    const candidateOrigin: GridPos = {
      r: piece.origin.r + kick.dr,
      c: piece.origin.c + kick.dc,
    };
    if (fitsOnBoard(board, piece.kind, nextRotation, candidateOrigin)) {
      return {
        ...piece,
        origin: candidateOrigin,
        rotation: nextRotation,
      };
    }
  }

  return null;
}
