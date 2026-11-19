import { canPlacePiece, inBounds } from './board';
import { BOARD_SIZE, CARDINAL_VECTORS, DIR_VECTORS } from './constants';
import { getPieceCells } from './pieces';
import type {
  ActivePiece,
  BoardGrid,
  CardinalDir,
  Direction8,
  GhostPlacement,
  GridPos,
  SlideBias,
} from './types';

export interface StepResult {
  moved: boolean;
  nextPiece: ActivePiece;
}

function chooseDualOpenSlideAxis(piece: ActivePiece, dr: number, dc: number): 'vertical' | 'horizontal' {
  if (piece.slideBias !== null) {
    return piece.slideBias;
  }
  const cells = getPieceCells(piece.kind, piece.rotation, piece.origin);
  let minR = BOARD_SIZE - 1;
  let maxR = 0;
  let minC = BOARD_SIZE - 1;
  let maxC = 0;

  for (const cell of cells) {
    if (cell.r < minR) minR = cell.r;
    if (cell.r > maxR) maxR = cell.r;
    if (cell.c < minC) minC = cell.c;
    if (cell.c > maxC) maxC = cell.c;
  }

  const distV = dr < 0 ? minR : BOARD_SIZE - 1 - maxR;
  const distH = dc < 0 ? minC : BOARD_SIZE - 1 - maxC;
  return distV <= distH ? 'vertical' : 'horizontal';
}

export function stepNormalPiece(board: BoardGrid, piece: ActivePiece): StepResult {
  if (!piece.direction) {
    return { moved: false, nextPiece: piece };
  }

  const { dr, dc } = DIR_VECTORS[piece.direction];

  if (dr === 0 || dc === 0) {
    const nextOrigin: GridPos = { r: piece.origin.r + dr, c: piece.origin.c + dc };
    if (canPlacePiece(board, piece.kind, piece.rotation, nextOrigin)) {
      return {
        moved: true,
        nextPiece: { ...piece, origin: nextOrigin },
      };
    }
    return { moved: false, nextPiece: piece };
  }

  const diagOrigin: GridPos = { r: piece.origin.r + dr, c: piece.origin.c + dc };
  if (canPlacePiece(board, piece.kind, piece.rotation, diagOrigin)) {
    return {
      moved: true,
      nextPiece: { ...piece, origin: diagOrigin },
    };
  }

  const vOrigin: GridPos = { r: piece.origin.r + dr, c: piece.origin.c };
  const hOrigin: GridPos = { r: piece.origin.r, c: piece.origin.c + dc };
  const canV = canPlacePiece(board, piece.kind, piece.rotation, vOrigin);
  const canH = canPlacePiece(board, piece.kind, piece.rotation, hOrigin);

  if (canV && !canH) {
    return {
      moved: true,
      nextPiece: { ...piece, origin: vOrigin },
    };
  }
  if (!canV && canH) {
    return {
      moved: true,
      nextPiece: { ...piece, origin: hOrigin },
    };
  }
  if (canV && canH) {
    const axis = chooseDualOpenSlideAxis(piece, dr, dc);
    return {
      moved: true,
      nextPiece: { ...piece, origin: axis === 'vertical' ? vOrigin : hOrigin },
    };
  }

  return { moved: false, nextPiece: piece };
}

export function computePiercerRay(
  start: GridPos,
  dir: Direction8,
  slideBias: SlideBias = null,
): GridPos[] {
  const ray: GridPos[] = [{ r: start.r, c: start.c }];
  const { dr, dc } = DIR_VECTORS[dir];
  let cur = { r: start.r, c: start.c };

  for (let i = 0; i < BOARD_SIZE * 4; i++) {
    if (dr === 0 || dc === 0) {
      const next: GridPos = { r: cur.r + dr, c: cur.c + dc };
      if (!inBounds(next.r, next.c)) {
        break;
      }
      ray.push(next);
      cur = next;
      continue;
    }

    const diag: GridPos = { r: cur.r + dr, c: cur.c + dc };
    if (inBounds(diag.r, diag.c)) {
      ray.push(diag);
      cur = diag;
      continue;
    }

    const vPos: GridPos = { r: cur.r + dr, c: cur.c };
    const hPos: GridPos = { r: cur.r, c: cur.c + dc };
    const canV = inBounds(vPos.r, vPos.c);
    const canH = inBounds(hPos.r, hPos.c);

    if (canV && !canH) {
      ray.push(vPos);
      cur = vPos;
    } else if (!canV && canH) {
      ray.push(hPos);
      cur = hPos;
    } else if (canV && canH) {
      const next = slideBias === 'horizontal' ? hPos : vPos;
      ray.push(next);
      cur = next;
    } else {
      break;
    }
  }

  return ray;
}

