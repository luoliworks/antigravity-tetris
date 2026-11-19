import Phaser from 'phaser';
import { GameEngine, getPieceCells } from '../core';
import type { Difficulty, GameEvent, GridPos } from '../core';
import { t, toggleLanguage } from '../i18n/i18n';
import { InputManager } from '../input/InputManager';
import { BoardRenderer } from '../render/BoardRenderer';
import { HudRenderer } from '../render/HudRenderer';
import { appStorage } from '../storage/storage';
import { GameOverOverlay } from '../ui/GameOverOverlay';
import { ControlsModal } from '../ui/Modals';
import { PauseOverlay } from '../ui/PauseOverlay';

const RESUME_COUNTDOWN_MS = 600;
const GAME_OVER_OVERLOAD_MS = 800;

export interface GameSceneInitData {
  difficulty?: Difficulty;
}

export class GameScene extends Phaser.Scene {
  private difficulty: Difficulty = 'easy';
  private engine!: GameEngine;
  private boardRenderer!: BoardRenderer;
  private hudRenderer!: HudRenderer;
  private inputManager!: InputManager;

  private pauseOverlay!: PauseOverlay;
  private gameOverOverlay!: GameOverOverlay;
  private controlsModal!: ControlsModal;

  private currentFlightIsQuick = false;
  private lastQuickTrailCells: GridPos[] = [];

  private paused = false;
  private resumeCountdownMs = 0;
  private gameOverOverloadMs = 0;
  private gameOverModalShown = false;

  private unsubPrefs: (() => void) | null = null;
  private handleOverlayKeyBound: ((e: KeyboardEvent) => void) | null = null;

  constructor() {
    super({ key: 'GameScene' });
  }

  init(data?: GameSceneInitData): void {
    this.difficulty = data?.difficulty === 'hard' ? 'hard' : 'easy';
  }

