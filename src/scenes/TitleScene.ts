import Phaser from 'phaser';
import type { Difficulty } from '../core';
import { t, toggleLanguage } from '../i18n/i18n';
import { CANVAS_HEIGHT, CANVAS_WIDTH } from '../render/layout';
import { appStorage } from '../storage/storage';
import { ControlsModal, HighScoresModal } from '../ui/Modals';
import { createGlassButton } from '../ui/uiHelpers';
import type { GlassButton } from '../ui/uiHelpers';

interface RingVisual {
  container: Phaser.GameObjects.Container;
  speed: number;
}

export class TitleScene extends Phaser.Scene {
  private selectedDifficulty: Difficulty = 'easy';
  private readonly rotatingRings: RingVisual[] = [];
  private starPhaseMs = 0;
  private starfieldGraphics!: Phaser.GameObjects.Graphics;

  private subtitleText!: Phaser.GameObjects.Text;
  private keyHintText!: Phaser.GameObjects.Text;
  private langBtn!: GlassButton;
  private muteBtn!: GlassButton;
  private controlsBtn!: GlassButton;
  private highScoresBtn!: GlassButton;

  private easyCardBg!: Phaser.GameObjects.Graphics;
  private easyBadgeText!: Phaser.GameObjects.Text;
  private easyCoreText!: Phaser.GameObjects.Text;
  private easyDescText!: Phaser.GameObjects.Text;
  private easyBestText!: Phaser.GameObjects.Text;
  private easyCtaBtn!: GlassButton;

  private hardCardBg!: Phaser.GameObjects.Graphics;
  private hardBadgeText!: Phaser.GameObjects.Text;
  private hardCoreText!: Phaser.GameObjects.Text;
  private hardDescText!: Phaser.GameObjects.Text;
  private hardBestText!: Phaser.GameObjects.Text;
  private hardCtaBtn!: GlassButton;

  private controlsModal!: ControlsModal;
  private highScoresModal!: HighScoresModal;
  private unsubPrefs: (() => void) | null = null;
  private handleKeyDownBound: ((e: KeyboardEvent) => void) | null = null;

  constructor() {
    super({ key: 'TitleScene' });
  }

  create(): void {
    this.rotatingRings.length = 0;
    this.drawBackdropAndRings();

    // Top-right utility pills
    this.langBtn = createGlassButton(
      this,
      { x: CANVAS_WIDTH - 296, y: 54, w: 140, h: 44, label: '', fontSize: 17 },
      () => {
        toggleLanguage();
      },
    );
    this.muteBtn = createGlassButton(
      this,
      { x: CANVAS_WIDTH - 126, y: 54, w: 164, h: 44, label: '', fontSize: 17 },
      () => {
        const current = appStorage.getPreferences().muted;
        appStorage.updatePreferences({ muted: !current });
      },
    );

    // Hero Title
    this.add
      .text(CANVAS_WIDTH / 2, 162, 'ANTIGRAVITY TETRIS', {
        fontFamily: 'system-ui, -apple-system, Segoe UI, sans-serif',
        fontSize: '74px',
        fontStyle: 'bold',
        color: '#e0f2fe',
        stroke: '#0ea5e9',
        strokeThickness: 3,
      })
      .setOrigin(0.5);

    this.subtitleText = this.add
      .text(CANVAS_WIDTH / 2, 228, '', {
        fontFamily: 'ui-monospace, Consolas, monospace',
        fontSize: '21px',
        color: '#67e8f9',
      })
      .setOrigin(0.5);

    // Side-by-side difficulty cards
    this.createDifficultyCards();

    // Bottom action buttons
    this.controlsBtn = createGlassButton(
      this,
      { x: CANVAS_WIDTH / 2 - 154, y: 822, w: 264, h: 56, label: '', fontSize: 20 },
      () => {
        this.controlsModal.open();
      },
    );
    this.highScoresBtn = createGlassButton(
      this,
      { x: CANVAS_WIDTH / 2 + 154, y: 822, w: 264, h: 56, label: '', fontSize: 20 },
      () => {
        this.highScoresModal.open();
      },
    );

    this.keyHintText = this.add
      .text(CANVAS_WIDTH / 2, 910, '', {
        fontFamily: 'ui-monospace, Consolas, monospace',
        fontSize: '18px',
        color: '#94a3b8',
      })
      .setOrigin(0.5);

    this.controlsModal = new ControlsModal(this, () => {
      this.controlsModal.close();
    });
    this.highScoresModal = new HighScoresModal(this, () => {
      this.highScoresModal.close();
    });

    this.unsubPrefs = appStorage.subscribePreferences(() => {
      this.refreshLocale();
    });

    this.handleKeyDownBound = (e: KeyboardEvent) => this.onKeyDown(e);
    window.addEventListener('keydown', this.handleKeyDownBound);

    this.events.once('shutdown', () => this.cleanup());
    this.events.once('destroy', () => this.cleanup());

    this.refreshLocale();
    this.redrawCardHighlights();
  }