export function stepPiercerPiece(board: BoardGrid, piece: ActivePiece): StepResult {
  if (!piece.direction) {
    return { moved: false, nextPiece: piece };
  }

  const ray = computePiercerRay(piece.origin, piece.direction, piece.slideBias);
  if (ray.length <= 1) {
    return { moved: false, nextPiece: piece };
  }

  const hasEmptyAhead = ray.slice(1).some((pos) => board[pos.r][pos.c] === null);
  if (!hasEmptyAhead) {
    return { moved: false, nextPiece: piece };
  }

  return {
    moved: true,
    nextPiece: {
      ...piece,
      origin: { r: ray[1].r, c: ray[1].c },
    },
  };
}

export function stepPiece(board: BoardGrid, piece: ActivePiece): StepResult {
  if (piece.kind === 'STARDUST_PIERCER') {
    return stepPiercerPiece(board, piece);
  }
  return stepNormalPiece(board, piece);
}

function getDiagonalNudgeEffect(
  dir: Direction8,
  inputDir: CardinalDir,
): { offset: GridPos; slideBias: 'vertical' | 'horizontal' } | null {
  const { dr, dc } = DIR_VECTORS[dir];
  if (dr === 0 || dc === 0) {
    return null;
  }

  const verticalDir: CardinalDir = dr < 0 ? 'N' : 'S';
  const oppositeHorizDir: CardinalDir = dc < 0 ? 'E' : 'W';

  if (inputDir === verticalDir || inputDir === oppositeHorizDir) {
    return { offset: { r: dr, c: 0 }, slideBias: 'vertical' };
  }

  return { offset: { r: 0, c: dc }, slideBias: 'horizontal' };
}

export function nudgePiece(
  board: BoardGrid,
  piece: ActivePiece,
  inputDir: CardinalDir,
): ActivePiece | null {
  if (!piece.direction) {
    return null;
  }

  const { dr, dc } = DIR_VECTORS[piece.direction];
  let nextOrigin: GridPos;
  let nextSlideBias: SlideBias = piece.slideBias;

  if (dr === 0 || dc === 0) {
    const inputVec = CARDINAL_VECTORS[inputDir];
    // Perpendicular to cardinal flight only
    if ((dr === 0 && inputVec.dr === 0) || (dc === 0 && inputVec.dc === 0)) {
      return null;
    }
    nextOrigin = {
      r: piece.origin.r + inputVec.dr,
      c: piece.origin.c + inputVec.dc,
    };
  } else {
    const effect = getDiagonalNudgeEffect(piece.direction, inputDir);
    if (!effect) {
      return null;
    }
    nextOrigin = {
      r: piece.origin.r + effect.offset.r,
      c: piece.origin.c + effect.offset.c,
    };
    nextSlideBias = effect.slideBias;
  }

  if (piece.kind === 'STARDUST_PIERCER') {
    if (!inBounds(nextOrigin.r, nextOrigin.c)) {
      return null;
    }
    const ray = computePiercerRay(nextOrigin, piece.direction, nextSlideBias);
    const hasEmptyOnRay = ray.some((pos) => board[pos.r][pos.c] === null);
    if (!hasEmptyOnRay) {
      return null;
    }
    return {
      ...piece,
      origin: nextOrigin,
      slideBias: nextSlideBias,
    };
  }

  if (!canPlacePiece(board, piece.kind, piece.rotation, nextOrigin)) {
    return null;
  }

  return {
    ...piece,
    origin: nextOrigin,
    slideBias: nextSlideBias,
  };
}

export function computeGhostPlacement(board: BoardGrid, piece: ActivePiece): GhostPlacement {
  let current: ActivePiece = {
    ...piece,
    origin: { ...piece.origin },
  };
  const path: GridPos[] = [{ ...current.origin }];
  let steps = 0;

  if (!current.direction) {
    const targetValid =
      current.kind === 'STARDUST_PIERCER'
        ? board[current.origin.r][current.origin.c] === null
        : canPlacePiece(board, current.kind, current.rotation, current.origin);
    return { finalPiece: current, path, steps, targetValid };
  }

  for (let i = 0; i < BOARD_SIZE * 4; i++) {
    const res = stepPiece(board, current);
    if (!res.moved) {
      break;
    }
    current = res.nextPiece;
    path.push({ ...current.origin });
    steps++;
  }

  const targetValid =
    current.kind === 'STARDUST_PIERCER'
      ? inBounds(current.origin.r, current.origin.c) &&
        board[current.origin.r][current.origin.c] === null
      : canPlacePiece(board, current.kind, current.rotation, current.origin);

  return {
    finalPiece: current,
    path,
    steps,
    targetValid,
  };
}
