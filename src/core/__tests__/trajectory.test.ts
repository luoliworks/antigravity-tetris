import { describe, expect, it } from 'vitest';
import {
  computeGhostPlacement,
  createEmptyBoard,
  getPieceCells,
  nudgePiece,
  stepPiece,
  tryRotatePiece,
} from '../index';
import type { ActivePiece, BoardGrid, CellData } from '../types';

function block(id = 1): CellData {
  return { kind: 'O', id };
}

function placeBlocks(board: BoardGrid, coords: [number, number][]): void {
  coords.forEach(([r, c], idx) => {
    board[r][c] = block(idx + 1);
  });
}

describe('trajectory, 3-stage wall-slide, nudges, ghost, piercer, and SRS rotation', () => {
  it('moves cardinally until wall/obstacle, supports perpendicular nudges, ignores parallel nudges', () => {
    const board = createEmptyBoard();
    board[1][5] = block();

    const piece: ActivePiece = {
      kind: 'M1',
      origin: { r: 5, c: 5 },
      rotation: 0,
      direction: 'N',
      slideBias: null,
    };

    // Parallel / opposite nudges ignored
    expect(nudgePiece(board, piece, 'N')).toBeNull();
    expect(nudgePiece(board, piece, 'S')).toBeNull();

    // Perpendicular nudge works
    const nudgedRight = nudgePiece(board, piece, 'E');
    expect(nudgedRight?.origin).toEqual({ r: 5, c: 6 });

    // Ghost on original column stops right before (1,5) at (2,5)
    const ghost = computeGhostPlacement(board, piece);
    expect(ghost.finalPiece.origin).toEqual({ r: 2, c: 5 });
    expect(ghost.steps).toBe(3);
  });

  it('performs 3-stage diagonal wall-slide: diagonal clear -> single side open -> full stop', () => {
    const board = createEmptyBoard();
    // 1x1 moving NW from (3, 5) hits top wall at (0, 2) -> slides W along row 0 to (0, 0)
    const m1: ActivePiece = {
      kind: 'M1',
      origin: { r: 3, c: 5 },
      rotation: 0,
      direction: 'NW',
      slideBias: null,
    };

    const ghost = computeGhostPlacement(board, m1);
    expect(ghost.path).toEqual([
      { r: 3, c: 5 },
      { r: 2, c: 4 },
      { r: 1, c: 3 },
      { r: 0, c: 2 },
      { r: 0, c: 1 },
      { r: 0, c: 0 },
    ]);
    expect(ghost.finalPiece.origin).toEqual({ r: 0, c: 0 });
    expect(ghost.steps).toBe(5);

    // Block all 3 NW exits around (2,2): (1,1), (1,2), (2,1) -> stops at (2,2)
    const blockedBoard = createEmptyBoard();
    placeBlocks(blockedBoard, [
      [1, 1],
      [1, 2],
      [2, 1],
    ]);
    const stuck = stepPiece(blockedBoard, {
      kind: 'M1',
      origin: { r: 2, c: 2 },
      rotation: 0,
      direction: 'NW',
      slideBias: null,
    });
    expect(stuck.moved).toBe(false);
  });

  it('deterministically breaks dual-open diagonal corner tie using slideBias, then closer outer wall', () => {
    const board = createEmptyBoard();
    // Place single corner obstacle diagonally ahead at (2, 4) for piece at (3, 5) flying NW.
    // Both (2, 5) [vertical] and (3, 4) [horizontal] are open.
    // Distance to top wall = 3; distance to left wall = 5 -> closer outer wall is vertical!
    board[2][4] = block();

    const basePiece: ActivePiece = {
      kind: 'M1',
      origin: { r: 3, c: 5 },
      rotation: 0,
      direction: 'NW',
      slideBias: null,
    };

    const stepAuto = stepPiece(board, basePiece);
    expect(stepAuto.moved).toBe(true);
    expect(stepAuto.nextPiece.origin).toEqual({ r: 2, c: 5 });

    // With explicit horizontal slideBias, chooses (3, 4) instead
    const biasedPiece: ActivePiece = { ...basePiece, slideBias: 'horizontal' };
    const stepBiased = stepPiece(board, biasedPiece);
    expect(stepBiased.moved).toBe(true);
    expect(stepBiased.nextPiece.origin).toEqual({ r: 3, c: 4 });

    // Equidistant from both walls: (3, 3) hitting (2, 2) -> distV === distH === 3 -> chooses vertical (2, 3)
    const eqBoard = createEmptyBoard();
    eqBoard[2][2] = block();
    const eqStep = stepPiece(eqBoard, {
      kind: 'M1',
      origin: { r: 3, c: 3 },
      rotation: 0,
      direction: 'NW',
      slideBias: null,
    });
    expect(eqStep.nextPiece.origin).toEqual({ r: 2, c: 3 });
  });

  it('handles diagonal nudge keys strictly monotonically toward chosen wall tracks', () => {
    const board = createEmptyBoard();

    const cases: Array<{
      dir: 'NW' | 'NE' | 'SW' | 'SE';
      vKeys: Array<'N' | 'E' | 'S' | 'W'>;
      hKeys: Array<'N' | 'E' | 'S' | 'W'>;
      vDelta: [number, number];
      hDelta: [number, number];
    }> = [
      { dir: 'NW', vKeys: ['N', 'E'], hKeys: ['W', 'S'], vDelta: [-1, 0], hDelta: [0, -1] },
      { dir: 'NE', vKeys: ['N', 'W'], hKeys: ['E', 'S'], vDelta: [-1, 0], hDelta: [0, 1] },
      { dir: 'SW', vKeys: ['S', 'E'], hKeys: ['W', 'N'], vDelta: [1, 0], hDelta: [0, -1] },
      { dir: 'SE', vKeys: ['S', 'W'], hKeys: ['E', 'N'], vDelta: [1, 0], hDelta: [0, 1] },
    ];

    for (const tc of cases) {
      const p: ActivePiece = {
        kind: 'M1',
        origin: { r: 5, c: 5 },
        rotation: 0,
        direction: tc.dir,
        slideBias: null,
      };
      for (const vk of tc.vKeys) {
        const res = nudgePiece(board, p, vk)!;
        expect(res.origin).toEqual({ r: 5 + tc.vDelta[0], c: 5 + tc.vDelta[1] });
        expect(res.slideBias).toBe('vertical');
      }
      for (const hk of tc.hKeys) {
        const res = nudgePiece(board, p, hk)!;
        expect(res.origin).toEqual({ r: 5 + tc.hDelta[0], c: 5 + tc.hDelta[1] });
        expect(res.slideBias).toBe('horizontal');
      }
    }
  });

  it('ghost placement exactly matches step-by-step flight for multi-cell pieces including wall slides', () => {
    const board = createEmptyBoard();
    placeBlocks(board, [
      [0, 3],
      [1, 3],
      [2, 2],
    ]);

    const tPiece: ActivePiece = {
      kind: 'T',
      origin: { r: 4, c: 4 },
      rotation: 0,
      direction: 'NW',
      slideBias: null,
    };

    const nudged = nudgePiece(board, tPiece, 'W')!;
    const ghost = computeGhostPlacement(board, nudged);

    let sim = nudged;
    let simSteps = 0;
    while (true) {
      const s = stepPiece(board, sim);
      if (!s.moved) break;
      sim = s.nextPiece;
      simSteps++;
    }

    expect(simSteps).toBe(ghost.steps);
    expect(sim.origin).toEqual(ghost.finalPiece.origin);
    expect(getPieceCells(sim.kind, sim.rotation, sim.origin)).toEqual(
      getPieceCells(ghost.finalPiece.kind, ghost.finalPiece.rotation, ghost.finalPiece.origin),
    );
  });

  it('Stardust Piercer pierces outer solid barriers to reach outermost empty hole, and stops at buried inner hole', () => {
    const board = createEmptyBoard();
    // Column 5 going North from (5,5):
    // (3,5) solid, (2,5) EMPTY, (1,5) solid, (0,5) EMPTY
    placeBlocks(board, [
      [3, 5],
      [1, 5],
    ]);

    const piercer: ActivePiece = {
      kind: 'STARDUST_PIERCER',
      origin: { r: 5, c: 5 },
      rotation: 0,
      direction: 'N',
      slideBias: null,
    };

    // Outermost hole is (0,5)
    const ghostOuter = computeGhostPlacement(board, piercer);
    expect(ghostOuter.finalPiece.origin).toEqual({ r: 0, c: 5 });
    expect(ghostOuter.targetValid).toBe(true);

    // Now fill (0,5) as well -> outermost remaining hole is buried at (2,5)
    board[0][5] = block(99);
    const ghostBuried = computeGhostPlacement(board, piercer);
    expect(ghostBuried.finalPiece.origin).toEqual({ r: 2, c: 5 });
    expect(ghostBuried.targetValid).toBe(true);

    // Step-by-step stops cleanly at (2,5) without entering solid (1,5)
    let cur = piercer;
    for (let i = 0; i < 10; i++) {
      const s = stepPiece(board, cur);
      if (!s.moved) break;
      cur = s.nextPiece;
    }
    expect(cur.origin).toEqual({ r: 2, c: 5 });

    // Diagonal boundary wall-slide: from (3, 5) moving NW -> hits top wall at (0,2), slides to (0,0)
    const diagBoard = createEmptyBoard();
    placeBlocks(diagBoard, [
      [2, 4],
      [1, 3],
      [0, 2],
      [0, 0],
    ]);
    // (0,1) is the only open hole near the corner!
    const diagPiercer: ActivePiece = {
      kind: 'STARDUST_PIERCER',
      origin: { r: 3, c: 5 },
      rotation: 0,
      direction: 'NW',
      slideBias: null,
    };
    const diagGhost = computeGhostPlacement(diagBoard, diagPiercer);
    expect(diagGhost.finalPiece.origin).toEqual({ r: 0, c: 1 });
    expect(diagGhost.targetValid).toBe(true);
  });

  it('rotates pieces with SRS wall kicks and keeps O / 1x1 pieces unchanged', () => {
    const board = createEmptyBoard();

    // O and M1 are no-ops
    const oPiece: ActivePiece = {
      kind: 'O',
      origin: { r: 5, c: 5 },
      rotation: 0,
      direction: null,
      slideBias: null,
    };
    expect(tryRotatePiece(board, oPiece, 1)?.rotation).toBe(0);

    // I piece near left wall kicks inward cleanly
    const iPiece: ActivePiece = {
      kind: 'I',
      origin: { r: 4, c: -1 }, // state 1 occupies col 1 (valid), rotating CCW/CW kicks right
      rotation: 1,
      direction: 'W',
      slideBias: null,
    };
    const rotatedI = tryRotatePiece(board, iPiece, 1);
    expect(rotatedI).not.toBeNull();
    expect(rotatedI?.rotation).toBe(2);
    expect(rotatedI!.origin.c).toBeGreaterThanOrEqual(0);

    // L3 rotates across all 4 corner orientations
    let l3: ActivePiece = {
      kind: 'L3',
      origin: { r: 5, c: 5 },
      rotation: 0,
      direction: null,
      slideBias: null,
    };
    for (let r = 1; r <= 4; r++) {
      l3 = tryRotatePiece(board, l3, 1)!;
      expect(l3.rotation).toBe(r % 4);
    }
  });
});
