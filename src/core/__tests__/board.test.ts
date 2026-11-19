import { describe, expect, it } from 'vitest';
import {
  BOARD_SIZE,
  clearRingsAndExpand,
  createEmptyBoard,
  detonateNovaBomb,
  findFullRings,
  getOutwardTarget,
  getRingCells,
  getRingIndex,
  isInCenter,
  RING_CELL_COUNTS,
  RING_INDICES,
} from '../index';
import type { BoardGrid, CellData, RingIndex } from '../types';

function makeCell(id: number): CellData {
  return { kind: 'T', id };
}

function fillRing(board: BoardGrid, ring: RingIndex, startId = 100): number {
  let id = startId;
  for (const pos of getRingCells(ring)) {
    board[pos.r][pos.c] = makeCell(id++);
  }
  return id;
}

describe('board geometry and concentric rings', () => {
  it('partitions 12x12 grid into 4 rings (44, 36, 28, 20) and 4x4 center (16)', () => {
    const visited = new Set<string>();
    let centerCount = 0;

    for (const ring of RING_INDICES) {
      const cells = getRingCells(ring);
      expect(cells).toHaveLength(RING_CELL_COUNTS[ring]);
      for (const pos of cells) {
        expect(getRingIndex(pos.r, pos.c)).toBe(ring);
        expect(isInCenter(pos.r, pos.c)).toBe(false);
        const key = `${pos.r},${pos.c}`;
        expect(visited.has(key)).toBe(false);
        visited.add(key);
      }
    }

    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        if (isInCenter(r, c)) {
          expect(getRingIndex(r, c)).toBeNull();
          const key = `${r},${c}`;
          expect(visited.has(key)).toBe(false);
          visited.add(key);
          centerCount++;
        }
      }
    }

    expect(centerCount).toBe(16);
    expect(visited.size).toBe(144);
  });

  it('orders each ring clockwise starting from its top-left corner', () => {
    const r1 = getRingCells(1);
    expect(r1[0]).toEqual({ r: 0, c: 0 });
    expect(r1[11]).toEqual({ r: 0, c: 11 });
    expect(r1[22]).toEqual({ r: 11, c: 11 });
    expect(r1[33]).toEqual({ r: 11, c: 0 });
    expect(r1[43]).toEqual({ r: 1, c: 0 });

    const r4 = getRingCells(4);
    expect(r4[0]).toEqual({ r: 3, c: 3 });
    expect(r4[5]).toEqual({ r: 3, c: 8 });
    expect(r4[10]).toEqual({ r: 8, c: 8 });
    expect(r4[15]).toEqual({ r: 8, c: 3 });
    expect(r4[19]).toEqual({ r: 4, c: 3 });
  });

  it('expands all 20 cells of Ring 2 bijectively into Ring 1 with 45-degree corners leaving 8 straight-edge slots', () => {
    const board = createEmptyBoard();
    fillRing(board, 1, 1000);
    fillRing(board, 2, 2000);
    // Keep one outer cell on Ring 1 (already filled, will be cleared) and test Ring 2 -> Ring 1
    // Also place a block on Ring 4 to verify multi-ring expansion
    board[3][5] = makeCell(4001);

    const { nextBoard, clearedCells, movements, isAllClear } = clearRingsAndExpand(board, [1]);

    expect(isAllClear).toBe(false);
    expect(clearedCells).toHaveLength(44);
    // 36 cells from Ring 2 + 1 cell from Ring 4 = 37 movements
    expect(movements).toHaveLength(37);

    // Every corner of Ring 2 popped out 45 degrees into Ring 1's corners
    expect(nextBoard[0][0]?.id).toBe(2000); // (1,1) -> (0,0)
    expect(nextBoard[0][11]?.id).toBe(2009); // (1,10) -> (0,11)
    expect(nextBoard[11][11]?.id).toBe(2018); // (10,10) -> (11,11)
    expect(nextBoard[11][0]?.id).toBe(2027); // (10,1) -> (11,0)

    // Verify Ring 1 now has 36 occupied cells and exactly 8 empty straight-edge slots (2 per side)
    const emptyR1 = getRingCells(1).filter((p) => nextBoard[p.r][p.c] === null);
    expect(emptyR1).toHaveLength(8);
    expect(emptyR1).toEqual(
      expect.arrayContaining([
        { r: 0, c: 1 },
        { r: 0, c: 10 },
        { r: 1, c: 11 },
        { r: 10, c: 11 },
        { r: 11, c: 10 },
        { r: 11, c: 1 },
        { r: 10, c: 0 },
        { r: 1, c: 0 },
      ]),
    );

    // Ring 4 cell (3,5) moved 1 step outward into Ring 3 at (2,5)
    expect(nextBoard[3][5]).toBeNull();
    expect(nextBoard[2][5]?.id).toBe(4001);
  });

  it('leaves outer rings untouched when clearing an inner ring (e.g., Ring 2 or Ring 4)', () => {
    const board = createEmptyBoard();
    board[0][5] = makeCell(101); // Ring 1 straight edge
    board[0][0] = makeCell(102); // Ring 1 corner
    fillRing(board, 2, 200);
    board[2][6] = makeCell(301); // Ring 3 straight edge
    board[3][3] = makeCell(401); // Ring 4 corner

    const res = clearRingsAndExpand(board, [2]);

    // Ring 1 untouched
    expect(res.nextBoard[0][5]?.id).toBe(101);
    expect(res.nextBoard[0][0]?.id).toBe(102);

    // Ring 3 moved to Ring 2
    expect(res.nextBoard[2][6]).toBeNull();
    expect(res.nextBoard[1][6]?.id).toBe(301);

    // Ring 4 corner (3,3) moved 1 step outward to (2,2)
    expect(res.nextBoard[3][3]).toBeNull();
    expect(res.nextBoard[2][2]?.id).toBe(401);
  });

  it('handles clearing Ring 4 without disturbing outer Rings 1-3', () => {
    const board = createEmptyBoard();
    board[0][3] = makeCell(1);
    board[1][4] = makeCell(2);
    board[2][5] = makeCell(3);
    fillRing(board, 4, 400);

    const res = clearRingsAndExpand(board, [4]);
    expect(res.clearedCells).toHaveLength(20);
    expect(res.movements).toHaveLength(0);
    expect(res.nextBoard[0][3]?.id).toBe(1);
    expect(res.nextBoard[1][4]?.id).toBe(2);
    expect(res.nextBoard[2][5]?.id).toBe(3);
    for (const p of getRingCells(4)) {
      expect(res.nextBoard[p.r][p.c]).toBeNull();
    }
  });

  it('handles multi-ring simultaneous clear (Ring 1 + Ring 3) and All Clear', () => {
    const board = createEmptyBoard();
    fillRing(board, 1, 100);
    board[1][5] = makeCell(201); // Ring 2 -> moves 1 step to (0,5)
    fillRing(board, 3, 300);
    board[3][5] = makeCell(401); // Ring 4 -> moves 2 steps (past R3 and R1!) to (1,5)
    board[3][3] = makeCell(402); // Ring 4 corner -> moves 2 steps to (1,1)

    const full = findFullRings(board);
    expect(full).toEqual([1, 3]);

    const res = clearRingsAndExpand(board, full);
    expect(res.isAllClear).toBe(false);
    expect(res.nextBoard[0][5]?.id).toBe(201);
    expect(res.nextBoard[1][5]?.id).toBe(401);
    expect(res.nextBoard[1][1]?.id).toBe(402);

    // All Clear across all 4 rings
    const fullBoard = createEmptyBoard();
    fillRing(fullBoard, 1, 100);
    fillRing(fullBoard, 2, 200);
    fillRing(fullBoard, 3, 300);
    fillRing(fullBoard, 4, 400);
    const allRings = findFullRings(fullBoard);
    expect(allRings).toEqual([1, 2, 3, 4]);
    const clearAll = clearRingsAndExpand(fullBoard, allRings);
    expect(clearAll.isAllClear).toBe(true);
    expect(clearAll.clearedCells).toHaveLength(128);
  });

  it('pulls center-protruding cells (d=4, d=5) outward on clutch Ring 4 clear', () => {
    const board = createEmptyBoard();
    fillRing(board, 4, 400);
    board[4][5] = makeCell(501); // d=4 top straight edge
    board[4][4] = makeCell(502); // d=4 top-left corner
    board[5][5] = makeCell(503); // d=5 inner corner

    expect(getOutwardTarget(4, 5)).toEqual({ r: 3, c: 5 });
    expect(getOutwardTarget(4, 4)).toEqual({ r: 3, c: 3 });
    expect(getOutwardTarget(5, 5)).toEqual({ r: 4, c: 4 });

    const res = clearRingsAndExpand(board, [4]);
    expect(res.nextBoard[4][5]).toBeNull();
    expect(res.nextBoard[3][5]?.id).toBe(501);
    expect(res.nextBoard[3][3]?.id).toBe(502);
    expect(res.nextBoard[4][4]?.id).toBe(503);
  });

  it('detonates Nova Bomb 3x3 cleanly at interior, edge, and corner (0,0)', () => {
    const board = createEmptyBoard();
    // Fill 3x3 around (0,0) plus extra neighbor outside 3x3
    for (let r = 0; r <= 2; r++) {
      for (let c = 0; c <= 2; c++) {
        board[r][c] = makeCell(r * 10 + c + 1);
      }
    }
    const cornerRes = detonateNovaBomb(board, { r: 0, c: 0 });
    expect(cornerRes.destroyed).toHaveLength(4); // (0,0),(0,1),(1,0),(1,1)
    expect(cornerRes.nextBoard[0][0]).toBeNull();
    expect(cornerRes.nextBoard[1][1]).toBeNull();
    expect(cornerRes.nextBoard[0][2]).not.toBeNull();
    expect(cornerRes.nextBoard[2][0]).not.toBeNull();

    // Interior detonation destroys full 3x3 = 9 cells
    const b2 = createEmptyBoard();
    for (let r = 1; r <= 3; r++) {
      for (let c = 1; c <= 3; c++) {
        b2[r][c] = makeCell(r * 10 + c);
      }
    }
    const interiorRes = detonateNovaBomb(b2, { r: 2, c: 2 });
    expect(interiorRes.destroyed).toHaveLength(9);

    // Edge detonation destroys 6 cells clamped
    const b3 = createEmptyBoard();
    for (let r = 0; r <= 1; r++) {
      for (let c = 4; c <= 6; c++) {
        b3[r][c] = makeCell(r * 10 + c);
      }
    }
    const edgeRes = detonateNovaBomb(b3, { r: 0, c: 5 });
    expect(edgeRes.destroyed).toHaveLength(6);
  });
});