  create(): void {
    this.paused = false;
    this.resumeCountdownMs = 0;
    this.gameOverOverloadMs = 0;
    this.gameOverModalShown = false;
    this.currentFlightIsQuick = false;
    this.lastQuickTrailCells = [];

    this.engine = new GameEngine({ difficulty: this.difficulty });
    this.boardRenderer = new BoardRenderer(this);
    this.hudRenderer = new HudRenderer(this, {
      onToggleDifficulty: () => {
        if (this.paused || this.controlsModal.isOpen()) return;
        const next: Difficulty = this.difficulty === 'easy' ? 'hard' : 'easy';
        this.restartRun(next);
      },
      onToggleLanguage: () => {
        toggleLanguage();
      },
      onToggleMute: () => {
        const cur = appStorage.getPreferences().muted;
        appStorage.updatePreferences({ muted: !cur });
      },
      onPause: () => {
        this.togglePause();
      },
      onActivateStarCore: () => {
        if (this.isInputBlocked()) return;
        this.engine.activateStarCore();
      },
    });

    this.controlsModal = new ControlsModal(this, () => {
      this.controlsModal.close();
    });

    this.pauseOverlay = new PauseOverlay(this, {
      onResume: () => this.beginResume(),
      onRestart: () => {
        this.unpauseImmediate();
        this.restartRun();
      },
      onOpenControls: () => {
        this.controlsModal.open();
      },
      onBackToTitle: () => {
        this.scene.start('TitleScene');
      },
    });

    this.gameOverOverlay = new GameOverOverlay(this, {
      onPlayAgain: () => this.restartRun(),
      onSwitchDifficulty: () => {
        const next: Difficulty = this.difficulty === 'easy' ? 'hard' : 'easy';
        this.restartRun(next);
      },
      onBackToTitle: () => {
        this.scene.start('TitleScene');
      },
    });

    this.inputManager = new InputManager(this, {
      getPhase: () => this.engine.getState().phase,
      getFlightDirection: () => this.engine.getState().activePiece?.direction ?? null,
      isBlocked: () => this.isInputBlocked(),
      onTogglePause: () => this.handlePauseShortcut(),
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

    this.unsubPrefs = appStorage.subscribePreferences(() => {
      this.hudRenderer.refreshLocale();
      this.pauseOverlay.refreshLocale();
      this.gameOverOverlay.refreshLocale();
      this.controlsModal.refreshLocale();
    });

    this.handleOverlayKeyBound = (e: KeyboardEvent) => this.onOverlayKeyDown(e);
    window.addEventListener('keydown', this.handleOverlayKeyBound);

    this.events.once('shutdown', () => this.cleanup());
    this.events.once('destroy', () => this.cleanup());
  }

  update(_time: number, delta: number): void {
    const dtMs = Math.min(delta, 50);

    if (this.paused) {
      if (this.resumeCountdownMs > 0) {
        this.resumeCountdownMs -= dtMs;
        this.boardRenderer.renderResumeCountdown(this.resumeCountdownMs, RESUME_COUNTDOWN_MS);
        if (this.resumeCountdownMs <= 0) {
          this.unpauseImmediate();
        }
      }
      const state = this.engine.getState();
      this.boardRenderer.render(state, this.engine.getGhostPlacement(), 0);
      this.hudRenderer.render(state, dtMs);
      return;
    }

    const preState = this.engine.getState();
    if (preState.phase !== 'GAME_OVER') {
      this.inputManager.update(dtMs);
      this.engine.tick(dtMs);
      this.handleEvents(this.engine.drainEvents());
    }

    const state = this.engine.getState();
    const ghost = this.engine.getGhostPlacement();
    this.boardRenderer.render(state, ghost, dtMs);
    this.hudRenderer.render(state, dtMs);

    if (state.phase === 'GAME_OVER' && !this.gameOverModalShown) {
      this.gameOverOverloadMs += dtMs;
      this.boardRenderer.renderGameOverOverload(
        Math.min(1, this.gameOverOverloadMs / GAME_OVER_OVERLOAD_MS),
      );
      if (this.gameOverOverloadMs >= GAME_OVER_OVERLOAD_MS) {
        this.gameOverModalShown = true;
        const result = appStorage.recordHighScore(this.difficulty, {
          score: state.score,
          level: state.level,
          linesCleared: state.linesCleared,
          ringsCleared: state.ringsCleared,
          maxFlowCombo: state.maxFlowCombo,
          quickRate: state.quickRate,
        });
        this.gameOverOverlay.show(state, this.difficulty, result);
      }
    }
  }

  private isInputBlocked(): boolean {
    const phase = this.engine.getState().phase;
    return (
      this.paused ||
      this.resumeCountdownMs > 0 ||
      this.controlsModal.isOpen() ||
      this.gameOverOverlay.isOpen() ||
      phase === 'GAME_OVER'
    );
  }

  private handlePauseShortcut(): void {
    if (this.controlsModal.isOpen()) {
      this.controlsModal.close();
      return;
    }
    if (this.gameOverOverlay.isOpen()) {
      this.scene.start('TitleScene');
      return;
    }
    this.togglePause();
  }

  private togglePause(): void {
    if (this.engine.getState().phase === 'GAME_OVER') {
      return;
    }
    if (!this.paused) {
      this.paused = true;
      this.resumeCountdownMs = 0;
      this.inputManager.resetFlightHolds();
      this.boardRenderer.setPausedBlur(true);
      this.pauseOverlay.open();
      return;
    }
    if (this.resumeCountdownMs <= 0) {
      this.beginResume();
    }
  }

  private beginResume(): void {
    if (!this.paused) return;
    this.pauseOverlay.close();
    this.controlsModal.close();
    this.resumeCountdownMs = RESUME_COUNTDOWN_MS;
    this.boardRenderer.renderResumeCountdown(this.resumeCountdownMs, RESUME_COUNTDOWN_MS);
  }

  private unpauseImmediate(): void {
    this.paused = false;
    this.resumeCountdownMs = 0;
    this.pauseOverlay.close();
    this.controlsModal.close();
    this.boardRenderer.hideResumeCountdown();
    this.boardRenderer.setPausedBlur(false);
  }

  private onOverlayKeyDown(e: KeyboardEvent): void {
    if (e.repeat) return;

    if (this.paused && !this.controlsModal.isOpen() && e.code === 'KeyR') {
      e.preventDefault();
      this.unpauseImmediate();
      this.restartRun();
      return;
    }

    if (this.gameOverOverlay.isOpen()) {
      if (e.code === 'Enter' || e.code === 'NumpadEnter' || e.code === 'KeyR') {
        e.preventDefault();
        this.restartRun();
      } else if (e.code === 'Escape') {
        e.preventDefault();
        this.scene.start('TitleScene');
      }
    }
  }

  private restartRun(nextDifficulty?: Difficulty): void {
    const difficultyChanged = nextDifficulty !== undefined && nextDifficulty !== this.difficulty;
    if (nextDifficulty !== undefined) {
      this.difficulty = nextDifficulty;
    }
    this.unpauseImmediate();
    this.gameOverOverlay.hide();
    this.gameOverOverloadMs = 0;
    this.gameOverModalShown = false;

    this.engine = new GameEngine({ difficulty: this.difficulty });
    this.inputManager.resetFlightHolds();
    this.boardRenderer.clearAnimations();
    this.currentFlightIsQuick = false;
    this.lastQuickTrailCells = [];

    if (difficultyChanged) {
      this.boardRenderer.showCallout(
        this.difficulty === 'easy'
          ? `EASY · ${t('hud.coreEasy')}`
          : `HARD · ${t('hud.coreHard')}`,
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
              ev.quickStreak >= 2 ? `${t('callout.quick')} x${ev.quickStreak}` : t('callout.quick'),
              '#facc15',
            );
            this.hudRenderer.showScoreDelta(ev.scoreDelta, '#facc15');
          } else if (ev.blind) {
            this.boardRenderer.showCallout(t('callout.blind'), '#fb7185');
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
            this.boardRenderer.showCallout(t('callout.sniped'), '#f0abfc');
          }
          break;

        case 'RINGS_CLEARED': {
          const flashColor = ev.rings.length >= 2 ? 0xf0abfc : 0xe0f2fe;
          this.boardRenderer.triggerRingFlash(ev.clearedCells, flashColor);
          this.boardRenderer.triggerCellMovements(ev.movements);
          this.hudRenderer.showScoreDelta(ev.scoreDelta, '#f0abfc');

          if (ev.isAllClear) {
            this.boardRenderer.showCallout(t('callout.allClear'), '#fef08a');
          } else {
            const labelKeys: Record<number, string> = {
              1: t('callout.singleRing'),
              2: t('callout.doubleRing'),
              3: t('callout.tripleRing'),
              4: t('callout.quadBurst'),
              5: t('callout.megaResonance'),
              6: t('callout.cosmicClear'),
            };
            const label = labelKeys[ev.rings.length] ?? t('callout.ringClear');
            const color = ev.rings.length >= 2 ? '#f0abfc' : '#67e8f9';
            this.boardRenderer.showCallout(label, color);
          }
          if (ev.leveledUp) {
            this.boardRenderer.showCallout(`${t('callout.levelUp')} ${ev.newLevel}`, '#67e8f9', 54);
          }
          break;
        }

        case 'LINES_CLEARED': {
          const flashColor = ev.lineCount >= 2 ? 0xfacc15 : 0x38bdf8;
          this.boardRenderer.triggerRingFlash(ev.clearedCells, flashColor);
          this.boardRenderer.triggerCellMovements(ev.movements);
          this.hudRenderer.showScoreDelta(ev.scoreDelta, '#38bdf8');

          if (ev.isAllClear) {
            this.boardRenderer.showCallout(t('callout.allClear'), '#fef08a');
          } else if (ev.isCrossClear) {
            this.boardRenderer.showCallout(
              ev.lineCount === 2 ? t('callout.crossClear') : `${t('callout.crossClear')} x${ev.lineCount}`,
              '#facc15',
            );
          } else {
            const labels: Record<number, string> = {
              1: t('callout.lineClear'),
              2: t('callout.doubleLine'),
              3: t('callout.tripleLine'),
            };
            const label = labels[ev.lineCount] ?? t('callout.quadLine');
            const color = ev.lineCount >= 2 ? '#facc15' : '#38bdf8';
            this.boardRenderer.showCallout(label, color);
          }
          if (ev.leveledUp) {
            this.boardRenderer.showCallout(`${t('callout.levelUp')} ${ev.newLevel}`, '#67e8f9', 54);
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
          this.boardRenderer.showCallout(t('callout.novaBoom'), '#fda4af');
          break;

        case 'STAR_CORE_ACTIVATED':
          this.boardRenderer.showCallout(
            ev.coreKind === 'NOVA_BOMB' ? t('callout.novaReady') : t('callout.piercerReady'),
            '#f0abfc',
          );
          break;

        case 'GAME_OVER':
          this.inputManager.resetFlightHolds();
          this.gameOverOverloadMs = 0;
          this.gameOverModalShown = false;
          break;

        default:
          break;
      }
    }
  }

  private cleanup(): void {
    this.inputManager?.destroy();
    if (this.handleOverlayKeyBound) {
      window.removeEventListener('keydown', this.handleOverlayKeyBound);
      this.handleOverlayKeyBound = null;
    }
    if (this.unsubPrefs) {
      this.unsubPrefs();
      this.unsubPrefs = null;
    }
    this.controlsModal?.destroy();
    this.pauseOverlay?.destroy();
    this.gameOverOverlay?.destroy();
  }
}
