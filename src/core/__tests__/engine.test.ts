import { describe, expect, it } from 'vitest';
import {
  createEmptyBoard,
  GameEngine,
  getLevelConfig,
  getRingCells,
  INTRO_DURATION_MS,
  LOCK_DELAY_MS,
} from '../index';
import type { BoardGrid, PieceKind, RingIndex } from '../types';

function createSeededRng(seed = 2026): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function fillRingExcept(board: BoardGrid, ring: RingIndex, exclude: [number, number][]): void {
  const excluded = new Set(exclude.map(([r, c]) => `${r},${c}`));
  let id = ring * 1000;
  for (const pos of getRingCells(ring)) {
    if (!excluded.has(`${pos.r},${pos.c}`)) {
      board[pos.r][pos.c] = { kind: 'O', id: id++ };
    }
  }
}

describe('GameEngine (16x16)', () => {
  it('transitions INTRO (900ms) -> HOVER and triggers blind random launch vs aimed launch on timeout', () => {
    const engine1 = new GameEngine({
      difficulty: 'easy',
      rng: () => 0.25, // index 2 -> 'E'
      scriptedPieces: ['T', 'O'],
    });
    expect(engine1.getState().phase).toBe('INTRO');
    expect(engine1.getState().activePiece).toBeNull();

    engine1.tick(INTRO_DURATION_MS);
    expect(engine1.getState().phase).toBe('HOVER');
    expect(engine1.getState().activePiece?.kind).toBe('T');

    expect(engine1.launchOrHardDrop()).toBe(false);
    expect(engine1.getState().phase).toBe('HOVER');

    const hoverMs = getLevelConfig(1).hoverMs;
    engine1.tick(hoverMs);
    const events1 = engine1.drainEvents();
    const launch1 = events1.find((e) => e.type === 'PIECE_LAUNCHED');
    expect(launch1).toMatchObject({
      type: 'PIECE_LAUNCHED',
      direction: 'E',
      blind: true,
      isQuick: false,
    });
    expect(engine1.getState().phase).toBe('FLIGHT');

    const engine2 = new GameEngine({
      difficulty: 'easy',
      rng: createSeededRng(),
      scriptedPieces: ['T', 'O'],
    });
    engine2.tick(INTRO_DURATION_MS);
    expect(engine2.setAimDirection('SW')).toBe(true);
    engine2.tick(hoverMs);
    const launch2 = engine2.drainEvents().find((e) => e.type === 'PIECE_LAUNCHED');
    expect(launch2).toMatchObject({
      type: 'PIECE_LAUNCHED',
      direction: 'SW',
      blind: false,
      isQuick: false,
    });
  });

  it('awards QUICK! bonus, streak escalation, +8% charge, and resets streak on blind shot', () => {
    const engine = new GameEngine({
      difficulty: 'easy',
      rng: () => 0,
      scriptedPieces: ['M1', 'M1', 'M1', 'M1', 'M1'],
    });
    engine.tick(INTRO_DURATION_MS);

    engine.tick(200);
    engine.setAimDirection('N');
    expect(engine.launchOrHardDrop()).toBe(true);
    let launched = engine.drainEvents().find((e) => e.type === 'PIECE_LAUNCHED');
    expect(launched).toMatchObject({
      isQuick: true,
      quickStreak: 1,
      scoreDelta: 100,
      chargeDelta: 8,
    });
    engine.launchOrHardDrop();

    engine.setAimDirection('E');
    engine.launchOrHardDrop();
    launched = engine.drainEvents().find((e) => e.type === 'PIECE_LAUNCHED');
    expect(launched).toMatchObject({
      isQuick: true,
      quickStreak: 2,
      scoreDelta: 125,
      chargeDelta: 8,
    });
    expect(engine.getState().charge).toBe(16);
    engine.launchOrHardDrop();

    engine.tick(getLevelConfig(1).hoverMs);
    launched = engine.drainEvents().find((e) => e.type === 'PIECE_LAUNCHED');
    expect(launched).toMatchObject({
      blind: true,
      isQuick: false,
      quickStreak: 0,
    });
  });

  it('enforces HOLD once per turn in HOVER, resets hover timer, and blocks HOLD in FLIGHT', () => {
    const engine = new GameEngine({
      difficulty: 'easy',
      scriptedPieces: ['T', 'L3', 'I', 'O'],
    });
    engine.tick(INTRO_DURATION_MS);
    engine.tick(1200);

    expect(engine.hold()).toBe(true);
    const state = engine.getState();
    expect(state.activePiece?.kind).toBe('L3');
    expect(state.holdPiece).toBe('T');
    expect(state.nextPiece).toBe('I');
    expect(state.hoverElapsedMs).toBe(0);
    expect(state.consecutiveHolds).toBe(1);

    expect(engine.hold()).toBe(false);

    engine.setAimDirection('N');
    engine.launchOrHardDrop();
    expect(engine.getState().phase).toBe('FLIGHT');
    expect(engine.hold()).toBe(false);
  });

  it('activates Star Core in HOVER (replaces active) vs FLIGHT (replaces NEXT) for Easy & Hard', () => {
    const tripleBoard = createEmptyBoard();
    fillRingExcept(tripleBoard, 1, [[0, 7]]);
    fillRingExcept(tripleBoard, 2, [[1, 7]]);
    fillRingExcept(tripleBoard, 3, [
      [2, 7],
      [2, 8],
    ]);
    // Block on Ring 4 corner (3,3) -> expands 3 steps to (0,0) when R1-R3 clear
    tripleBoard[3][3] = { kind: 'O', id: 777 };

    const easyCharged = new GameEngine({
      difficulty: 'easy',
      initialBoard: tripleBoard,
      scriptedPieces: ['L', 'T', 'I', 'O'],
    });
    easyCharged.tick(INTRO_DURATION_MS);
    easyCharged.rotate(1); // L state 1 -> occupies (0,7),(1,7),(2,7),(2,8) when fired North
    easyCharged.setAimDirection('N');
    easyCharged.launchOrHardDrop();
    easyCharged.launchOrHardDrop();
    expect(easyCharged.getState().charge).toBe(100);

    expect(easyCharged.activateStarCore()).toBe(true);
    expect(easyCharged.getState().charge).toBe(0);
    expect(easyCharged.getState().activePiece?.kind).toBe('NOVA_BOMB');
    expect(easyCharged.getState().board[0][0]).not.toBeNull();

    // Launch NOVA_BOMB NW -> detonates at (1,1) beside (0,0), destroying (0,0)
    easyCharged.setAimDirection('NW');
    easyCharged.launchOrHardDrop();
    easyCharged.launchOrHardDrop();
    expect(easyCharged.getState().board[0][0]).toBeNull();

    // Hard mode -> activateStarCore during FLIGHT replaces NEXT with STARDUST_PIERCER
    const hardBoard = createEmptyBoard();
    fillRingExcept(hardBoard, 1, [[0, 7]]);
    fillRingExcept(hardBoard, 2, [[1, 7]]);
    fillRingExcept(hardBoard, 3, [
      [2, 7],
      [2, 8],
    ]);
    const hardEngine = new GameEngine({
      difficulty: 'hard',
      initialBoard: hardBoard,
      scriptedPieces: ['L', 'T', 'I', 'O'],
    });
    hardEngine.tick(INTRO_DURATION_MS);
    hardEngine.rotate(1);
    hardEngine.setAimDirection('N');
    hardEngine.launchOrHardDrop();
    hardEngine.launchOrHardDrop();

    hardEngine.setAimDirection('S');
    hardEngine.launchOrHardDrop();
    expect(hardEngine.getState().phase).toBe('FLIGHT');
    expect(hardEngine.activateStarCore()).toBe(true);
    expect(hardEngine.getState().nextPiece).toBe('STARDUST_PIERCER');
  });

  it('Stardust Piercer mid-flight Hard Drop locks in current empty outer hole vs snaps to Ghost target when inside center or solid', () => {
    const board = createEmptyBoard();
    fillRingExcept(board, 1, [[0, 7]]);
    fillRingExcept(board, 2, [[1, 7]]);
    fillRingExcept(board, 3, [
      [2, 7],
      [2, 8],
    ]);

    const engine = new GameEngine({
      difficulty: 'hard',
      initialBoard: board,
      scriptedPieces: ['L', 'M1', 'M1', 'M1'],
    });
    engine.tick(INTRO_DURATION_MS);
    engine.rotate(1);
    engine.setAimDirection('N');
    engine.launchOrHardDrop();
    engine.launchOrHardDrop();
    expect(engine.getState().charge).toBe(100);

    // Hard Drop while still in Center -> snaps to Ghost (0,7)
    expect(engine.activateStarCore()).toBe(true);
    engine.setAimDirection('N');
    engine.launchOrHardDrop();
    engine.launchOrHardDrop();
    expect(engine.getState().board[0][7]?.kind).toBe('STARDUST_PIERCER');

    // Mid-flight Hard Drop at outer empty cell (2,7) while (0,7) is also open
    const b2 = createEmptyBoard();
    fillRingExcept(b2, 1, [[0, 7]]);
    fillRingExcept(b2, 2, [[1, 7]]);
    fillRingExcept(b2, 3, [
      [2, 7],
      [2, 8],
    ]);

    const eng2 = new GameEngine({
      difficulty: 'hard',
      initialBoard: b2,
      scriptedPieces: ['L', 'M1', 'M1'],
    });
    eng2.tick(INTRO_DURATION_MS);
    eng2.rotate(1);
    eng2.setAimDirection('N');
    eng2.launchOrHardDrop();
    eng2.launchOrHardDrop();
    eng2.activateStarCore();
    eng2.setAimDirection('N');
    eng2.launchOrHardDrop(); // FLIGHT at (7,7)

    // Step 5 times North: (7,7)->(6,7)->(5,7)->(4,7)->(3,7)->(2,7)
    const stepMs = getLevelConfig(eng2.getState().level).stepMs;
    eng2.tick(stepMs * 5);
    expect(eng2.getState().activePiece?.origin).toEqual({ r: 2, c: 7 });

    eng2.launchOrHardDrop();
    expect(eng2.getState().board[2][7]?.kind).toBe('STARDUST_PIERCER');
    expect(eng2.getState().board[0][7]).toBeNull();
  });

  it('computes Single (+20% outer), Double, Triple, Quad+AllClear scores and Ring Flow 1.0->2.5 multiplier', () => {
    // 1) Single Ring 1 (+20% outermost bonus) with leftover block on Ring 3
    const b1 = createEmptyBoard();
    fillRingExcept(b1, 1, [[0, 7]]);
    b1[2][2] = { kind: 'O', id: 999 };
    const e1 = new GameEngine({ difficulty: 'easy', initialBoard: b1, scriptedPieces: ['M1', 'M1'] });
    e1.tick(INTRO_DURATION_MS + 600);
    e1.setAimDirection('N');
    e1.launchOrHardDrop();
    e1.launchOrHardDrop();
    const clear1 = e1.drainEvents().find((e) => e.type === 'RINGS_CLEARED');
    expect(clear1).toMatchObject({
      rings: [1],
      isAllClear: false,
      scoreDelta: 1200,
      chargeDelta: 25,
      flowMultiplier: 1.0,
    });

    // 2) Double Ring (1 & 2) with leftover block on Ring 3
    const b2 = createEmptyBoard();
    fillRingExcept(b2, 1, [[0, 7]]);
    fillRingExcept(b2, 2, [[1, 7]]);
    b2[2][2] = { kind: 'O', id: 999 };
    const e2 = new GameEngine({ difficulty: 'easy', initialBoard: b2, scriptedPieces: ['D2', 'M1'] });
    e2.tick(INTRO_DURATION_MS + 600);
    e2.rotate(-1); // vertical left col -> (7,7),(8,7)
    e2.setAimDirection('N');
    e2.launchOrHardDrop();
    e2.launchOrHardDrop();
    const clear2 = e2.drainEvents().find((e) => e.type === 'RINGS_CLEARED');
    expect(clear2).toMatchObject({
      rings: [1, 2],
      isAllClear: false,
      scoreDelta: 2800,
      chargeDelta: 65,
      newLevel: 2,
      leveledUp: true,
    });

    // 3) Triple Ring (1, 2, 3) with leftover block on Ring 4 corner
    const b3 = createEmptyBoard();
    fillRingExcept(b3, 1, [[0, 7]]);
    fillRingExcept(b3, 2, [[1, 7]]);
    fillRingExcept(b3, 3, [
      [2, 7],
      [2, 8],
    ]);
    b3[3][3] = { kind: 'O', id: 999 };
    const e3 = new GameEngine({ difficulty: 'easy', initialBoard: b3, scriptedPieces: ['L', 'M1'] });
    e3.tick(INTRO_DURATION_MS + 600);
    e3.rotate(1);
    e3.setAimDirection('N');
    e3.launchOrHardDrop();
    e3.launchOrHardDrop();
    const clear3 = e3.drainEvents().find((e) => e.type === 'RINGS_CLEARED');
    expect(clear3).toMatchObject({
      rings: [1, 2, 3],
      isAllClear: false,
      scoreDelta: 6000,
      chargeDelta: 100,
    });
    expect(e3.getState().charge).toBe(100);

    // 4) Quad Burst + All Clear (Rings 1-4 cleared, Rings 5-6 empty)
    const b4 = createEmptyBoard();
    fillRingExcept(b4, 1, [[0, 8]]);
    fillRingExcept(b4, 2, [[1, 8]]);
    fillRingExcept(b4, 3, [[2, 8]]);
    fillRingExcept(b4, 4, [[3, 8]]);
    const e4 = new GameEngine({ difficulty: 'easy', initialBoard: b4, scriptedPieces: ['I', 'M1'] });
    e4.tick(INTRO_DURATION_MS + 600);
    e4.rotate(1); // I vertical at col 8
    e4.setAimDirection('N');
    e4.launchOrHardDrop();
    e4.launchOrHardDrop();
    const clear4 = e4.drainEvents().find((e) => e.type === 'RINGS_CLEARED');
    expect(clear4).toMatchObject({
      rings: [1, 2, 3, 4],
      isAllClear: true,
      scoreDelta: 22000,
      chargeDelta: 100,
    });
    expect(e4.getState().charge).toBe(100);

    // 5) Ring Flow escalation (1.0 -> 1.2 -> 1.5 -> 2.0 -> 2.5) clearing R6->R5->R4->R3->R2 inside-out
    const flowBoard = createEmptyBoard();
    fillRingExcept(flowBoard, 6, [[5, 7]]); // N -> (5,7), backed by (4,7)
    fillRingExcept(flowBoard, 5, [[7, 11]]); // E -> (7,11), backed by (7,12)
    fillRingExcept(flowBoard, 4, [[12, 8]]); // S -> (12,8), backed by (13,8)
    fillRingExcept(flowBoard, 3, [[7, 2]]); // W -> (7,2), backed by (7,1)
    fillRingExcept(flowBoard, 2, [[1, 7]]); // N (after R6..R3 cleared) -> (1,7), backed by (0,7)
    flowBoard[0][7] = { kind: 'O', id: 1001 }; // backing for (1,7) without filling R1

    const fe = new GameEngine({
      difficulty: 'easy',
      initialBoard: flowBoard,
      scriptedPieces: Array(10).fill('M1') as PieceKind[],
    });
    fe.tick(INTRO_DURATION_MS);

    const multipliers: number[] = [];
    const dropDir = (dir: 'N' | 'E' | 'S' | 'W' | 'NW') => {
      fe.setAimDirection(dir);
      fe.launchOrHardDrop();
      fe.launchOrHardDrop();
      const ev = fe.drainEvents().find((e) => e.type === 'RINGS_CLEARED');
      if (ev && ev.type === 'RINGS_CLEARED') {
        multipliers.push(ev.flowMultiplier);
      }
    };

    dropDir('N');
    dropDir('E');
    dropDir('S');
    dropDir('W');
    dropDir('N');

    expect(multipliers).toEqual([1.0, 1.2, 1.5, 2.0, 2.5]);
    expect(fe.getState().maxFlowCombo).toBe(4);

    // 6) Reset after >12 pieces without clear
    const resetBoard = createEmptyBoard();
    fillRingExcept(resetBoard, 6, [[5, 7]]); // Turn 1 'N' -> (5,7) clears R6 (flow 1.0)
    fillRingExcept(resetBoard, 4, [[7, 12]]); // Turn 2 'E' -> (7,12) clears R4 (flow 1.2)
    resetBoard[4][7] = { kind: 'O', id: 8801 }; // backing for (5,7)
    resetBoard[7][13] = { kind: 'O', id: 8802 }; // backing for (7,12)
    for (let c = 0; c < 16; c++) {
      if (c !== 8) {
        resetBoard[15][c] = { kind: 'O', id: 8900 + c }; // Turn 15 'S' -> (15,8) clears row 15
      }
    }

    const re = new GameEngine({
      difficulty: 'easy',
      initialBoard: resetBoard,
      scriptedPieces: Array(20).fill('M1') as PieceKind[],
    });
    re.tick(INTRO_DURATION_MS);

    re.setAimDirection('N');
    re.launchOrHardDrop();
    re.launchOrHardDrop(); // clears R6 -> flowCombo 0

    re.setAimDirection('E');
    re.launchOrHardDrop();
    re.launchOrHardDrop(); // clears R4 -> flowCombo 1 (1.2x)
    expect(re.getState().flowCombo).toBe(1);
    re.drainEvents();

    const safeDirs: Array<'W' | 'SE' | 'SW' | 'NE' | 'NW'> = ['W', 'SE', 'SW', 'NE', 'NW'];
    for (let i = 0; i < 12; i++) {
      re.setAimDirection(safeDirs[i % safeDirs.length]);
      re.launchOrHardDrop();
      re.launchOrHardDrop();
    }
    expect(re.getState().piecesSinceLastClear).toBe(12);

    re.drainEvents();
    re.setAimDirection('S');
    re.launchOrHardDrop();
    re.launchOrHardDrop();
    const lateClear = re.drainEvents().find((e) => e.type === 'LINES_CLEARED');
    expect(lateClear).toMatchObject({ flowCombo: 0, flowMultiplier: 1.0 });
  });

  it('triggers GAME_OVER on post-clear center intrusion, but saves on clutch ring clear pulling cell out', () => {
    // Clutch save: Ring 6 missing ONLY (5,7), backed by (4,7). D2 vertical lands at (5,7) + (6,7).
    // Clearing Ring 6 pulls (6,7) out to (5,7) -> NO Game Over!
    const clutchBoard = createEmptyBoard();
    fillRingExcept(clutchBoard, 6, [[5, 7]]);
    clutchBoard[4][7] = { kind: 'O', id: 901 };

    const clutchEngine = new GameEngine({
      difficulty: 'easy',
      initialBoard: clutchBoard,
      scriptedPieces: ['D2', 'M1', 'M1'],
    });
    clutchEngine.tick(INTRO_DURATION_MS);
    clutchEngine.rotate(-1); // vertical left col -> (7,7),(8,7)
    clutchEngine.setAimDirection('N');
    clutchEngine.launchOrHardDrop();
    clutchEngine.launchOrHardDrop();

    expect(clutchEngine.getState().phase).toBe('HOVER');
    expect(clutchEngine.getState().board[6][7]).toBeNull();
    expect(clutchEngine.getState().board[5][7]).not.toBeNull();

    // Post-clear Game Over: leave (5,7) AND (5,8) open so Ring 6 does NOT clear
    const fatalBoard = createEmptyBoard();
    fillRingExcept(fatalBoard, 6, [
      [5, 7],
      [5, 8],
    ]);
    fatalBoard[4][7] = { kind: 'O', id: 902 };

    const fatalEngine = new GameEngine({
      difficulty: 'easy',
      initialBoard: fatalBoard,
      scriptedPieces: ['D2', 'M1'],
    });
    fatalEngine.tick(INTRO_DURATION_MS);
    fatalEngine.rotate(-1);
    fatalEngine.setAimDirection('N');
    fatalEngine.launchOrHardDrop();
    fatalEngine.launchOrHardDrop();

    expect(fatalEngine.getState().phase).toBe('GAME_OVER');
    const gameOverEv = fatalEngine.drainEvents().find((e) => e.type === 'GAME_OVER');
    expect(gameOverEv).toBeDefined();

    // Natural LOCK_DELAY timeout: M1 spawns at (7,7), 7 steps to (0,7) + 1 blocked check = stepMs * 8
    const delayEngine = new GameEngine({
      difficulty: 'easy',
      scriptedPieces: ['M1', 'M1'],
    });
    delayEngine.tick(INTRO_DURATION_MS);
    delayEngine.setAimDirection('N');
    delayEngine.launchOrHardDrop();
    const stepMs = getLevelConfig(1).stepMs;
    delayEngine.tick(stepMs * 8);
    expect(delayEngine.getState().phase).toBe('LOCK_DELAY');
    delayEngine.tick(LOCK_DELAY_MS);
    expect(delayEngine.getState().board[0][7]?.kind).toBe('M1');
    expect(delayEngine.getState().phase).toBe('HOVER');
  });

  it('clears single outer lines, cross-clears, feeds Ring Flow & leveling, and rescues center intrusions', () => {
    // 1) Single bottom row (r=15) clear + collapse from r=14 + leftover at r=10
    const bLine = createEmptyBoard();
    for (let c = 0; c < 16; c++) {
      if (c !== 8) {
        bLine[15][c] = { kind: 'O', id: 100 + c };
      }
    }
    bLine[14][3] = { kind: 'T', id: 201 }; // collapses to (15,3)
    const eLine = new GameEngine({
      difficulty: 'easy',
      initialBoard: bLine,
      scriptedPieces: ['M1', 'M1', 'M1'],
    });
    eLine.tick(INTRO_DURATION_MS + 600);
    eLine.setAimDirection('S');
    eLine.launchOrHardDrop();
    eLine.launchOrHardDrop();

    const lineEv = eLine.drainEvents().find((e) => e.type === 'LINES_CLEARED');
    expect(lineEv).toMatchObject({
      type: 'LINES_CLEARED',
      rows: [15],
      cols: [],
      lineCount: 1,
      isCrossClear: false,
      isAllClear: false,
      scoreDelta: 200,
      chargeDelta: 10,
      flowMultiplier: 1.0,
    });
    expect(eLine.getState().linesCleared).toBe(1);
    expect(eLine.getState().board[15][3]?.id).toBe(201);

    // 2) Simultaneous Cross Clear (row 15 + col 15) when M1 lands at corner (15,15)
    const bCross = createEmptyBoard();
    for (let i = 0; i < 15; i++) {
      bCross[15][i] = { kind: 'O', id: 300 + i };
      bCross[i][15] = { kind: 'O', id: 400 + i };
    }
    bCross[14][5] = { kind: 'L', id: 501 }; // collapses South -> (15,5)
    bCross[5][14] = { kind: 'L', id: 502 }; // collapses East -> (5,15)
    const eCross = new GameEngine({
      difficulty: 'easy',
      initialBoard: bCross,
      scriptedPieces: ['M1', 'M1', 'M1'],
    });
    eCross.tick(INTRO_DURATION_MS + 600);
    eCross.setAimDirection('SE');
    eCross.launchOrHardDrop();
    eCross.launchOrHardDrop();

    const crossEv = eCross.drainEvents().find((e) => e.type === 'LINES_CLEARED');
    expect(crossEv).toMatchObject({
      type: 'LINES_CLEARED',
      rows: [15],
      cols: [15],
      lineCount: 2,
      isCrossClear: true,
      scoreDelta: 500,
      chargeDelta: 25,
    });
    expect(eCross.getState().board[15][5]?.id).toBe(501);
    expect(eCross.getState().board[5][15]?.id).toBe(502);

    // 3) Line clears advance Ring Flow (1.0 -> 1.2) and level up at 6 lines
    const bLevel = createEmptyBoard();
    for (let r = 10; r <= 15; r++) {
      for (let c = 0; c < 16; c++) {
        if (c !== 8) {
          bLevel[r][c] = { kind: 'O', id: r * 100 + c };
        }
      }
    }
    const eLevel = new GameEngine({
      difficulty: 'easy',
      initialBoard: bLevel,
      scriptedPieces: Array(10).fill('M1') as PieceKind[],
    });
    eLevel.tick(INTRO_DURATION_MS + 600);
    for (let i = 0; i < 6; i++) {
      eLevel.setAimDirection('S');
      eLevel.launchOrHardDrop();
      eLevel.launchOrHardDrop();
    }
    expect(eLevel.getState().linesCleared).toBe(6);
    expect(eLevel.getState().level).toBe(2);
    const levelClears = eLevel
      .drainEvents()
      .filter((e) => e.type === 'LINES_CLEARED');
    expect(levelClears[0]).toMatchObject({ flowMultiplier: 1.0 });
    expect(levelClears[1]).toMatchObject({ flowMultiplier: 1.2 });

    // 4) Clutch center rescue via South row 10 clear pulls protruding (9,8) out to (10,8)
    const bClutch = createEmptyBoard();
    for (let c = 0; c < 16; c++) {
      if (c !== 8) {
        bClutch[10][c] = { kind: 'O', id: 700 + c };
      }
    }
    bClutch[11][8] = { kind: 'O', id: 799 }; // stops D2 at (10,8) and (9,8) [in center!]
    const eClutch = new GameEngine({
      difficulty: 'easy',
      initialBoard: bClutch,
      scriptedPieces: ['D2', 'M1', 'M1'],
    });
    eClutch.tick(INTRO_DURATION_MS);
    eClutch.rotate(-1); // vertical left col -> (7,7),(8,7)
    eClutch.setAimDirection('S');
    eClutch.launchOrHardDrop();
    eClutch.nudge('E'); // align col 8
    eClutch.launchOrHardDrop(); // lands at (9,8),(10,8) -> clears r=10 -> pulls (9,8) out to (10,8)

    expect(eClutch.getState().phase).toBe('HOVER');
    expect(eClutch.getState().board[9][8]).toBeNull();
    expect(eClutch.getState().board[10][8]).not.toBeNull();
  });
});
