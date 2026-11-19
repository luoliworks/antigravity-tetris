import { PieceBag } from './bag';
import {
  canPlacePiece,
  clearRingsAndExpand,
  cloneBoard,
  createEmptyBoard,
  detonateNovaBomb,
  findFullRings,
  hasCenterIntrusion,
  isDangerState,
  isInCenter,
  placePieceCells,
} from './board';
import {
  ALL_CLEAR_BONUS_BASE,
  ALL_CLEAR_CHARGE,
  calculateLevel,
  DIRECTIONS_8,
  FLOW_MULTIPLIERS,
  FLOW_WINDOW_PIECES,
  getLevelConfig,
  getQuickWindowMs,
  HARD_DROP_SCORE_PER_STEP,
  INTRO_DURATION_MS,
  LOCK_DELAY_MS,
  OUTER_RING_BONUS_MULTIPLIER,
  QUICK_BASE_SCORE,
  QUICK_CHARGE,
  QUICK_STREAK_MAX_BONUS,
  QUICK_STREAK_STEP,
  RING_CLEAR_BASE_SCORES,
  RING_CLEAR_CHARGE,
  SOFT_DROP_MULTIPLIER,
} from './constants';
import { getSpawnOrigin, isSingleCell, tryRotatePiece } from './pieces';
import { computeGhostPlacement, nudgePiece, stepPiece } from './trajectory';
import type {
  ActivePiece,
  BoardGrid,
  CardinalDir,
  Difficulty,
  Direction8,
  GameEvent,
  GamePhase,
  GameStateSnapshot,
  GhostPlacement,
  PieceKind,
  StarCoreKind,
} from './types';

const MAX_LOCK_RESETS = 8;

export interface GameEngineOptions {
  difficulty: Difficulty;
  rng?: () => number;
  initialBoard?: BoardGrid;
  scriptedPieces?: PieceKind[];
}

export class GameEngine {
  private readonly difficulty: Difficulty;
  private readonly rng: () => number;
  private readonly bag: PieceBag;
  private readonly scriptedQueue: PieceKind[];
  private readonly nextCellIdRef = { current: 1 };
  private readonly listeners = new Set<(event: GameEvent) => void>();
  private eventQueue: GameEvent[] = [];

  private board: BoardGrid;
  private phase: GamePhase = 'INTRO';
  private activePiece: ActivePiece | null = null;
  private initialPieceKind: PieceKind;
  private nextPiece: PieceKind;
  private holdPiece: PieceKind | null = null;
  private holdUsedThisTurn = false;
  private consecutiveHolds = 0;

  private score = 0;
  private level = 1;
  private ringsCleared = 0;
  private charge = 0;
  private flowCombo = 0;
  private maxFlowCombo = 0;
  private piecesSinceLastClear = 0;

  private quickCount = 0;
  private quickStreak = 0;
  private totalLaunches = 0;
  private inDanger = false;

  private introElapsedMs = 0;
  private hoverElapsedMs = 0;
  private flightTimerMs = 0;
  private lockDelayElapsedMs = 0;
  private lockResetCount = 0;
  private softDropActive = false;

  constructor(options: GameEngineOptions) {
    this.difficulty = options.difficulty;
    this.rng = options.rng ?? Math.random;
    this.bag = new PieceBag(this.rng);
    this.scriptedQueue = options.scriptedPieces ? [...options.scriptedPieces] : [];
    this.board = options.initialBoard ? cloneBoard(options.initialBoard) : createEmptyBoard();
    this.inDanger = isDangerState(this.board);
    this.initialPieceKind = this.drawNextKind();
    this.nextPiece = this.drawNextKind();
  }

  private drawNextKind(): PieceKind {
    if (this.scriptedQueue.length > 0) {
      return this.scriptedQueue.shift()!;
    }
    return this.bag.draw(this.level);
  }