  update(_time: number, delta: number): void {
    const dtSec = Math.min(delta, 50) / 1000;
    this.starPhaseMs += Math.min(delta, 50);

    for (const r of this.rotatingRings) {
      r.container.rotation += r.speed * dtSec;
    }

    if (this.starfieldGraphics) {
      this.starfieldGraphics.setAlpha(0.75 + 0.2 * Math.sin(this.starPhaseMs * 0.0015));
    }
  }

  private drawBackdropAndRings(): void {
    const bg = this.add.graphics();
    bg.fillGradientStyle(0x060814, 0x060814, 0x0f1738, 0x090e22, 1);
    bg.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    this.starfieldGraphics = this.add.graphics();
    for (let i = 0; i < 160; i++) {
      const sx = (i * 223 + 67) % CANVAS_WIDTH;
      const sy = (i * 349 + 91) % CANVAS_HEIGHT;
      const alpha = 0.2 + ((i * 41) % 65) / 100;
      const radius = i % 9 === 0 ? 2.5 : 1.3;
      this.starfieldGraphics.fillStyle(i % 4 === 0 ? 0x9dd2ff : 0xffffff, alpha);
      this.starfieldGraphics.fillCircle(sx, sy, radius);
    }

    const ringSpecs = [
      { size: 980, color: 0x0284c7, speed: 0.04, alpha: 0.14 },
      { size: 840, color: 0x2563eb, speed: -0.055, alpha: 0.16 },
      { size: 700, color: 0x4f46e5, speed: 0.07, alpha: 0.18 },
      { size: 560, color: 0x7c3aed, speed: -0.085, alpha: 0.2 },
      { size: 420, color: 0xc026d3, speed: 0.1, alpha: 0.22 },
      { size: 280, color: 0x22d3ee, speed: -0.12, alpha: 0.26 },
    ];

    for (const spec of ringSpecs) {
      const g = this.add.graphics();
      g.lineStyle(2, spec.color, spec.alpha);
      g.strokeRoundedRect(-spec.size / 2, -spec.size / 2, spec.size, spec.size, 18);
      const container = this.add.container(CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 20, [g]);
      container.rotation = spec.size * 0.002;
      this.rotatingRings.push({ container, speed: spec.speed });
    }
  }

