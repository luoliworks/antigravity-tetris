import Phaser from 'phaser';
import { GameEngine, getPieceCells } from '../core';
import type { Difficulty, GameEvent, GridPos } from '../core';
import { InputManager } from '../input/InputManager';
import { BoardRenderer } from '../render/BoardRenderer';
import { HudRenderer } from '../render/HudRenderer';

export class GameScene extends Phaser.Scene {
  private difficulty: Difficulty = 'easy';
  private engine!: GameEngine;
  private boardRenderer!: BoardRenderer;
  private hudRenderer!: HudRenderer;
  private inputManager!: InputManager;
  private currentFlightIsQuick = false;
  private lastQuickTrailCells: GridPos[] = [];

  constructor() {
    super({ key: 'GameScene' });
  }

  create(): void {
    this.engine = new GameEngine({ difficulty: this.difficulty });
    this.boardRenderer = new BoardRenderer(this);
    this.hudRenderer = new HudRenderer(this, {
      onToggleDifficulty: () => {
        const next: Difficulty = this.difficulty === 'easy' ? 'hard' : 'easy';
        this.restartRun(next);
      },
      onRestart: () => {
        this.restartRun();
      },
      onActivateStarCore: () => {
        this.engine.activateStarCore();
      },
    });

    this.inputManager = new InputManager(this, {
      getPhase: () => this.engine.getState().phase,
      getFlightDirection: () => this.engine.getState().activePiece?.direction ?? null,
      onAim: (dir) => {
        this.engine.setAimDirection(dir);
      },
      onRotate: (delta) => {
        this.engine.rotate(delta);
      },
      onLaunchOrHardDrop: () => {
        this.engine.launchOrHardDrop();
      },
      onNudge: (dir) => {
        this.engine.nudge(dir);
      },
      onSoftDropChange: (active) => {
        this.engine.setSoftDrop(active);
      },
      onHold: () => {
        this.engine.hold();
      },
      onActivateStarCore: () => {
        this.engine.activateStarCore();
      },
      onRestart: () => {
        this.restartRun();
      },
    });

    this.events.once('shutdown', () => this.inputManager.destroy());
    this.events.once('destroy', () => this.inputManager.destroy());
  }

  update(_time: number, delta: number): void {
    const dtMs = Math.min(delta, 50);
    this.inputManager.update(dtMs);
    this.engine.tick(dtMs);
    this.handleEvents(this.engine.drainEvents());

    const state = this.engine.getState();
    const ghost = this.engine.getGhostPlacement();
    this.boardRenderer.render(state, ghost, dtMs);
    this.hudRenderer.render(state, dtMs);
  }

  private restartRun(nextDifficulty?: Difficulty): void {
    const difficultyChanged = nextDifficulty !== undefined && nextDifficulty !== this.difficulty;
    if (nextDifficulty !== undefined) {
      this.difficulty = nextDifficulty;
    }
    this.engine = new GameEngine({ difficulty: this.difficulty });
    this.inputManager.resetFlightHolds();
    this.boardRenderer.clearAnimations();
    this.currentFlightIsQuick = false;
    this.lastQuickTrailCells = [];

    if (difficultyChanged) {
      this.boardRenderer.showCallout(
        this.difficulty === 'easy' ? 'EASY · NOVA BOMB' : 'HARD · PIERCER',
        this.difficulty === 'easy' ? '#6ee7b7' : '#fda4af',
      );
    }
  }

