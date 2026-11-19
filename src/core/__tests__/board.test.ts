import { describe, expect, it } from 'vitest';
import {
  BOARD_SIZE,
  clearLinesAndCollapse,
  clearRingsAndExpand,
  countFullLines,
  createEmptyBoard,
  detonateNovaBomb,
  findFullLines,
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

describe('board geometry and concentric rings (16x16)', () => {
  it('partitions 16x16 grid into 6 rings (60, 52, 44, 36, 28, 20) and 4x4 center (16)', () => {
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
    expect(visited.size).toBe(256);
  });

  it('orders each ring clockwise starting from its top-left corner', () => {
    const r1 = getRingCells(1);
    expect(r1[0]).toEqual({ r: 0, c: 0 });
    expect(r1[15]).toEqual({ r: 0, c: 15 });
    expect(r1[30]).toEqual({ r: 15, c: 15 });
    expect(r1[45]).toEqual({ r: 15, c: 0 });
    expect(r1[59]).toEqual({ r: 1, c: 0 });

    const r6 = getRingCells(6);
    expect(r6[0]).toEqual({ r: 5, c: 5 });
    expect(r6[5]).toEqual({ r: 5, c: 10 });
    expect(r6[10]).toEqual({ r: 10, c: 10 });
    expect(r6[15]).toEqual({ r: 10, c: 5 });
    expect(r6[19]).toEqual({ r: 6, c: 5 });
  });

  it('expands all 52 cells of Ring 2 bijectively into Ring 1 with 45-degree corners leaving 8 straight-edge slots', () => {
    const board = createEmptyBoard();
    fillRing(board, 1, 1000);
    fillRing(board, 2, 2000);
    board[5][7] = makeCell(6001); // Ring 6 cell

    const { nextBoard, clearedCells, movements, isAllClear } = clearRingsAndExpand(board, [1]);

    expect(isAllClear).toBe(false);
    expect(clearedCells).toHaveLength(60);
    expect(movements).toHaveLength(53); // 52 from Ring 2 + 1 from Ring 6

    // Every corner of Ring 2 popped out 45 degrees into Ring 1's corners
    expect(nextBoard[0][0]?.id).toBe(2000); // (1,1) -> (0,0)
    expect(nextBoard[0][15]?.id).toBe(2013); // (1,14) -> (0,15)
    expect(nextBoard[15][15]?.id).toBe(2026); // (14,14) -> (15,15)
    expect(nextBoard[15][0]?.id).toBe(2039); // (14,1) -> (15,0)

    // Ring 1 now has 52 occupied cells and exactly 8 empty straight-edge slots (2 per side)
    const emptyR1 = getRingCells(1).filter((p) => nextBoard[p.r][p.c] === null);
    expect(emptyR1).toHaveLength(8);
    expect(emptyR1).toEqual(
      expect.arrayContaining([
        { r: 0, c: 1 },
        { r: 0, c: 14 },
        { r: 1, c: 15 },
        { r: 14, c: 15 },
        { r: 15, c: 14 },
        { r: 15, c: 1 },
        { r: 14, c: 0 },
        { r: 1, c: 0 },
      ]),
    );

    // Ring 6 cell (5,7) moved 1 step outward into Ring 5 at (4,7)
    expect(nextBoard[5][7]).toBeNull();
    expect(nextBoard[4][7]?.id).toBe(6001);
  });

  it('leaves outer rings untouched when clearing an inner ring (e.g., Ring 2 or Ring 6)', () => {
    const board = createEmptyBoard();
    board[0][7] = makeCell(101); // Ring 1 straight edge
    board[0][0] = makeCell(102); // Ring 1 corner
    fillRing(board, 2, 200);
    board[2][8] = makeCell(301); // Ring 3 straight edge
    board[5][5] = makeCell(601); // Ring 6 corner

    const res = clearRingsAndExpand(board, [2]);

    // Ring 1 untouched
    expect(res.nextBoard[0][7]?.id).toBe(101);
    expect(res.nextBoard[0][0]?.id).toBe(102);

    // Ring 3 moved to Ring 2
    expect(res.nextBoard[2][8]).toBeNull();
    expect(res.nextBoard[1][8]?.id).toBe(301);

    // Ring 6 corner (5,5) moved 1 step outward to (4,4)
    expect(res.nextBoard[5][5]).toBeNull();
    expect(res.nextBoard[4][4]?.id).toBe(601);
  });

  it('handles clearing Ring 6 without disturbing outer Rings 1-5', () => {
    const board = createEmptyBoard();
    board[0][3] = makeCell(1);
    board[2][6] = makeCell(2);
    board[4][7] = makeCell(3);
    fillRing(board, 6, 600);

    const res = clearRingsAndExpand(board, [6]);
    expect(res.clearedCells).toHaveLength(20);
    expect(res.movements).toHaveLength(0);
    expect(res.nextBoard[0][3]?.id).toBe(1);
    expect(res.nextBoard[2][6]?.id).toBe(2);
    expect(res.nextBoard[4][7]?.id).toBe(3);
    for (const p of getRingCells(6)) {
      expect(res.nextBoard[p.r][p.c]).toBeNull();
    }
  });

  it('handles multi-ring simultaneous clear (Ring 1 + Ring 3) and 6-ring All Clear', () => {
    const board = createEmptyBoard();
    fillRing(board, 1, 100);
    board[1][7] = makeCell(201); // Ring 2 -> moves 1 step to (0,7)
    fillRing(board, 3, 300);
    board[3][7] = makeCell(401); // Ring 4 -> moves 2 steps (past R3 and R1!) to (1,7)
    board[5][5] = makeCell(602); // Ring 6 corner -> moves 2 steps to (3,3)

    const full = findFullRings(board);
    expect(full).toEqual([1, 3]);

    const res = clearRingsAndExpand(board, full);
    expect(res.isAllClear).toBe(false);
    expect(res.nextBoard[0][7]?.id).toBe(201);
    expect(res.nextBoard[1][7]?.id).toBe(401);
    expect(res.nextBoard[3][3]?.id).toBe(602);

    // All Clear across all 6 rings (240 cells)
    const fullBoard = createEmptyBoard();
    for (const ring of RING_INDICES) {
      fillRing(fullBoard, ring, ring * 100);
    }
    const allRings = findFullRings(fullBoard);
    expect(allRings).toEqual([1, 2, 3, 4, 5, 6]);
    const clearAll = clearRingsAndExpand(fullBoard, allRings);
    expect(clearAll.isAllClear).toBe(true);
    expect(clearAll.clearedCells).toHaveLength(240);
  });

  it('pulls center-protruding cells (d=6, d=7) outward on clutch Ring 6 clear', () => {
    const board = createEmptyBoard();
    fillRing(board, 6, 600);
    board[6][7] = makeCell(701); // d=6 top straight edge
    board[6][6] = makeCell(702); // d=6 top-left corner
    board[7][7] = makeCell(703); // d=7 inner corner

    expect(getOutwardTarget(6, 7)).toEqual({ r: 5, c: 7 });
    expect(getOutwardTarget(6, 6)).toEqual({ r: 5, c: 5 });
    expect(getOutwardTarget(7, 7)).toEqual({ r: 6, c: 6 });

    const res = clearRingsAndExpand(board, [6]);
    expect(res.nextBoard[6][7]).toBeNull();
    expect(res.nextBoard[5][7]?.id).toBe(701);
    expect(res.nextBoard[5][5]?.id).toBe(702);
    expect(res.nextBoard[6][6]?.id).toBe(703);
  });

  it('detonates Nova Bomb 3x3 cleanly at interior, edge, and corner (0,0)', () => {
    const board = createEmptyBoard();
    for (let r = 0; r <= 2; r++) {
      for (let c = 0; c <= 2; c++) {
        board[r][c] = makeCell(r * 10 + c + 1);
      }
    }
    const cornerRes = detonateNovaBomb(board, { r: 0, c: 0 });
    expect(cornerRes.destroyed).toHaveLength(4);
    expect(cornerRes.nextBoard[0][0]).toBeNull();
    expect(cornerRes.nextBoard[1][1]).toBeNull();
    expect(cornerRes.nextBoard[0][2]).not.toBeNull();
    expect(cornerRes.nextBoard[2][0]).not.toBeNull();

    const b2 = createEmptyBoard();
    for (let r = 1; r <= 3; r++) {
      for (let c = 1; c <= 3; c++) {
        b2[r][c] = makeCell(r * 10 + c);
      }
    }
    const interiorRes = detonateNovaBomb(b2, { r: 2, c: 2 });
    expect(interiorRes.destroyed).toHaveLength(9);

    const b3 = createEmptyBoard();
    for (let r = 0; r <= 1; r++) {
      for (let c = 6; c <= 8; c++) {
        b3[r][c] = makeCell(r * 10 + c);
      }
    }
    const edgeRes = detonateNovaBomb(b3, { r: 0, c: 7 });
    expect(edgeRes.destroyed).toHaveLength(6);
  });

  it('detects outer full lines (N/S/W/E) while ignoring center rows/cols 6..9', () => {
    const board = createEmptyBoard();
    for (let c = 0; c < BOARD_SIZE; c++) {
      board[0][c] = makeCell(100 + c); // North row 0
      board[15][c] = makeCell(200 + c); // South row 15
      board[7][c] = makeCell(300 + c); // Center row 7 (should be ignored!)
    }
    for (let r = 0; r < BOARD_SIZE; r++) {
      board[r][2] = makeCell(400 + r); // West col 2
      board[r][13] = makeCell(500 + r); // East col 13
      board[r][8] = makeCell(600 + r); // Center col 8 (should be ignored!)
    }

    const lines = findFullLines(board);
    expect(lines.northRows).toEqual([0]);
    expect(lines.southRows).toEqual([15]);
    expect(lines.westCols).toEqual([2]);
    expect(lines.eastCols).toEqual([13]);
    expect(countFullLines(lines)).toBe(4);
  });

  it('collapses half-boards bijectively on single, multi-row, simultaneous cross clears, and clutch center pull-out', () => {
    // 1) South row 15 + North row 0 + multi-row (14,15)
    const b1 = createEmptyBoard();
    for (let c = 0; c < BOARD_SIZE; c++) {
      b1[15][c] = makeCell(100 + c);
      b1[14][c] = makeCell(200 + c);
    }
    b1[13][5] = makeCell(301); // South half -> collapses +2 rows to (15,5)
    b1[9][7] = makeCell(302); // Center protruding cell in South half -> pulls out +2 rows to (11,7)
    b1[7][7] = makeCell(303); // Center cell in North half -> stays at (7,7)

    const l1 = findFullLines(b1);
    const r1 = clearLinesAndCollapse(b1, l1);
    expect(r1.clearedCells).toHaveLength(32);
    expect(r1.nextBoard[15][5]?.id).toBe(301);
    expect(r1.nextBoard[11][7]?.id).toBe(302);
    expect(r1.nextBoard[7][7]?.id).toBe(303);

    // 2) North row 0 + West col 0 + South row 15 + East col 15 simultaneous cross clear
    const b2 = createEmptyBoard();
    for (let i = 0; i < BOARD_SIZE; i++) {
      b2[0][i] = makeCell(1000 + i);
      b2[15][i] = makeCell(2000 + i);
      b2[i][0] = makeCell(3000 + i);
      b2[i][15] = makeCell(4000 + i);
    }
    b2[14][14] = makeCell(9001); // SE quadrant -> moves (+1, +1) to (15,15)
    b2[1][1] = makeCell(9002); // NW quadrant -> moves (-1, -1) to (0,0)
    b2[14][1] = makeCell(9003); // SW quadrant -> moves (+1, -1) to (15,0)
    b2[1][14] = makeCell(9004); // NE quadrant -> moves (-1, +1) to (0,15)

    const l2 = findFullLines(b2);
    expect(countFullLines(l2)).toBe(4);
    const r2 = clearLinesAndCollapse(b2, l2);
    // 16+16+16+16 - 4 corner overlaps = 60 cells (Ring 1 cells!)
    expect(r2.clearedCells).toHaveLength(60);
    expect(r2.nextBoard[15][15]?.id).toBe(9001);
    expect(r2.nextBoard[0][0]?.id).toBe(9002);
    expect(r2.nextBoard[15][0]?.id).toBe(9003);
    expect(r2.nextBoard[0][15]?.id).toBe(9004);
  });
});