  private createDifficultyCards(): void {
    const cardW = 472;
    const cardH = 404;
    const cardY = 516;
    const easyX = CANVAS_WIDTH / 2 - 268;
    const hardX = CANVAS_WIDTH / 2 + 268;

    // Easy Card
    this.easyCardBg = this.add.graphics();
    const easyZone = this.add
      .zone(easyX, cardY, cardW, cardH)
      .setInteractive({ useHandCursor: true });
    easyZone.on('pointerover', () => {
      this.selectedDifficulty = 'easy';
      this.redrawCardHighlights();
    });
    easyZone.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (pointer.button === 0 && !this.hasModalOpen()) {
        this.startGame('easy');
      }
    });

    this.easyBadgeText = this.add
      .text(easyX, cardY - 144, '', {
        fontFamily: 'system-ui, -apple-system, Segoe UI, sans-serif',
        fontSize: '42px',
        fontStyle: 'bold',
        color: '#6ee7b7',
      })
      .setOrigin(0.5);

    this.easyCoreText = this.add
      .text(easyX, cardY - 82, '', {
        fontFamily: 'ui-monospace, Consolas, monospace',
        fontSize: '18px',
        fontStyle: 'bold',
        color: '#a7f3d0',
      })
      .setOrigin(0.5);

    this.easyDescText = this.add
      .text(easyX, cardY - 8, '', {
        fontFamily: 'system-ui, -apple-system, Segoe UI, sans-serif',
        fontSize: '19px',
        color: '#cbd5e1',
        align: 'center',
        wordWrap: { width: cardW - 64 },
        lineSpacing: 8,
      })
      .setOrigin(0.5);

    this.easyBestText = this.add
      .text(easyX, cardY + 78, '', {
        fontFamily: 'ui-monospace, Consolas, monospace',
        fontSize: '18px',
        color: '#94a3b8',
      })
      .setOrigin(0.5);

    this.easyCtaBtn = createGlassButton(
      this,
      {
        x: easyX,
        y: cardY + 144,
        w: 220,
        h: 50,
        label: '',
        fontSize: 20,
        fillColor: 0x064e3b,
        hoverFillColor: 0x065f46,
        borderColor: 0x10b981,
        textColor: '#ecfdf5',
      },
      () => this.startGame('easy'),
    );

    // Hard Card
    this.hardCardBg = this.add.graphics();
    const hardZone = this.add
      .zone(hardX, cardY, cardW, cardH)
      .setInteractive({ useHandCursor: true });
    hardZone.on('pointerover', () => {
      this.selectedDifficulty = 'hard';
      this.redrawCardHighlights();
    });
    hardZone.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (pointer.button === 0 && !this.hasModalOpen()) {
        this.startGame('hard');
      }
    });

    this.hardBadgeText = this.add
      .text(hardX, cardY - 144, '', {
        fontFamily: 'system-ui, -apple-system, Segoe UI, sans-serif',
        fontSize: '42px',
        fontStyle: 'bold',
        color: '#fda4af',
      })
      .setOrigin(0.5);

    this.hardCoreText = this.add
      .text(hardX, cardY - 82, '', {
        fontFamily: 'ui-monospace, Consolas, monospace',
        fontSize: '18px',
        fontStyle: 'bold',
        color: '#f5d0fe',
      })
      .setOrigin(0.5);

    this.hardDescText = this.add
      .text(hardX, cardY - 8, '', {
        fontFamily: 'system-ui, -apple-system, Segoe UI, sans-serif',
        fontSize: '19px',
        color: '#cbd5e1',
        align: 'center',
        wordWrap: { width: cardW - 64 },
        lineSpacing: 8,
      })
      .setOrigin(0.5);

    this.hardBestText = this.add
      .text(hardX, cardY + 78, '', {
        fontFamily: 'ui-monospace, Consolas, monospace',
        fontSize: '18px',
        color: '#94a3b8',
      })
      .setOrigin(0.5);

    this.hardCtaBtn = createGlassButton(
      this,
      {
        x: hardX,
        y: cardY + 144,
        w: 220,
        h: 50,
        label: '',
        fontSize: 20,
        fillColor: 0x4c0519,
        hoverFillColor: 0x881337,
        borderColor: 0xf43f5e,
        textColor: '#fff1f2',
      },
      () => this.startGame('hard'),
    );
  }

  private redrawCardHighlights(): void {
    const cardW = 472;
    const cardH = 404;
    const cardY = 516;
    const easyX = CANVAS_WIDTH / 2 - 268;
    const hardX = CANVAS_WIDTH / 2 + 268;

    const easySelected = this.selectedDifficulty === 'easy';
    this.easyCardBg.clear();
    this.easyCardBg.fillStyle(0x0b1f29, easySelected ? 0.92 : 0.72);
    this.easyCardBg.fillRoundedRect(easyX - cardW / 2, cardY - cardH / 2, cardW, cardH, 24);
    this.easyCardBg.lineStyle(easySelected ? 3.5 : 1.5, 0x10b981, easySelected ? 1 : 0.45);
    this.easyCardBg.strokeRoundedRect(easyX - cardW / 2, cardY - cardH / 2, cardW, cardH, 24);

    const hardSelected = this.selectedDifficulty === 'hard';
    this.hardCardBg.clear();
    this.hardCardBg.fillStyle(0x220d22, hardSelected ? 0.92 : 0.72);
    this.hardCardBg.fillRoundedRect(hardX - cardW / 2, cardY - cardH / 2, cardW, cardH, 24);
    this.hardCardBg.lineStyle(hardSelected ? 3.5 : 1.5, 0xf43f5e, hardSelected ? 1 : 0.45);
    this.hardCardBg.strokeRoundedRect(hardX - cardW / 2, cardY - cardH / 2, cardW, cardH, 24);
  }

  private refreshLocale(): void {
    const prefs = appStorage.getPreferences();

    this.subtitleText.setText(t('title.subtitle'));
    this.langBtn.setLabel(t('title.langToggle'));
    this.muteBtn.setLabel(prefs.muted ? t('title.audioMuted') : t('title.audioOn'));
    this.muteBtn.setColors(
      prefs.muted ? 0x3b1322 : 0x16203d,
      prefs.muted ? 0xf43f5e : 0x67e8f9,
      prefs.muted ? '#fda4af' : '#e0f2fe',
      prefs.muted ? 0x4c192d : 0x21315c,
    );

    this.easyBadgeText.setText(t('title.easy.badge'));
    this.easyCoreText.setText(t('title.easy.core'));
    this.easyDescText.setText(t('title.easy.desc'));
    this.easyCtaBtn.setLabel(t('title.startCta'));

    this.hardBadgeText.setText(t('title.hard.badge'));
    this.hardCoreText.setText(t('title.hard.core'));
    this.hardDescText.setText(t('title.hard.desc'));
    this.hardCtaBtn.setLabel(t('title.startCta'));

    const easyScores = appStorage.getHighScores('easy');
    this.easyBestText.setText(
      easyScores.length > 0
        ? `${t('title.best')}: ${easyScores[0].score.toLocaleString()}`
        : `${t('title.best')}: ${t('title.noRecord')}`,
    );

    const hardScores = appStorage.getHighScores('hard');
    this.hardBestText.setText(
      hardScores.length > 0
        ? `${t('title.best')}: ${hardScores[0].score.toLocaleString()}`
        : `${t('title.best')}: ${t('title.noRecord')}`,
    );

    this.controlsBtn.setLabel(t('title.controlsBtn'));
    this.highScoresBtn.setLabel(t('title.highScoresBtn'));
    this.keyHintText.setText(t('title.keyHint'));

    this.controlsModal.refreshLocale();
    this.highScoresModal.refreshLocale();
  }

  private hasModalOpen(): boolean {
    return this.controlsModal.isOpen() || this.highScoresModal.isOpen();
  }

  private onKeyDown(e: KeyboardEvent): void {
    if (e.repeat) return;

    if (this.hasModalOpen()) {
      if (e.code === 'Escape') {
        e.preventDefault();
        this.controlsModal.close();
        this.highScoresModal.close();
      }
      return;
    }

    if (e.code === 'ArrowLeft' || e.code === 'KeyA') {
      e.preventDefault();
      this.selectedDifficulty = 'easy';
      this.redrawCardHighlights();
      return;
    }

    if (e.code === 'ArrowRight' || e.code === 'KeyD') {
      e.preventDefault();
      this.selectedDifficulty = 'hard';
      this.redrawCardHighlights();
      return;
    }

    if (e.code === 'Enter' || e.code === 'NumpadEnter' || e.code === 'Space') {
      e.preventDefault();
      this.startGame(this.selectedDifficulty);
    }
  }

  private startGame(difficulty: Difficulty): void {
    this.scene.start('GameScene', { difficulty });
  }

  private cleanup(): void {
    if (this.handleKeyDownBound) {
      window.removeEventListener('keydown', this.handleKeyDownBound);
      this.handleKeyDownBound = null;
    }
    if (this.unsubPrefs) {
      this.unsubPrefs();
      this.unsubPrefs = null;
    }
    this.controlsModal?.destroy();
    this.highScoresModal?.destroy();
  }
}