  private handleEvents(events: GameEvent[]): void {
    for (const ev of events) {
      switch (ev.type) {
        case 'PIECE_SPAWNED':
          this.inputManager.resetFlightHolds();
          this.currentFlightIsQuick = false;
          this.lastQuickTrailCells = [];
          break;

        case 'PIECE_LAUNCHED':
          this.inputManager.resetFlightHolds();
          this.currentFlightIsQuick = ev.isQuick;
          this.lastQuickTrailCells = getPieceCells(
            ev.piece.kind,
            ev.piece.rotation,
            ev.piece.origin,
          );
          if (ev.isQuick) {
            this.boardRenderer.showCallout(
              ev.quickStreak >= 2 ? `QUICK! x${ev.quickStreak}` : 'QUICK!',
              '#facc15',
            );
            this.hudRenderer.showScoreDelta(ev.scoreDelta, '#facc15');
          } else if (ev.blind) {
            this.boardRenderer.showCallout('BLIND SHOT!', '#fb7185');
          }
          break;

        case 'PIECE_MOVED':
          if (this.currentFlightIsQuick) {
            if (this.lastQuickTrailCells.length > 0) {
              this.boardRenderer.recordQuickTrail(this.lastQuickTrailCells);
            }
            this.lastQuickTrailCells = getPieceCells(
              ev.piece.kind,
              ev.piece.rotation,
              ev.piece.origin,
            );
          }
          break;

        case 'PIECE_LOCKED':
          this.currentFlightIsQuick = false;
          this.lastQuickTrailCells = [];
          if (ev.scoreDelta > 0) {
            this.hudRenderer.showScoreDelta(ev.scoreDelta, '#94a3b8');
          }
          if (ev.kind === 'STARDUST_PIERCER' && ev.placed.length > 0) {
            this.boardRenderer.triggerRingFlash(ev.placed, 0xf0abfc);
            this.boardRenderer.showCallout('SNIPED!', '#f0abfc');
          }
          break;

        case 'RINGS_CLEARED': {
          const flashColor = ev.rings.length >= 2 ? 0xf0abfc : 0xe0f2fe;
          this.boardRenderer.triggerRingFlash(ev.clearedCells, flashColor);
          this.boardRenderer.triggerCellMovements(ev.movements);
          this.hudRenderer.showScoreDelta(ev.scoreDelta, '#f0abfc');

          if (ev.isAllClear) {
            this.boardRenderer.showCallout('ALL CLEAR!', '#fef08a');
          } else {
            const labels: Record<number, string> = {
              1: 'SINGLE RING!',
              2: 'DOUBLE RING!',
              3: 'TRIPLE RING!',
              4: 'QUAD BURST!',
              5: 'MEGA RESONANCE!',
              6: 'COSMIC CLEAR!',
            };
            const label = labels[ev.rings.length] ?? 'RING CLEAR!';
            const color = ev.rings.length >= 2 ? '#f0abfc' : '#67e8f9';
            this.boardRenderer.showCallout(label, color);
          }
          if (ev.leveledUp) {
            this.boardRenderer.showCallout(`LEVEL UP! LV ${ev.newLevel}`, '#67e8f9', 54);
          }
          break;
        }

        case 'LINES_CLEARED': {
          const flashColor = ev.lineCount >= 2 ? 0xfacc15 : 0x38bdf8;
          this.boardRenderer.triggerRingFlash(ev.clearedCells, flashColor);
          this.boardRenderer.triggerCellMovements(ev.movements);
          this.hudRenderer.showScoreDelta(ev.scoreDelta, '#38bdf8');

          if (ev.isAllClear) {
            this.boardRenderer.showCallout('ALL CLEAR!', '#fef08a');
          } else if (ev.isCrossClear) {
            this.boardRenderer.showCallout(
              ev.lineCount === 2 ? 'CROSS CLEAR!' : `CROSS x${ev.lineCount}!`,
              '#facc15',
            );
          } else {
            const labels: Record<number, string> = {
              1: 'LINE CLEAR!',
              2: 'DOUBLE LINE!',
              3: 'TRIPLE LINE!',
            };
            const label = labels[ev.lineCount] ?? 'QUAD LINE!';
            const color = ev.lineCount >= 2 ? '#facc15' : '#38bdf8';
            this.boardRenderer.showCallout(label, color);
          }
          if (ev.leveledUp) {
            this.boardRenderer.showCallout(`LEVEL UP! LV ${ev.newLevel}`, '#67e8f9', 54);
          }
          break;
        }

        case 'NOVA_DETONATED':
          this.currentFlightIsQuick = false;
          this.lastQuickTrailCells = [];
          this.boardRenderer.triggerNovaBlast(ev.center);
          if (ev.scoreDelta > 0) {
            this.hudRenderer.showScoreDelta(ev.scoreDelta, '#fda4af');
          }
          this.boardRenderer.showCallout('NOVA BOOM!', '#fda4af');
          break;

        case 'STAR_CORE_ACTIVATED':
          this.boardRenderer.showCallout(
            ev.coreKind === 'NOVA_BOMB' ? 'NOVA BOMB READY!' : 'PIERCER READY!',
            '#f0abfc',
          );
          break;

        default:
          break;
      }
    }
  }
}
