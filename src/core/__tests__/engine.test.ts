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

describe('GameEngine', () => {
  it('transitions INTRO (900ms) -> HOVER and triggers blind random launch vs aimed launch on timeout', () => {
    // Blind launch when un-aimed at timeout
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

    // Pressing launch before aiming does nothing
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

    // Aimed launch on timeout preserves chosen direction and marks blind: false
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

    // Quick launch #1 at 200ms (<= 500ms)
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
    // Hard drop to lock
    engine.launchOrHardDrop();

    // Quick launch #2 immediately at 0ms
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

    // Blind timeout resets quickStreak to 0
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
    let state = engine.getState();
    expect(state.activePiece?.kind).toBe('L3');
    expect(state.holdPiece).toBe('T');
    expect(state.nextPiece).toBe('I');
    expect(state.hoverElapsedMs).toBe(0);
    expect(state.consecutiveHolds).toBe(1);

    // Second hold in same turn is rejected
    expect(engine.hold()).toBe(false);

    // Blocked in FLIGHT
    engine.setAimDirection('N');
    engine.launchOrHardDrop();
    expect(engine.getState().phase).toBe('FLIGHT');
    expect(engine.hold()).toBe(false);
  });

  it('activates Star Core in HOVER (replaces active) vs FLIGHT (replaces NEXT) for Easy & Hard', () => {
    // Easy -> NOVA_BOMB replaces active piece in HOVER, clears 3x3
    const board = createEmptyBoard();
    board[0][5] = { kind: 'O', id: 1 };
    board[0][6] = { kind: 'O', id: 2 };
    board[1][5] = { kind: 'O', id: 3 };
    const queue: PieceKind[] = ['M1', 'M1', 'M1', 'M1', 'M1', 'M1', 'M1'];

    const easy = new GameEngine({
      difficulty: 'easy',
      initialBoard: board,
      scriptedPieces: queue,
    });
    easy.tick(INTRO_DURATION_MS);

    // Build 100% charge by clearing Ring 1 four times or filling charge via 4 quick ring clears:
    // Actually 13 QUICK shots = 104 -> capped 100%
    // Simpler: clear 3 rings at once to hit 100% charge immediately!
    const tripleBoard = createEmptyBoard();
    fillRingExcept(tripleBoard, 1, [[0, 5]]);
    fillRingExcept(tripleBoard, 2, [[1, 5]]);
    fillRingExcept(tripleBoard, 3, [
      [2, 5],
      [2, 6],
    ]);
    tripleBoard[0][0] = { kind: 'O', id: 999 }; // ensure 3x3 target later
    // Overwrite (0,0) back? No, Ring 1 needs (0,0) filled anyway! Let's fill Ring 1..3 as needed and keep an isolated block at (0,10) on Ring 1? Wait: if Ring 1 clears, it's gone!
    // Put a block on Ring 4 corner (3,3) so after Rings 1-3 clear, (3,3) expands 3 steps to (0,0)!
    tripleBoard[3][3] = { kind: 'O', id: 777 };

    const easyCharged = new GameEngine({
      difficulty: 'easy',
      initialBoard: tripleBoard,
      scriptedPieces: ['L', 'T', 'I', 'O'],
    });
    easyCharged.tick(INTRO_DURATION_MS);
    easyCharged.rotate(1); // L state 1
    easyCharged.setAimDirection('N');
    easyCharged.launchOrHardDrop();
    easyCharged.launchOrHardDrop(); // locks and clears 3 rings -> 100% charge!
    expect(easyCharged.getState().charge).toBe(100);

    // Activate in HOVER -> replaces active 'T' with 'NOVA_BOMB'
    expect(easyCharged.activateStarCore()).toBe(true);
    expect(easyCharged.getState().charge).toBe(0);
    expect(easyCharged.getState().activePiece?.kind).toBe('NOVA_BOMB');
    expect(easyCharged.getState().board[0][0]).not.toBeNull(); // expanded from (3,3)

    // Launch NOVA_BOMB NW -> detonates at (1,1) right beside (0,0), destroying (0,0)!
    easyCharged.setAimDirection('NW');
    easyCharged.launchOrHardDrop();
    easyCharged.launchOrHardDrop();
    expect(easyCharged.getState().board[0][0]).toBeNull();

    // Hard mode -> activateStarCore during FLIGHT replaces NEXT with STARDUST_PIERCER
    const hardBoard = createEmptyBoard();
    fillRingExcept(hardBoard, 1, [[0, 5]]);
    fillRingExcept(hardBoard, 2, [[1, 5]]);
    fillRingExcept(hardBoard, 3, [
      [2, 5],
      [2, 6],
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
    hardEngine.launchOrHardDrop(); // clears 3 rings -> 100% charge, spawns 'T', next is 'I'

    hardEngine.setAimDirection('S');
    hardEngine.launchOrHardDrop(); // now in FLIGHT with 'T'
    expect(hardEngine.getState().phase).toBe('FLIGHT');
    expect(hardEngine.activateStarCore()).toBe(true);
    expect(hardEngine.getState().nextPiece).toBe('STARDUST_PIERCER');
  });

  it('Stardust Piercer mid-flight Hard Drop locks in current empty outer hole vs snaps to Ghost target when inside center or solid', () => {
    const board = createEmptyBoard();
    // Create triple ring ready to charge, plus set up holes on col 5 afterwards?
    // Even simpler: pre-fill board with holes on col 6 after clear? Let's place obstacles on col 8 (East) on Ring 4 & 2, leaving holes at (5, 9) [Ring 3] and (5, 11) [Ring 1]
    fillRingExcept(board, 1, [[0, 5]]);
    fillRingExcept(board, 2, [[1, 5]]);
    fillRingExcept(board, 3, [
      [2, 5],
      [2, 6],
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
    engine.launchOrHardDrop(); // All Clear & 100% charge!
    expect(engine.getState().charge).toBe(100);

    // Activate STARDUST_PIERCER in HOVER
    expect(engine.activateStarCore()).toBe(true);
    engine.setAimDirection('N'); // spawns at (5, 5)
    // Wait: let's test Hard Drop while STILL in center -> snaps to Ghost (0, 5)
    engine.launchOrHardDrop(); // launches into FLIGHT at (5,5)
    engine.launchOrHardDrop(); // Hard Drop while in center -> snaps to (0,5)
    expect(engine.getState().board[0][5]?.kind).toBe('STARDUST_PIERCER');

    // Now charge again and test mid-flight capture at an outer empty hole (2, 5) while (0, 5) is also open!
    const b2 = createEmptyBoard();
    fillRingExcept(b2, 1, [[0, 5]]);
    fillRingExcept(b2, 2, [[1, 5]]);
    fillRingExcept(b2, 3, [
      [2, 5],
      [2, 6],
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
    eng2.launchOrHardDrop(); // 100% charge, board cleared
    eng2.activateStarCore();
    eng2.setAimDirection('N');
    eng2.launchOrHardDrop(); // FLIGHT at (5,5)

    // Step 3 times: (5,5) -> (4,5) -> (3,5) -> (2,5) [outside center & empty]
    const stepMs = getLevelConfig(eng2.getState().level).stepMs;
    eng2.tick(stepMs * 3);
    expect(eng2.getState().activePiece?.origin).toEqual({ r: 2, c: 5 });

    // Mid-flight Hard Drop locks RIGHT AT (2,5) instead of snapping to (0,5)!
    eng2.launchOrHardDrop();
    expect(eng2.getState().board[2][5]?.kind).toBe('STARDUST_PIERCER');
    expect(eng2.getState().board[0][5]).toBeNull();
  });

  it('computes Single (+20% outer), Double, Triple, Quad+AllClear scores and Ring Flow 1.0->2.5 multiplier', () => {
    // 1) Single Ring 1 (+20% outermost bonus) with leftover block on Ring 3 (not All Clear)
    const b1 = createEmptyBoard();
    fillRingExcept(b1, 1, [[0, 5]]);
    b1[2][2] = { kind: 'O', id: 999 };
    const e1 = new GameEngine({ difficulty: 'easy', initialBoard: b1, scriptedPieces: ['M1', 'M1'] });
    e1.tick(INTRO_DURATION_MS);
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
    fillRingExcept(b2, 1, [[0, 5]]);
    fillRingExcept(b2, 2, [[1, 5]]);
    b2[2][2] = { kind: 'O', id: 999 };
    const e2 = new GameEngine({ difficulty: 'easy', initialBoard: b2, scriptedPieces: ['D2', 'M1'] });
    e2.tick(INTRO_DURATION_MS);
    e2.rotate(-1); // vertical left col
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

    // 2b) Triple Ring (1, 2, 3) with leftover block on Ring 4 corner
    const b3 = createEmptyBoard();
    fillRingExcept(b3, 1, [[0, 5]]);
    fillRingExcept(b3, 2, [[1, 5]]);
    fillRingExcept(b3, 3, [
      [2, 5],
      [2, 6],
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

    // 3) Quad Burst + All Clear
    const b4 = createEmptyBoard();
    fillRingExcept(b4, 1, [[0, 6]]);
    fillRingExcept(b4, 2, [[1, 6]]);
    fillRingExcept(b4, 3, [[2, 6]]);
    fillRingExcept(b4, 4, [[3, 6]]);
    const e4 = new GameEngine({ difficulty: 'easy', initialBoard: b4, scriptedPieces: ['I', 'M1'] });
    e4.tick(INTRO_DURATION_MS + 600);
    e4.rotate(1); // I vertical at col 6
    e4.setAimDirection('N');
    e4.launchOrHardDrop();
    e4.launchOrHardDrop();
    const clear4 = e4.drainEvents().find((e) => e.type === 'RINGS_CLEARED');
    expect(clear4).toMatchObject({
      rings: [1, 2, 3, 4],
      isAllClear: true,
      scoreDelta: 22000, // (12000 + 10000) * 1
      chargeDelta: 100,
    });
    expect(e4.getState().charge).toBe(100);

    // 4) Ring Flow escalation (1.0 -> 1.2 -> 1.5 -> 2.0 -> 2.5) and reset after >12 pieces
    const flowBoard = createEmptyBoard();
    fillRingExcept(flowBoard, 4, [[3, 5]]); // N -> (3,5), backed by (2,5)
    fillRingExcept(flowBoard, 3, [[5, 9]]); // E -> (5,9), backed by (5,10)
    fillRingExcept(flowBoard, 2, [[10, 6]]); // S -> (10,6), backed by (11,6)
    fillRingExcept(flowBoard, 1, [[5, 0]]); // W -> (5,0), outer wall

    const fe = new GameEngine({
      difficulty: 'easy',
      initialBoard: flowBoard,
      scriptedPieces: [
        'M1', // clears R4 (1.0)
        'M1', // clears R3 (1.2)
        'M1', // clears R2 (1.5)
        'M1', // clears R1 (2.0) -> board now empty!
        // Refill Ring 1 in 12 pieces (<= 12) using I + D2:
        'I',
        'I',
        'I',
        'I',
        'I',
        'I',
        'I',
        'I',
        'D2',
        'I',
        'I',
        'D2', // 12th piece clears R1 again -> 2.5!
        'M1',
      ],
    });
    fe.tick(INTRO_DURATION_MS);

    const drop = (
      dir: 'N' | 'S' | 'E' | 'W' | 'NW' | 'NE' | 'SW' | 'SE',
      rot = 0,
      nudges: Array<'N' | 'S' | 'E' | 'W'> = [],
    ) => {
      for (let i = 0; i < rot; i++) fe.rotate(1);
      for (let i = 0; i < -rot; i++) fe.rotate(-1);
      fe.setAimDirection(dir);
      fe.launchOrHardDrop();
      for (const n of nudges) fe.nudge(n);
      fe.launchOrHardDrop();
    };

    const multipliers: number[] = [];
    const collectClear = () => {
      const ev = fe.drainEvents().find((e) => e.type === 'RINGS_CLEARED');
      if (ev && ev.type === 'RINGS_CLEARED') {
        multipliers.push(ev.flowMultiplier);
      }
    };

    drop('N');
    collectClear(); // R4 -> 1.0
    drop('E');
    collectClear(); // R3 -> 1.2
    drop('S');
    collectClear(); // R2 -> 1.5
    drop('W');
    collectClear(); // R1 -> 2.0

    // Rebuild Ring 1 on empty board in 12 pieces
    drop('N'); // (0,4..7)
    drop('N', 0, ['W', 'W', 'W', 'W']); // (0,0..3)
    drop('N', 0, ['E', 'E', 'E', 'E']); // (0,8..11)
    drop('S'); // (11,4..7)
    drop('S', 0, ['W', 'W', 'W', 'W']); // (11,0..3)
    drop('S', 0, ['E', 'E', 'E', 'E']); // (11,8..11)
    drop('W', 1, ['N', 'N', 'N']); // (1..4, 0)
    drop('W', 1, ['S', 'S', 'S']); // (7..10, 0)
    drop('W', -1); // (5..6, 0)
    drop('E', 1, ['N', 'N', 'N']); // (1..4, 11)
    drop('E', 1, ['S', 'S', 'S']); // (7..10, 11)
    drop('E', -1); // (5..6, 11) -> clears R1!
    collectClear(); // R1 again -> 2.5!

    expect(multipliers).toEqual([1.0, 1.2, 1.5, 2.0, 2.5]);
    expect(fe.getState().maxFlowCombo).toBe(4);

    // Reset after >12 pieces without clear
    const resetBoard = createEmptyBoard();
    fillRingExcept(resetBoard, 4, [[3, 5]]); // Turn 1 'N' -> (3,5) clears R4 (flow 1.0)
    fillRingExcept(resetBoard, 3, [[5, 9]]); // Turn 2 'E' -> (5,9) clears R3 (flow 1.2)
    resetBoard[2][5] = { kind: 'O', id: 8801 }; // backing for (3,5)
    resetBoard[5][10] = { kind: 'O', id: 8802 }; // backing for (5,9)
    fillRingExcept(resetBoard, 1, [[11, 6]]); // Turn 15 'S' -> (11,6) clears R1 (flow reset -> 1.0)

    const re = new GameEngine({
      difficulty: 'easy',
      initialBoard: resetBoard,
      scriptedPieces: Array(20).fill('M1'),
    });
    re.tick(INTRO_DURATION_MS);

    re.setAimDirection('N');
    re.launchOrHardDrop();
    re.launchOrHardDrop(); // clears R4 -> flowCombo 0

    re.setAimDirection('E');
    re.launchOrHardDrop();
    re.launchOrHardDrop(); // clears R3 -> flowCombo 1 (1.2x)
    expect(re.getState().flowCombo).toBe(1);
    re.drainEvents();

    // Lock 12 pieces across 5 safe directions (W, SE, SW, NE, NW) without clearing R1
    const safeDirs: Array<'W' | 'SE' | 'SW' | 'NE' | 'NW'> = ['W', 'SE', 'SW', 'NE', 'NW'];
    for (let i = 0; i < 12; i++) {
      re.setAimDirection(safeDirs[i % safeDirs.length]);
      re.launchOrHardDrop();
      re.launchOrHardDrop();
    }
    expect(re.getState().piecesSinceLastClear).toBe(12);

    // 13th piece 'S' clears R1 -> exceeds 12-piece window -> flow resets to 1.0
    re.drainEvents();
    re.setAimDirection('S');
    re.launchOrHardDrop();
    re.launchOrHardDrop();
    const lateClear = re.drainEvents().find((e) => e.type === 'RINGS_CLEARED');
    expect(lateClear).toMatchObject({ flowCombo: 0, flowMultiplier: 1.0 });
  });

  it('triggers GAME_OVER on post-clear center intrusion, but saves on clutch ring clear pulling cell out', () => {
    // Clutch save: Ring 4 missing ONLY (3,5), and (2,5) blocked so vertical D2 lands at (3,5) + (4,5).
    // Clearing Ring 4 pulls (4,5) out to (3,5) -> NO Game Over!
    const clutchBoard = createEmptyBoard();
    fillRingExcept(clutchBoard, 4, [[3, 5]]);
    clutchBoard[2][5] = { kind: 'O', id: 901 };

    const clutchEngine = new GameEngine({
      difficulty: 'easy',
      initialBoard: clutchBoard,
      scriptedPieces: ['D2', 'M1', 'M1'],
    });
    clutchEngine.tick(INTRO_DURATION_MS);
    clutchEngine.rotate(-1); // vertical left col -> (5,5),(6,5)
    clutchEngine.setAimDirection('N');
    clutchEngine.launchOrHardDrop();
    clutchEngine.launchOrHardDrop(); // lands at (3,5) & (4,5) -> clears R4 -> pulls (4,5) to (3,5)

    expect(clutchEngine.getState().phase).toBe('HOVER');
    expect(clutchEngine.getState().board[4][5]).toBeNull();
    expect(clutchEngine.getState().board[3][5]).not.toBeNull();

    // Post-clear Game Over: leave (3,5) AND (3,6) open so Ring 4 does NOT clear, leaving (4,5) in Center
    const fatalBoard = createEmptyBoard();
    fillRingExcept(fatalBoard, 4, [
      [3, 5],
      [3, 6],
    ]);
    fatalBoard[2][5] = { kind: 'O', id: 902 };

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

    // Also verify LOCK_DELAY naturally locks after 250ms
    const delayEngine = new GameEngine({
      difficulty: 'easy',
      scriptedPieces: ['M1', 'M1'],
    });
    delayEngine.tick(INTRO_DURATION_MS);
    delayEngine.setAimDirection('N');
    delayEngine.launchOrHardDrop();
    const stepMs = getLevelConfig(1).stepMs;
    // M1 spawns at (5,5), needs 5 steps to (0,5), then 1 blocked attempt to enter LOCK_DELAY
    delayEngine.tick(stepMs * 6);
    expect(delayEngine.getState().phase).toBe('LOCK_DELAY');
    delayEngine.tick(LOCK_DELAY_MS);
    expect(delayEngine.getState().board[0][5]?.kind).toBe('M1');
    expect(delayEngine.getState().phase).toBe('HOVER');
  });
});
