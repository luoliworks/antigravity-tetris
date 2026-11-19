import { describe, expect, it } from 'vitest';
import {
  calculateLevelFromClears,
  createEmptyBoard,
  findNearFullLineGaps,
  GameEngine,
  getBestRingProgress,
  getLevelConfig,
  getLevelProgress,
  getQuickWindowMs,
  getRingCells,
  INTRO_DURATION_MS,
} from '../index';
import type { BoardGrid, PieceKind, RingIndex } from '../types';

function fillRingExcept(board: BoardGrid, ring: RingIndex, exclude: [number, number][]): void {
  const excluded = new Set(exclude.map(([r, c]) => `${r},${c}`));
  let id = ring * 1000;
  for (const pos of getRingCells(ring)) {
    if (!excluded.has(`${pos.r},${pos.c}`)) {
      board[pos.r][pos.c] = { kind: 'O', id: id++ };
    }
  }
}

describe('Stage 3 progression, Star Cores, and board insight helpers', () => {
  it('computes calculateLevelFromClears and getLevelProgress across lines, rings, and mixed clears', () => {
    expect(calculateLevelFromClears(0, 0)).toBe(1);
    expect(calculateLevelFromClears(5, 0)).toBe(1);
    expect(calculateLevelFromClears(6, 0)).toBe(2);
    expect(calculateLevelFromClears(0, 2)).toBe(2);
    expect(calculateLevelFromClears(3, 1)).toBe(2); // 3 + 3 = 6 pts
    expect(calculateLevelFromClears(23, 0)).toBe(4);
    expect(calculateLevelFromClears(24, 0)).toBe(5);
    expect(calculateLevelFromClears(0, 8)).toBe(5); // 24 pts
    expect(calculateLevelFromClears(0, 11)).toBe(6); // 33 pts
    expect(calculateLevelFromClears(33, 0)).toBe(6);
    expect(calculateLevelFromClears(42, 0)).toBe(7);

    expect(getLevelProgress(4, 0)).toEqual({
      level: 1,
      currentPoints: 4,
      requiredPoints: 6,
      ratio: 4 / 6,
    });
    expect(getLevelProgress(1, 2)).toEqual({
      level: 2,
      currentPoints: 1,
      requiredPoints: 6,
      ratio: 1 / 6,
    });
    expect(getLevelProgress(27, 0)).toEqual({
      level: 5,
      currentPoints: 3,
      requiredPoints: 9,
      ratio: 3 / 9,
    });
  });

  it('enforces monotonic level config curve and QUICK! window bounds', () => {
    const lv1 = getLevelConfig(1);
    const lv3 = getLevelConfig(3);
    const lv6 = getLevelConfig(6);
    const lv9 = getLevelConfig(9);
    const lv20 = getLevelConfig(20);

    expect(lv1).toEqual({ hoverMs: 3500, stepMs: 460, lubricantRatio: 0.25 });
    expect(lv3).toEqual({ hoverMs: 2600, stepMs: 340, lubricantRatio: 0.20 });
    expect(lv6).toEqual({ hoverMs: 1800, stepMs: 240, lubricantRatio: 0.15 });
    expect(lv9).toEqual({ hoverMs: 1200, stepMs: 180, lubricantRatio: 0.10 });
    expect(lv20).toEqual({ hoverMs: 1200, stepMs: 110, lubricantRatio: 0.10 });

    expect(getQuickWindowMs(3500)).toBe(500);
    expect(getQuickWindowMs(1800)).toBe(450);
    expect(getQuickWindowMs(1200)).toBe(300);
    expect(getQuickWindowMs(800)).toBe(300);
  });

  it('caps QUICK! streak bonus at +250, resets streak on slow manual launch, and tracks quickRate', () => {
    const engine = new GameEngine({
      difficulty: 'easy',
      scriptedPieces: Array(20).fill('M1') as PieceKind[],
    });
    engine.tick(INTRO_DURATION_MS);

    const dirs: Array<'N' | 'NE' | 'E' | 'SE' | 'S' | 'SW' | 'W' | 'NW'> = [
      'N',
      'NE',
      'E',
      'SE',
      'S',
      'SW',
      'W',
      'NW',
    ];

    const quickScores: number[] = [];
    for (let i = 0; i < 12; i++) {
      engine.setAimDirection(dirs[i % dirs.length]);
      engine.launchOrHardDrop();
      const ev = engine.drainEvents().find((e) => e.type === 'PIECE_LAUNCHED');
      if (ev && ev.type === 'PIECE_LAUNCHED') {
        quickScores.push(ev.scoreDelta);
      }
      engine.launchOrHardDrop(); // lock
    }

    // Streak 1 = 100, Streak 11 = 100 + 250 = 350, Streak 12 = still 350 (capped)
    expect(quickScores[0]).toBe(100);
    expect(quickScores[10]).toBe(350);
    expect(quickScores[11]).toBe(350);
    expect(engine.getState().quickStreak).toBe(12);

    // Slow manual launch (> 500ms) resets quickStreak to 0
    engine.tick(600);
    engine.setAimDirection('N');
    engine.launchOrHardDrop();
    const slowEv = engine.drainEvents().find((e) => e.type === 'PIECE_LAUNCHED');
    expect(slowEv).toMatchObject({ isQuick: false, blind: false, quickStreak: 0, scoreDelta: 0 });
    expect(engine.getState().quickStreak).toBe(0);
    expect(engine.getState().quickRate).toBeCloseTo(12 / 13, 5);
  });

  it('supports HOLD round-trip with Star Cores and tracks/resets consecutiveHolds', () => {
    const b = createEmptyBoard();
    fillRingExcept(b, 1, [[0, 7]]);
    fillRingExcept(b, 2, [[1, 7]]);
    fillRingExcept(b, 3, [
      [2, 7],
      [2, 8],
    ]);

    const engine = new GameEngine({
      difficulty: 'easy',
      initialBoard: b,
      scriptedPieces: ['L', 'M1', 'M1', 'M1', 'M1'],
    });
    engine.tick(INTRO_DURATION_MS + 600);
    engine.rotate(1);
    engine.setAimDirection('N');
    engine.launchOrHardDrop();
    engine.launchOrHardDrop(); // clears 3 rings -> 100% charge

    expect(engine.activateStarCore()).toBe(true);
    expect(engine.getState().activePiece?.kind).toBe('NOVA_BOMB');

    // Hold the NOVA_BOMB into hold slot
    expect(engine.hold()).toBe(true);
    expect(engine.getState().holdPiece).toBe('NOVA_BOMB');
    expect(engine.getState().consecutiveHolds).toBe(1);

    // Lock the swapped-in M1 without holding -> next turn resets? Let's check:
    // Turn 1 used hold, so locking Turn 1 keeps consecutiveHolds = 1;
    engine.setAimDirection('S');
    engine.launchOrHardDrop();
    engine.launchOrHardDrop();
    expect(engine.getState().consecutiveHolds).toBe(1);

    // Turn 2: hold again -> pulls NOVA_BOMB back out, consecutiveHolds = 2
    expect(engine.hold()).toBe(true);
    expect(engine.getState().activePiece?.kind).toBe('NOVA_BOMB');
    expect(engine.getState().consecutiveHolds).toBe(2);

    // Lock NOVA_BOMB via Hard Drop North -> +10 * 7 = 70 scoreDelta
    engine.drainEvents();
    engine.setAimDirection('N');
    engine.launchOrHardDrop();
    engine.launchOrHardDrop();
    const novaEv = engine.drainEvents().find((e) => e.type === 'NOVA_DETONATED');
    expect(novaEv).toMatchObject({ hardDropSteps: 7, scoreDelta: 70 });

    // Turn 3: lock WITHOUT holding -> consecutiveHolds resets to 0
    engine.setAimDirection('W');
    engine.launchOrHardDrop();
    engine.launchOrHardDrop();
    expect(engine.getState().consecutiveHolds).toBe(0);
  });

  it('allows Stardust Piercer mid-flight lateral nudge to snipe a buried hole and trigger a Line Clear', () => {
    const board = createEmptyBoard();
    // Fill row 13 except buried hole at (13, 9), and fill (12,9), (14,9), (15,9) around it
    for (let c = 0; c < 16; c++) {
      if (c !== 9) {
        board[13][c] = { kind: 'O', id: 1300 + c };
      }
    }
    board[12][9] = { kind: 'O', id: 2001 };
    board[14][9] = { kind: 'O', id: 2002 };
    board[15][9] = { kind: 'O', id: 2003 };

    const engine = new GameEngine({
      difficulty: 'hard',
      initialBoard: board,
      scriptedPieces: Array(20).fill('M1') as PieceKind[],
    });
    engine.tick(INTRO_DURATION_MS);

    // 13 QUICK shots of M1 to reach 100% charge cleanly away from row 13 / col 9
    const safeDirs: Array<'N' | 'NW' | 'NE' | 'W'> = ['N', 'NW', 'NE', 'W'];
    for (let i = 0; i < 13; i++) {
      engine.setAimDirection(safeDirs[i % safeDirs.length]);
      engine.launchOrHardDrop();
      engine.launchOrHardDrop();
    }
    expect(engine.getState().charge).toBe(100);

    // Activate STARDUST_PIERCER in HOVER, aim 'S' (spawns at (8,8)), launch, nudge 'E' to col 9, Hard Drop!
    expect(engine.activateStarCore()).toBe(true);
    engine.setAimDirection('S');
    engine.launchOrHardDrop();
    expect(engine.nudge('E')).toBe(true);
    expect(engine.getState().activePiece?.origin).toEqual({ r: 8, c: 9 });

    engine.drainEvents();
    engine.launchOrHardDrop();

    const lineEv = engine.drainEvents().find((e) => e.type === 'LINES_CLEARED');
    expect(lineEv).toMatchObject({
      type: 'LINES_CLEARED',
      rows: [13],
      lineCount: 1,
    });
  });

  it('emits DANGER_CHANGED true on Ring 6 occupation and false when Nova Bomb clears danger', () => {
    const board = createEmptyBoard();
    board[4][7] = { kind: 'O', id: 1 }; // backing right outside Ring 6 (5,7)

    const engine = new GameEngine({
      difficulty: 'easy',
      initialBoard: board,
      scriptedPieces: Array(20).fill('M1') as PieceKind[],
    });
    engine.tick(INTRO_DURATION_MS);

    // Shoot 13 quick M1s into safe directions first to build 100% charge
    const safeDirs: Array<'E' | 'W' | 'S' | 'SE' | 'SW' | 'NE' | 'NW'> = [
      'E',
      'W',
      'S',
      'SE',
      'SW',
      'NE',
      'NW',
    ];
    for (let i = 0; i < 13; i++) {
      engine.setAimDirection(safeDirs[i % safeDirs.length]);
      engine.launchOrHardDrop();
      engine.launchOrHardDrop();
    }
    expect(engine.getState().inDanger).toBe(false);
    expect(engine.getState().charge).toBe(100);
    engine.drainEvents();

    // Now drop M1 North -> stops at (5,7) [Ring 6!] -> triggers DANGER_CHANGED true
    engine.setAimDirection('N');
    engine.launchOrHardDrop();
    engine.launchOrHardDrop();

    expect(engine.getState().inDanger).toBe(true);
    expect(engine.drainEvents()).toContainEqual({ type: 'DANGER_CHANGED', inDanger: true });

    // Activate Nova Bomb & fire North -> hits (5,7), stops at (6,7), detonates 3x3 destroying (5,7)!
    expect(engine.activateStarCore()).toBe(true);
    engine.setAimDirection('N');
    engine.launchOrHardDrop();
    engine.launchOrHardDrop();

    expect(engine.getState().inDanger).toBe(false);
    expect(engine.getState().board[5][7]).toBeNull();
    expect(engine.drainEvents()).toContainEqual({ type: 'DANGER_CHANGED', inDanger: false });
  });

  it('accurately reports getBestRingProgress and findNearFullLineGaps', () => {
    const empty = createEmptyBoard();
    expect(getBestRingProgress(empty)).toBeNull();
    expect(findNearFullLineGaps(empty, 2)).toEqual([]);

    const board = createEmptyBoard();
    // Fill 18/20 of Ring 6 (0.90) and 40/60 of Ring 1 (0.67)
    fillRingExcept(board, 6, [
      [5, 7],
      [5, 8],
    ]);
    for (let c = 0; c < 15; c++) {
      board[15][c] = { kind: 'O', id: 500 + c }; // 1 gap on South row 15: (15,15)
    }
    for (let r = 0; r < 15; r++) {
      if (r !== 13 && r !== 14) {
        board[r][0] = { kind: 'O', id: 600 + r }; // 2 gaps on West col 0: (13,0), (14,0)
      }
    }

    const best = getBestRingProgress(board);
    expect(best).not.toBeNull();
    expect(best?.ring).toBe(6);
    expect(best?.filled).toBe(18);
    expect(best?.total).toBe(20);
    expect(best?.missing).toEqual([
      { r: 5, c: 7 },
      { r: 5, c: 8 },
    ]);

    const gaps = findNearFullLineGaps(board, 2);
    expect(gaps).toEqual(
      expect.arrayContaining([
        { r: 15, c: 15 },
        { r: 13, c: 0 },
        { r: 14, c: 0 },
      ]),
    );
    expect(gaps).toHaveLength(3);
  });
});
