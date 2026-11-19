import { BOARD_SIZE, CENTER_MAX, CENTER_MIN } from './constants';
import { getPieceCells } from './pieces';
import type {
  ActivePiece,
  BoardGrid,
  CellData,
  CellMovement,
  ClearedCell,
  GridPos,
  PieceKind,
  RingIndex,
  RotationState,
} from './types';

export function createEmptyBoard(): BoardGrid {
  return Array.from({ length: BOARD_SIZE }, () =>
    Array.from({ length: BOARD_SIZE }, () => null),
  );
}

export function cloneBoard(board: BoardGrid): BoardGrid {
  return board.map((row) => row.map((cell) => (cell ? { ...cell } : null)));
}

export function inBounds(r: number, c: number): boolean {
  return r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE;
}

export function isInCenter(r: number, c: number): boolean {
  return r >= CENTER_MIN && r <= CENTER_MAX && c >= CENTER_MIN && c <= CENTER_MAX;
}

export function getDepth(r: number, c: number): number {
  return Math.min(r, BOARD_SIZE - 1 - r, c, BOARD_SIZE - 1 - c);
}

export function getRingIndex(r: number, c: number): RingIndex | null {
  if (!inBounds(r, c)) {
    return null;
  }
  const depth = getDepth(r, c);
  return depth < 4 ? ((depth + 1) as RingIndex) : null;
}

export function getRingCells(ring: RingIndex): GridPos[] {
  const d = ring - 1;
  const max = BOARD_SIZE - 1 - d;
  const cells: GridPos[] = [];

  for (let c = d; c <= max; c++) {
    cells.push({ r: d, c });
  }
  for (let r = d + 1; r <= max; r++) {
    cells.push({ r, c: max });
  }
  for (let c = max - 1; c >= d; c--) {
    cells.push({ r: max, c });
  }
  for (let r = max - 1; r >= d + 1; r--) {
    cells.push({ r, c: d });
  }

  return cells;
}

export function isRingFull(board: BoardGrid, ring: RingIndex): boolean {
  return getRingCells(ring).every(({ r, c }) => board[r][c] !== null);
}

export function findFullRings(board: BoardGrid): RingIndex[] {
  const full: RingIndex[] = [];
  for (const ring of [1, 2, 3, 4] as const) {
    if (isRingFull(board, ring)) {
      full.push(ring);
    }
  }
  return full;
}

export function getOutwardTarget(r: number, c: number): GridPos | null {
  const d = getDepth(r, c);
  if (d === 0) {
    return null;
  }
  const max = BOARD_SIZE - 1 - d;
  const isTop = r === d;
  const isBottom = r === max;
  const isLeft = c === d;
  const isRight = c === max;

  if ((isTop || isBottom) && (isLeft || isRight)) {
    return {
      r: isTop ? r - 1 : r + 1,
      c: isLeft ? c - 1 : c + 1,
    };
  }
  if (isTop) {
    return { r: r - 1, c };
  }
  if (isBottom) {
    return { r: r + 1, c };
  }
  if (isLeft) {
    return { r, c: c - 1 };
  }
  return { r, c: c + 1 };
}

export interface RingClearResult {
  nextBoard: BoardGrid;
  clearedCells: ClearedCell[];
  movements: CellMovement[];
  isAllClear: boolean;
}

export function clearRingsAndExpand(
  board: BoardGrid,
  fullRings: RingIndex[],
): RingClearResult {
  const clearedSet = new Set<RingIndex>(fullRings);
  const nextBoard = createEmptyBoard();
  const clearedCells: ClearedCell[] = [];
  const movements: CellMovement[] = [];

  for (const ring of fullRings) {
    for (const pos of getRingCells(ring)) {
      const cell = board[pos.r][pos.c];
      if (cell) {
        clearedCells.push({ pos, ring, cell: { ...cell } });
      }
    }
  }

  let remainingCount = 0;

  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      const cell = board[r][c];
      if (!cell) {
        continue;
      }
      const ring = getRingIndex(r, c);
      if (ring !== null && clearedSet.has(ring)) {
        continue;
      }

      const depth = getDepth(r, c);
      let steps = 0;
      for (const clearedRing of fullRings) {
        if (clearedRing - 1 < depth) {
          steps++;
        }
      }

      let dest: GridPos = { r, c };
      for (let i = 0; i < steps; i++) {
        const nextPos = getOutwardTarget(dest.r, dest.c);
        if (nextPos === null) {
          break;
        }
        dest = nextPos;
      }

      const copiedCell: CellData = { ...cell };
      nextBoard[dest.r][dest.c] = copiedCell;
      remainingCount++;

      if (steps > 0) {
        movements.push({
          cell: copiedCell,
          from: { r, c },
          to: dest,
        });
      }
    }
  }

  return {
    nextBoard,
    clearedCells,
    movements,
    isAllClear: remainingCount === 0,
  };
}

export function canPlacePiece(
  board: BoardGrid,
  kind: PieceKind,
  rotation: RotationState,
  origin: GridPos,
): boolean {
  const cells = getPieceCells(kind, rotation, origin);
  for (const pos of cells) {
    if (!inBounds(pos.r, pos.c) || board[pos.r][pos.c] !== null) {
      return false;
    }
  }
  return true;
}

export function placePieceCells(
  board: BoardGrid,
  piece: ActivePiece,
  nextCellIdRef: { current: number },
): { nextBoard: BoardGrid; placed: { pos: GridPos; cell: CellData }[] } {
  const nextBoard = cloneBoard(board);
  const placed: { pos: GridPos; cell: CellData }[] = [];

  for (const pos of getPieceCells(piece.kind, piece.rotation, piece.origin)) {
    const cell: CellData = { kind: piece.kind, id: nextCellIdRef.current++ };
    nextBoard[pos.r][pos.c] = cell;
    placed.push({ pos, cell });
  }

  return { nextBoard, placed };
}

export function detonateNovaBomb(
  board: BoardGrid,
  center: GridPos,
): { nextBoard: BoardGrid; destroyed: { pos: GridPos; cell: CellData }[] } {
  const nextBoard = cloneBoard(board);
  const destroyed: { pos: GridPos; cell: CellData }[] = [];

  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      const r = center.r + dr;
      const c = center.c + dc;
      if (!inBounds(r, c)) {
        continue;
      }
      const cell = nextBoard[r][c];
      if (cell) {
        destroyed.push({ pos: { r, c }, cell: { ...cell } });
        nextBoard[r][c] = null;
      }
    }
  }

  return { nextBoard, destroyed };
}

export function hasCenterIntrusion(board: BoardGrid): boolean {
  for (let r = CENTER_MIN; r <= CENTER_MAX; r++) {
    for (let c = CENTER_MIN; c <= CENTER_MAX; c++) {
      if (board[r][c] !== null) {
        return true;
      }
    }
  }
  return false;
}

export function isDangerState(board: BoardGrid): boolean {
  for (let r = 3; r <= 8; r++) {
    for (let c = 3; c <= 8; c++) {
      if (board[r][c] !== null) {
        return true;
      }
    }
  }
  return false;
}
