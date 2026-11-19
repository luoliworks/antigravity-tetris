import Phaser from 'phaser';
import { audioEngine } from '../audio';
import { GameEngine, getPieceCells } from '../core';
import type { Difficulty, GameEvent, GridPos } from '../core';
import { getLanguage, t, toggleLanguage } from '../i18n/i18n';
import { InputManager } from '../input/InputManager';
import { AiChanController } from '../mascot';
import { BoardRenderer } from '../render/BoardRenderer';
import { HudRenderer } from '../render/HudRenderer';
import { MascotRenderer, preloadAiChanAssets } from '../render/MascotRenderer';
import { appStorage } from '../storage/storage';
import type { HighScoreRecordResult } from '../storage/storage';
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
  private mascotRenderer!: MascotRenderer;
  private aiChanController!: AiChanController;
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
  private pendingGameOverResult: HighScoreRecordResult | null = null;

  private hitstopRemainingMs = 0;
  private lastHoverUrgentStage = 0;
  private lastIntroCount = 0;
  private lastResumeCount = 0;
  private lastPiercerLaunchOrigin: GridPos = { r: 7, c: 7 };

  private unsubPrefs: (() => void) | null = null;
  private handleOverlayKeyBound: ((e: KeyboardEvent) => void) | null = null;

  constructor() {
    super({ key: 'GameScene' });
  }

  init(data?: GameSceneInitData): void {
    this.difficulty = data?.difficulty === 'hard' ? 'hard' : 'easy';
  }

  preload(): void {
    preloadAiChanAssets(this);
  }

  create(): void {
    this.paused = false;
    this.resumeCountdownMs = 0;
    this.gameOverOverloadMs = 0;
    this.gameOverModalShown = false;
    this.pendingGameOverResult = null;
    this.currentFlightIsQuick = false;
    this.lastQuickTrailCells = [];
    this.hitstopRemainingMs = 0;
    this.lastHoverUrgentStage = 0;
    this.lastIntroCount = 0;
    this.lastResumeCount = 0;
    this.lastPiercerLaunchOrigin = { r: 7, c: 7 };

    audioEngine.unlock();
    audioEngine.setPaused(false);
    audioEngine.setDanger(false);
    audioEngine.setBgmMode('gameplay');
    this.input.on('pointerdown', () => audioEngine.unlock());

    this.engine = new GameEngine({ difficulty: this.difficulty });
    this.boardRenderer = new BoardRenderer(this);
    this.aiChanController = new AiChanController({
      enabled: appStorage.getPreferences().aiCommentary,
    });
    this.mascotRenderer = new MascotRenderer(this, {
      onToggleAiCommentary: () => {
        const cur = appStorage.getPreferences().aiCommentary;
        appStorage.updatePreferences({ aiCommentary: !cur });
      },
      onOpenControls: () => {
        if (!this.gameOverOverlay.isOpen()) {
          this.controlsModal.open();
        }
      },
    });
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

    this.unsubPrefs = appStorage.subscribePreferences((prefs) => {
      this.aiChanController.setEnabled(prefs.aiCommentary);
      this.hudRenderer.refreshLocale();
      this.mascotRenderer.refreshLocale();
      this.pauseOverlay.refreshLocale();
      this.gameOverOverlay.refreshLocale();
      this.controlsModal.refreshLocale();
    });

    this.handleOverlayKeyBound = (e: KeyboardEvent) => this.onOverlayKeyDown(e);
    window.addEventListener('keydown', this.handleOverlayKeyBound);

    this.aiChanController.reset(false);
    this.aiChanController.trigger(this.difficulty === 'easy' ? 'start_easy' : 'start_hard');

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
          audioEngine.playCountdownTick(true);
        } else {
          const count = Math.min(
            3,
            Math.max(1, Math.ceil(this.resumeCountdownMs / (RESUME_COUNTDOWN_MS / 3))),
          );
          if (count !== this.lastResumeCount) {
            this.lastResumeCount = count;
            audioEngine.playCountdownTick(false);
          }
        }
      }
      const state = this.engine.getState();
      this.boardRenderer.render(state, this.engine.getGhostPlacement(), 0);
      this.hudRenderer.render(state, dtMs);
      this.mascotRenderer.render(this.aiChanController.getSnapshot(getLanguage()), 0);
      return;
    }

    const preState = this.engine.getState();
    if (this.hitstopRemainingMs > 0) {
      this.hitstopRemainingMs = Math.max(0, this.hitstopRemainingMs - dtMs);
    } else if (preState.phase !== 'GAME_OVER' && !this.controlsModal.isOpen()) {
      this.inputManager.update(dtMs);
      this.engine.tick(dtMs);
      this.handleEvents(this.engine.drainEvents());
    }

    const state = this.engine.getState();
    if (!this.controlsModal.isOpen()) {
      if (state.phase === 'INTRO') {
        const remaining = Math.max(0, state.introDurationMs - state.introElapsedMs);
        if (remaining > 0) {
          const count = Math.min(3, Math.max(1, Math.ceil(remaining / 300)));
          if (count !== this.lastIntroCount) {
            this.lastIntroCount = count;
            audioEngine.playCountdownTick(false);
          }
        }
      } else if (state.phase === 'HOVER') {
        const remainingMs = Math.max(0, state.hoverDurationMs - state.hoverElapsedMs);
        if (remainingMs <= 200 && this.lastHoverUrgentStage < 2) {
          this.lastHoverUrgentStage = 2;
          audioEngine.playHoverUrgent(1);
        } else if (remainingMs <= 400 && this.lastHoverUrgentStage < 1) {
          this.lastHoverUrgentStage = 1;
          audioEngine.playHoverUrgent(0);
        }
      }
    }

    this.aiChanController.tick(dtMs, {
      activePlay:
        state.phase !== 'INTRO' &&
        state.phase !== 'GAME_OVER' &&
        !this.controlsModal.isOpen(),
      piecesSinceLastClear: state.piecesSinceLastClear,
    });

    const ghost = this.engine.getGhostPlacement();
    this.boardRenderer.render(state, ghost, dtMs);
    this.hudRenderer.render(state, dtMs);

    const mascotSnap = this.aiChanController.getSnapshot(getLanguage());
    this.mascotRenderer.render(mascotSnap, dtMs);

    if (state.phase === 'GAME_OVER' && !this.gameOverModalShown) {
      this.gameOverOverloadMs += dtMs;
      this.boardRenderer.renderGameOverOverload(
        Math.min(1, this.gameOverOverloadMs / GAME_OVER_OVERLOAD_MS),
      );
      if (this.gameOverOverloadMs >= GAME_OVER_OVERLOAD_MS) {
        this.gameOverModalShown = true;
        const result =
          this.pendingGameOverResult ??
          appStorage.recordHighScore(this.difficulty, {
            score: state.score,
            level: state.level,
            linesCleared: state.linesCleared,
            ringsCleared: state.ringsCleared,
            maxFlowCombo: state.maxFlowCombo,
            quickRate: state.quickRate,
          });
        this.gameOverOverlay.show(state, this.difficulty, result);
        this.gameOverOverlay.updateMascot(mascotSnap);
      }
    } else if (this.gameOverOverlay.isOpen()) {
      this.gameOverOverlay.updateMascot(mascotSnap);
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
      this.lastResumeCount = 0;
      this.inputManager.resetFlightHolds();
      this.boardRenderer.setPausedBlur(true);
      audioEngine.setPaused(true);
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
    this.lastResumeCount = 0;
    this.resumeCountdownMs = RESUME_COUNTDOWN_MS;
    this.boardRenderer.renderResumeCountdown(this.resumeCountdownMs, RESUME_COUNTDOWN_MS);
  }

  private unpauseImmediate(): void {
    this.paused = false;
    this.resumeCountdownMs = 0;
    this.lastResumeCount = 0;
    this.pauseOverlay.close();
    this.controlsModal.close();
    this.boardRenderer.hideResumeCountdown();
    this.boardRenderer.setPausedBlur(false);
    audioEngine.setPaused(false);
  }

  private onOverlayKeyDown(e: KeyboardEvent): void {
    if (e.repeat) return;
    audioEngine.unlock();

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
    this.pendingGameOverResult = null;
    this.hitstopRemainingMs = 0;
    this.lastHoverUrgentStage = 0;
    this.lastIntroCount = 0;
    this.lastResumeCount = 0;
    this.lastPiercerLaunchOrigin = { r: 7, c: 7 };

    audioEngine.setPaused(false);
    audioEngine.setDanger(false);
    audioEngine.setBgmMode('gameplay');

    this.engine = new GameEngine({ difficulty: this.difficulty });
    this.inputManager.resetFlightHolds();
    this.boardRenderer.clearAnimations();
    this.currentFlightIsQuick = false;
    this.lastQuickTrailCells = [];

    this.aiChanController.reset(false);
    this.aiChanController.trigger(this.difficulty === 'easy' ? 'start_easy' : 'start_hard');

    if (difficultyChanged) {
      this.boardRenderer.showCallout(
        this.difficulty === 'easy'
          ? `EASY · ${t('hud.coreEasy')}`
          : `HARD · ${t('hud.coreHard')}`,
        this.difficulty === 'easy' ? '#6ee7b7' : '#fda4af',
      );
    }
  }

  private triggerHitstop(ms: number): void {
    if (ms > this.hitstopRemainingMs) {
      this.hitstopRemainingMs = ms;
    }
  }

  private handleEvents(events: GameEvent[]): void {
    let hasRingClear = false;
    let hasLineClear = false;
    let hasAllClear = false;
    let hasMultiClear = false;
    let hasNova = false;
    let hasPiercerLock = false;
    let enteredDanger = false;
    let hasBlindShot = false;
    let hasQuickStreak3 = false;
    let hasConsecutiveHold = false;
    let hasGameOver = false;

    for (const ev of events) {
      switch (ev.type) {
        case 'INTRO_COMPLETE':
          audioEngine.playCountdownTick(true);
          break;

        case 'PIECE_SPAWNED':
          this.inputManager.resetFlightHolds();
          this.currentFlightIsQuick = false;
          this.lastQuickTrailCells = [];
          this.lastHoverUrgentStage = 0;
          break;

        case 'AIM_CHANGED':
          audioEngine.playAimTick();
          break;

        case 'PIECE_ROTATED':
          audioEngine.playRotate();
          break;

        case 'PIECE_LAUNCHED':
          audioEngine.unlock();
          audioEngine.playLaunch(ev.isQuick, ev.quickStreak, ev.blind);
          this.inputManager.resetFlightHolds();
          this.currentFlightIsQuick = ev.isQuick;
          if (ev.piece.kind === 'STARDUST_PIERCER') {
            this.lastPiercerLaunchOrigin = { ...ev.piece.origin };
          }
          this.lastQuickTrailCells = getPieceCells(
            ev.piece.kind,
            ev.piece.rotation,
            ev.piece.origin,
          );
          if (ev.isQuick) {
            this.boardRenderer.triggerQuickRecoil();
            this.boardRenderer.showCallout(
              ev.quickStreak >= 2 ? `${t('callout.quick')} x${ev.quickStreak}` : t('callout.quick'),
              '#facc15',
            );
            this.hudRenderer.showScoreDelta(ev.scoreDelta, '#facc15');
            if (ev.quickStreak >= 3 && ev.quickStreak % 3 === 0) {
              hasQuickStreak3 = true;
            }
          } else if (ev.blind) {
            this.boardRenderer.showCallout(t('callout.blind'), '#fb7185');
            hasBlindShot = true;
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
          audioEngine.playLock(ev.hardDropSteps);
          this.boardRenderer.triggerLandingBounce(ev.placed, ev.kind);
          if (ev.scoreDelta > 0) {
            this.hudRenderer.showScoreDelta(ev.scoreDelta, '#94a3b8');
          }
          if (ev.kind === 'STARDUST_PIERCER' && ev.placed.length > 0) {
            audioEngine.playPiercerSnipe();
            this.triggerHitstop(80);
            this.boardRenderer.triggerShake(4, 180);
            this.boardRenderer.triggerRingFlash(ev.placed, 0xf0abfc);
            this.boardRenderer.triggerPiercerImpact(this.lastPiercerLaunchOrigin, ev.placed[0].pos);
            this.boardRenderer.showCallout(t('callout.sniped'), '#f0abfc');
            hasPiercerLock = true;
          }
          break;

        case 'HOLD_SWAPPED':
          this.lastHoverUrgentStage = 0;
          audioEngine.playHold();
          if (ev.consecutiveHolds >= 2) {
            hasConsecutiveHold = true;
          }
          break;

        case 'RINGS_CLEARED': {
          this.aiChanController.notifyClear();
          hasRingClear = true;
          if (ev.isAllClear) hasAllClear = true;
          if (ev.rings.length >= 2) hasMultiClear = true;

          const isMulti = ev.rings.length >= 2 || ev.isAllClear;
          this.boardRenderer.triggerPrismClear(ev.clearedCells, true, isMulti, ev.isAllClear);
          this.boardRenderer.triggerCellMovements(ev.movements);
          this.boardRenderer.triggerShake(isMulti ? 6 : 2, isMulti ? 240 : 120);
          this.triggerHitstop(isMulti ? 105 : 50);
          audioEngine.playClear(ev.rings.length, ev.flowCombo, true, isMulti, ev.isAllClear);
          if (ev.movements.length > 0) {
            audioEngine.playCollapseClick(120);
          }
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
            audioEngine.playLevelUp();
            this.boardRenderer.showCallout(`${t('callout.levelUp')} ${ev.newLevel}`, '#67e8f9', 54);
          }
          break;
        }

        case 'LINES_CLEARED': {
          this.aiChanController.notifyClear();
          hasLineClear = true;
          if (ev.isAllClear) hasAllClear = true;
          if (ev.isCrossClear || ev.lineCount >= 2) hasMultiClear = true;

          const isMulti = ev.isCrossClear || ev.lineCount >= 2 || ev.isAllClear;
          this.boardRenderer.triggerPrismClear(ev.clearedCells, false, isMulti, ev.isAllClear);
          this.boardRenderer.triggerCellMovements(ev.movements);
          this.boardRenderer.triggerShake(isMulti ? 6 : 2, isMulti ? 240 : 120);
          this.triggerHitstop(isMulti ? 100 : 50);
          audioEngine.playClear(ev.lineCount, ev.flowCombo, false, isMulti, ev.isAllClear);
          if (ev.movements.length > 0) {
            audioEngine.playCollapseClick(120);
          }
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
            audioEngine.playLevelUp();
            this.boardRenderer.showCallout(`${t('callout.levelUp')} ${ev.newLevel}`, '#67e8f9', 54);
          }
          break;
        }

        case 'NOVA_DETONATED':
          this.currentFlightIsQuick = false;
          this.lastQuickTrailCells = [];
          hasNova = true;
          audioEngine.playNovaBlast();
          this.triggerHitstop(80);
          this.boardRenderer.triggerShake(4, 180);
          this.boardRenderer.triggerNovaBlast(ev.center);
          if (ev.scoreDelta > 0) {
            this.hudRenderer.showScoreDelta(ev.scoreDelta, '#fda4af');
          }
          this.boardRenderer.showCallout(t('callout.novaBoom'), '#fda4af');
          break;

        case 'STAR_CORE_ACTIVATED':
          this.lastHoverUrgentStage = 0;
          audioEngine.playStarCoreActivate(ev.coreKind);
          this.boardRenderer.showCallout(
            ev.coreKind === 'NOVA_BOMB' ? t('callout.novaReady') : t('callout.piercerReady'),
            '#f0abfc',
          );
          break;

        case 'DANGER_CHANGED':
          audioEngine.setDanger(ev.inDanger);
          this.aiChanController.setDanger(ev.inDanger);
          if (ev.inDanger) {
            enteredDanger = true;
          }
          break;

        case 'GAME_OVER': {
          this.inputManager.resetFlightHolds();
          this.gameOverOverloadMs = 0;
          this.gameOverModalShown = false;
          hasGameOver = true;

          const snap = this.engine.getState();
          this.pendingGameOverResult = appStorage.recordHighScore(this.difficulty, {
            score: snap.score,
            level: snap.level,
            linesCleared: snap.linesCleared,
            ringsCleared: snap.ringsCleared,
            maxFlowCombo: snap.maxFlowCombo,
            quickRate: snap.quickRate,
          });
          audioEngine.setDanger(false);
          audioEngine.setBgmMode('gameover');
          audioEngine.playGameOver(this.pendingGameOverResult.isNewRecord);
          this.boardRenderer.triggerShake(5, 260);
          this.aiChanController.trigger(
            this.pendingGameOverResult.isNewRecord ? 'game_over_record' : 'game_over_normal',
          );
          break;
        }

        default:
          break;
      }
    }

    if (hasGameOver) {
      return;
    }

    if (hasAllClear) {
      this.aiChanController.trigger('all_clear');
    } else if (hasMultiClear || (hasRingClear && hasLineClear)) {
      this.aiChanController.trigger('multi_clear');
    } else if (hasNova) {
      this.aiChanController.trigger('nova_bomb');
    } else if (hasPiercerLock) {
      this.aiChanController.trigger('stardust_piercer');
    } else if (enteredDanger) {
      this.aiChanController.trigger('danger_enter');
    } else if (hasRingClear || hasLineClear) {
      this.aiChanController.trigger('single_clear');
    } else if (hasBlindShot) {
      this.aiChanController.trigger('blind_shot');
    } else if (hasQuickStreak3) {
      this.aiChanController.trigger('quick_streak_3');
    } else if (hasConsecutiveHold) {
      this.aiChanController.trigger('consecutive_hold');
    }
  }

  private cleanup(): void {
    audioEngine.setPaused(false);
    audioEngine.setDanger(false);
    this.inputManager?.destroy();
    this.mascotRenderer?.destroy();
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