  subscribe(listener: (event: GameEvent) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  drainEvents(): GameEvent[] {
    const events = this.eventQueue;
    this.eventQueue = [];
    return events;
  }

  getState(): GameStateSnapshot {
    const cfg = getLevelConfig(this.level);
    return {
      phase: this.phase,
      difficulty: this.difficulty,
      board: cloneBoard(this.board),
      activePiece: this.activePiece
        ? {
            ...this.activePiece,
            origin: { ...this.activePiece.origin },
          }
        : null,
      nextPiece: this.nextPiece,
      holdPiece: this.holdPiece,
      holdUsedThisTurn: this.holdUsedThisTurn,
      consecutiveHolds: this.consecutiveHolds,
      score: this.score,
      level: this.level,
      ringsCleared: this.ringsCleared,
      charge: this.charge,
      flowCombo: this.flowCombo,
      maxFlowCombo: this.maxFlowCombo,
      piecesSinceLastClear: this.piecesSinceLastClear,
      quickCount: this.quickCount,
      quickStreak: this.quickStreak,
      totalLaunches: this.totalLaunches,
      quickRate: this.totalLaunches > 0 ? this.quickCount / this.totalLaunches : 0,
      inDanger: this.inDanger,
      introElapsedMs: this.introElapsedMs,
      introDurationMs: INTRO_DURATION_MS,
      hoverElapsedMs: this.hoverElapsedMs,
      hoverDurationMs: cfg.hoverMs,
      lockDelayElapsedMs: this.lockDelayElapsedMs,
      lockDelayDurationMs: LOCK_DELAY_MS,
      softDropActive: this.softDropActive,
    };
  }

  getGhostPlacement(): GhostPlacement | null {
    if (!this.activePiece || !this.activePiece.direction) {
      return null;
    }
    return computeGhostPlacement(this.board, this.activePiece);
  }

  tick(dtMs: number): void {
    if (dtMs <= 0) {
      return;
    }

    let remaining = dtMs;

    while (remaining > 0) {
      switch (this.phase) {
        case 'GAME_OVER':
          return;

        case 'INTRO': {
          const needed = INTRO_DURATION_MS - this.introElapsedMs;
          const step = Math.min(remaining, needed);
          this.introElapsedMs += step;
          remaining -= step;
          if (this.introElapsedMs >= INTRO_DURATION_MS) {
            this.emit({ type: 'INTRO_COMPLETE' });
            this.spawnPiece(this.initialPieceKind);
          }
          break;
        }

        case 'HOVER': {
          const hoverMs = getLevelConfig(this.level).hoverMs;
          const needed = Math.max(0, hoverMs - this.hoverElapsedMs);
          const step = Math.min(remaining, needed);
          this.hoverElapsedMs += step;
          remaining -= step;
          if (this.hoverElapsedMs >= hoverMs) {
            this.handleHoverTimeout();
          }
          break;
        }

        case 'FLIGHT': {
          const baseStepMs = getLevelConfig(this.level).stepMs;
          const effectiveStepMs = this.softDropActive
            ? baseStepMs / SOFT_DROP_MULTIPLIER
            : baseStepMs;
          const needed = Math.max(0, effectiveStepMs - this.flightTimerMs);
          if (remaining < needed) {
            this.flightTimerMs += remaining;
            remaining = 0;
            break;
          }
          remaining -= needed;
          this.flightTimerMs = 0;

          if (!this.activePiece) {
            remaining = 0;
            break;
          }

          const res = stepPiece(this.board, this.activePiece);
          if (res.moved) {
            this.activePiece = res.nextPiece;
            this.emit({
              type: 'PIECE_MOVED',
              piece: this.cloneActivePiece(this.activePiece),
              reason: this.softDropActive ? 'soft_drop' : 'flight',
            });
          } else {
            this.phase = 'LOCK_DELAY';
            this.lockDelayElapsedMs = 0;
          }
          break;
        }

        case 'LOCK_DELAY': {
          const needed = Math.max(0, LOCK_DELAY_MS - this.lockDelayElapsedMs);
          const step = Math.min(remaining, needed);
          this.lockDelayElapsedMs += step;
          remaining -= step;
          if (this.lockDelayElapsedMs >= LOCK_DELAY_MS) {
            this.resolveLock(0, 0);
          }
          break;
        }
      }
    }
  }

  setAimDirection(dir: Direction8): boolean {
    if (this.phase !== 'HOVER' || !this.activePiece) {
      return false;
    }
    if (this.activePiece.direction === dir) {
      return false;
    }

    this.activePiece.direction = dir;
    if (isSingleCell(this.activePiece.kind)) {
      this.activePiece.origin = getSpawnOrigin(this.activePiece.kind, dir);
    }
    this.emit({ type: 'AIM_CHANGED', direction: dir });
    return true;
  }

  rotate(delta: 1 | -1): boolean {
    if (
      !this.activePiece ||
      (this.phase !== 'HOVER' && this.phase !== 'FLIGHT' && this.phase !== 'LOCK_DELAY')
    ) {
      return false;
    }

    if (this.activePiece.kind === 'STARDUST_PIERCER') {
      return false;
    }

    const rotated = tryRotatePiece(this.board, this.activePiece, delta);
    if (!rotated) {
      return false;
    }

    const didChange =
      rotated.rotation !== this.activePiece.rotation ||
      rotated.origin.r !== this.activePiece.origin.r ||
      rotated.origin.c !== this.activePiece.origin.c;

    this.activePiece = rotated;
    if (didChange) {
      this.emit({
        type: 'PIECE_ROTATED',
        piece: this.cloneActivePiece(this.activePiece),
        delta,
      });
      this.refreshLockDelayAfterAdjustment();
    }
    return didChange;
  }

  launchOrHardDrop(): boolean {
    if (!this.activePiece) {
      return false;
    }

    if (this.phase === 'HOVER') {
      if (this.activePiece.direction === null) {
        return false;
      }
      this.launchActivePiece(false);
      return true;
    }

    if (this.phase === 'FLIGHT' || this.phase === 'LOCK_DELAY') {
      if (
        this.activePiece.kind === 'STARDUST_PIERCER' &&
        !isInCenter(this.activePiece.origin.r, this.activePiece.origin.c) &&
        this.board[this.activePiece.origin.r][this.activePiece.origin.c] === null
      ) {
        this.resolveLock(0, 0);
        return true;
      }

      const ghost = computeGhostPlacement(this.board, this.activePiece);
      const hardDropSteps = ghost.steps;
      const hardDropScore = HARD_DROP_SCORE_PER_STEP * hardDropSteps;
      this.score += hardDropScore;

      if (hardDropSteps > 0) {
        this.activePiece = {
          ...ghost.finalPiece,
          origin: { ...ghost.finalPiece.origin },
        };
        this.emit({
          type: 'PIECE_MOVED',
          piece: this.cloneActivePiece(this.activePiece),
          reason: 'hard_drop',
        });
      }

      this.resolveLock(hardDropSteps, hardDropScore, ghost.targetValid);
      return true;
    }

    return false;
  }

  nudge(dir: CardinalDir): boolean {
    if (
      !this.activePiece ||
      (this.phase !== 'FLIGHT' && this.phase !== 'LOCK_DELAY')
    ) {
      return false;
    }

    const nudged = nudgePiece(this.board, this.activePiece, dir);
    if (!nudged) {
      return false;
    }

    this.activePiece = nudged;
    this.emit({
      type: 'PIECE_MOVED',
      piece: this.cloneActivePiece(this.activePiece),
      reason: 'nudge',
    });
    this.refreshLockDelayAfterAdjustment();
    return true;
  }

  setSoftDrop(active: boolean): void {
    this.softDropActive = active;
  }

  hold(): boolean {
    if (this.phase !== 'HOVER' || !this.activePiece || this.holdUsedThisTurn) {
      return false;
    }

    const currentKind = this.activePiece.kind;
    let swappedInKind: PieceKind;

    if (this.holdPiece === null) {
      this.holdPiece = currentKind;
      swappedInKind = this.nextPiece;
      this.nextPiece = this.drawNextKind();
    } else {
      swappedInKind = this.holdPiece;
      this.holdPiece = currentKind;
    }

    this.holdUsedThisTurn = true;
    this.consecutiveHolds++;
    this.hoverElapsedMs = 0;

    this.activePiece = {
      kind: swappedInKind,
      origin: getSpawnOrigin(swappedInKind, null),
      rotation: 0,
      direction: null,
      slideBias: null,
    };

    this.emit({
      type: 'HOLD_SWAPPED',
      heldPiece: this.holdPiece,
      activePiece: this.cloneActivePiece(this.activePiece),
      nextPiece: this.nextPiece,
      consecutiveHolds: this.consecutiveHolds,
    });

    return true;
  }

  activateStarCore(): boolean {
    if (
      this.charge < 100 ||
      (this.phase !== 'HOVER' && this.phase !== 'FLIGHT' && this.phase !== 'LOCK_DELAY')
    ) {
      return false;
    }

    const coreKind: StarCoreKind =
      this.difficulty === 'easy' ? 'NOVA_BOMB' : 'STARDUST_PIERCER';
    this.charge = 0;

    if (this.phase === 'HOVER' && this.activePiece) {
      const dir = this.activePiece.direction;
      this.activePiece = {
        kind: coreKind,
        origin: getSpawnOrigin(coreKind, dir),
        rotation: 0,
        direction: dir,
        slideBias: null,
      };
      this.hoverElapsedMs = 0;
      this.emit({
        type: 'STAR_CORE_ACTIVATED',
        coreKind,
        target: 'active',
      });
      return true;
    }

    this.nextPiece = coreKind;
    this.emit({
      type: 'STAR_CORE_ACTIVATED',
      coreKind,
      target: 'next',
    });
    return true;
  }

  private handleHoverTimeout(): void {
    if (!this.activePiece) {
      return;
    }
    let blind = false;
    if (this.activePiece.direction === null) {
      const idx = Math.floor(this.rng() * DIRECTIONS_8.length);
      const randomDir = DIRECTIONS_8[idx];
      this.activePiece.direction = randomDir;
      if (isSingleCell(this.activePiece.kind)) {
        this.activePiece.origin = getSpawnOrigin(this.activePiece.kind, randomDir);
      }
      blind = true;
    }
    this.launchActivePiece(blind);
  }

  private launchActivePiece(blind: boolean): void {
    if (!this.activePiece || !this.activePiece.direction) {
      return;
    }

    const hoverMs = getLevelConfig(this.level).hoverMs;
    const quickWindowMs = getQuickWindowMs(hoverMs);
    const isQuick = !blind && this.hoverElapsedMs <= quickWindowMs;

    let scoreDelta = 0;
    let chargeDelta = 0;

    if (isQuick) {
      this.quickStreak++;
      this.quickCount++;
      scoreDelta =
        QUICK_BASE_SCORE * this.level +
        Math.min(QUICK_STREAK_MAX_BONUS, (this.quickStreak - 1) * QUICK_STREAK_STEP);
      const prevCharge = this.charge;
      this.charge = Math.min(100, this.charge + QUICK_CHARGE);
      chargeDelta = this.charge - prevCharge;
      this.score += scoreDelta;
    } else {
      this.quickStreak = 0;
    }

    this.totalLaunches++;
    this.phase = 'FLIGHT';
    this.flightTimerMs = 0;
    this.lockDelayElapsedMs = 0;
    this.lockResetCount = 0;

    this.emit({
      type: 'PIECE_LAUNCHED',
      piece: this.cloneActivePiece(this.activePiece),
      direction: this.activePiece.direction,
      blind,
      isQuick,
      quickStreak: this.quickStreak,
      scoreDelta,
      chargeDelta,
    });
  }

  private refreshLockDelayAfterAdjustment(): void {
    if (this.phase !== 'LOCK_DELAY' || !this.activePiece) {
      return;
    }
    const nextCheck = stepPiece(this.board, this.activePiece);
    if (nextCheck.moved) {
      this.phase = 'FLIGHT';
      this.flightTimerMs = 0;
      this.lockDelayElapsedMs = 0;
      return;
    }
    if (this.lockResetCount < MAX_LOCK_RESETS) {
      this.lockDelayElapsedMs = 0;
      this.lockResetCount++;
    }
  }

  private resolveLock(
    hardDropSteps: number,
    hardDropScore: number,
    canPlaceResolvedTarget = true,
  ): void {
    if (!this.activePiece) {
      return;
    }

    const lockingPiece = this.activePiece;
    this.activePiece = null;
    this.softDropActive = false;

    if (!this.holdUsedThisTurn) {
      this.consecutiveHolds = 0;
    }

    if (lockingPiece.kind === 'NOVA_BOMB') {
      const { nextBoard, destroyed } = detonateNovaBomb(this.board, lockingPiece.origin);
      this.board = nextBoard;
      this.emit({
        type: 'NOVA_DETONATED',
        center: { ...lockingPiece.origin },
        destroyed,
        hardDropSteps,
        scoreDelta: hardDropScore,
      });
    } else {
      const canPlace =
        canPlaceResolvedTarget &&
        canPlacePiece(this.board, lockingPiece.kind, lockingPiece.rotation, lockingPiece.origin);

      if (canPlace) {
        const { nextBoard, placed } = placePieceCells(
          this.board,
          lockingPiece,
          this.nextCellIdRef,
        );
        this.board = nextBoard;
        this.piecesSinceLastClear++;
        this.emit({
          type: 'PIECE_LOCKED',
          kind: lockingPiece.kind,
          placed,
          hardDropSteps,
          scoreDelta: hardDropScore,
        });
      }
    }

    const fullRings = findFullRings(this.board);
    if (fullRings.length > 0) {
      const clearResult = clearRingsAndExpand(this.board, fullRings);
      this.board = clearResult.nextBoard;

      const withinWindow =
        this.ringsCleared > 0 && this.piecesSinceLastClear <= FLOW_WINDOW_PIECES;
      this.flowCombo = withinWindow ? Math.min(FLOW_MULTIPLIERS.length - 1, this.flowCombo + 1) : 0;
      if (this.flowCombo > this.maxFlowCombo) {
        this.maxFlowCombo = this.flowCombo;
      }
      this.piecesSinceLastClear = 0;

      const scoringLevel = this.level;
      const count = fullRings.length as 1 | 2 | 3 | 4;
      let ringBase = RING_CLEAR_BASE_SCORES[count] * scoringLevel;
      if (count === 1 && fullRings[0] === 1) {
        ringBase = Math.round(ringBase * OUTER_RING_BONUS_MULTIPLIER);
      }
      const allClearBonus = clearResult.isAllClear ? ALL_CLEAR_BONUS_BASE * scoringLevel : 0;
      const flowMultiplier = FLOW_MULTIPLIERS[this.flowCombo];
      const scoreDelta = Math.round((ringBase + allClearBonus) * flowMultiplier);
      this.score += scoreDelta;

      const rawCharge =
        RING_CLEAR_CHARGE[count] + (clearResult.isAllClear ? ALL_CLEAR_CHARGE : 0);
      const prevCharge = this.charge;
      this.charge = Math.min(100, this.charge + rawCharge);
      const chargeDelta = this.charge - prevCharge;

      this.ringsCleared += fullRings.length;
      const newLevel = calculateLevel(this.ringsCleared);
      const leveledUp = newLevel > this.level;
      this.level = newLevel;

      this.emit({
        type: 'RINGS_CLEARED',
        rings: fullRings,
        clearedCells: clearResult.clearedCells,
        movements: clearResult.movements,
        isAllClear: clearResult.isAllClear,
        scoreDelta,
        chargeDelta,
        flowCombo: this.flowCombo,
        flowMultiplier,
        newLevel,
        leveledUp,
      });
    } else if (this.piecesSinceLastClear > FLOW_WINDOW_PIECES) {
      this.flowCombo = 0;
    }

    if (hasCenterIntrusion(this.board)) {
      this.triggerGameOver();
      return;
    }

    const nextDanger = isDangerState(this.board);
    if (nextDanger !== this.inDanger) {
      this.inDanger = nextDanger;
      this.emit({ type: 'DANGER_CHANGED', inDanger: nextDanger });
    }

    const upcoming = this.nextPiece;
    this.nextPiece = this.drawNextKind();
    this.spawnPiece(upcoming);
  }

  private spawnPiece(kind: PieceKind): void {
    const origin = getSpawnOrigin(kind, null);
    if (kind !== 'STARDUST_PIERCER' && !canPlacePiece(this.board, kind, 0, origin)) {
      this.triggerGameOver();
      return;
    }

    this.activePiece = {
      kind,
      origin,
      rotation: 0,
      direction: null,
      slideBias: null,
    };
    this.phase = 'HOVER';
    this.hoverElapsedMs = 0;
    this.flightTimerMs = 0;
    this.lockDelayElapsedMs = 0;
    this.lockResetCount = 0;
    this.holdUsedThisTurn = false;
    this.softDropActive = false;

    this.emit({
      type: 'PIECE_SPAWNED',
      piece: this.cloneActivePiece(this.activePiece),
      nextPiece: this.nextPiece,
    });
  }

  private triggerGameOver(): void {
    this.phase = 'GAME_OVER';
    this.activePiece = null;
    this.softDropActive = false;
    this.emit({
      type: 'GAME_OVER',
      score: this.score,
      level: this.level,
      ringsCleared: this.ringsCleared,
      maxFlowCombo: this.maxFlowCombo,
      quickRate: this.totalLaunches > 0 ? this.quickCount / this.totalLaunches : 0,
    });
  }

  private cloneActivePiece(piece: ActivePiece): ActivePiece {
    return {
      ...piece,
      origin: { ...piece.origin },
    };
  }

  private emit(event: GameEvent): void {
    this.eventQueue.push(event);
    for (const listener of this.listeners) {
      listener(event);
    }
  }
}
