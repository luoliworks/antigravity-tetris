import Phaser from 'phaser';
import { t, toggleLanguage } from '../i18n/i18n';
import {
  BOARD_PIXEL_SIZE,
  BOARD_X,
  BOARD_Y,
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
} from '../render/layout';
import { appStorage } from '../storage/storage';
import { createGlassButton, createVolumeSlider } from './uiHelpers';
import type { GlassButton, VolumeSlider } from './uiHelpers';

export interface PauseOverlayCallbacks {
  onResume(): void;
  onRestart(): void;
  onOpenControls(): void;
  onBackToTitle(): void;
}

export class PauseOverlay {
  private readonly container: Phaser.GameObjects.Container;
  private readonly antiPeekTitle: Phaser.GameObjects.Text;
  private readonly antiPeekSub: Phaser.GameObjects.Text;
  private readonly pauseTitle: Phaser.GameObjects.Text;
  private readonly langLabel: Phaser.GameObjects.Text;
  private readonly bgmLabel: Phaser.GameObjects.Text;
  private readonly sfxLabel: Phaser.GameObjects.Text;
  private readonly aiLabel: Phaser.GameObjects.Text;

  private readonly langToggleBtn: GlassButton;
  private readonly aiToggleBtn: GlassButton;
  private readonly bgmSlider: VolumeSlider;
  private readonly sfxSlider: VolumeSlider;
  private readonly resumeBtn: GlassButton;
  private readonly restartBtn: GlassButton;
  private readonly controlsBtn: GlassButton;
  private readonly backTitleBtn: GlassButton;

  private openState = false;

  constructor(scene: Phaser.Scene, callbacks: PauseOverlayCallbacks) {
    // 1. Left-board anti-peek frosted curtain
    const curtainX = BOARD_X - 10;
    const curtainY = BOARD_Y - 10;
    const curtainSize = BOARD_PIXEL_SIZE + 20;

    const fullDim = scene.add
      .rectangle(CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2, CANVAS_WIDTH, CANVAS_HEIGHT, 0x040712, 0.58)
      .setInteractive();

    const antiPeekBg = scene.add.graphics();
    antiPeekBg.fillStyle(0x070b1a, 0.94);
    antiPeekBg.fillRoundedRect(curtainX, curtainY, curtainSize, curtainSize, 18);
    antiPeekBg.lineStyle(2, 0x38bdf8, 0.45);
    antiPeekBg.strokeRoundedRect(curtainX, curtainY, curtainSize, curtainSize, 18);

    // Subtle frosted mosaic lattice so board blocks cannot be peeked
    antiPeekBg.lineStyle(1, 0x1e293b, 0.65);
    for (let i = 1; i < 8; i++) {
      const offset = (curtainSize / 8) * i;
      antiPeekBg.lineBetween(curtainX + offset, curtainY + 12, curtainX + offset, curtainY + curtainSize - 12);
      antiPeekBg.lineBetween(curtainX + 12, curtainY + offset, curtainX + curtainSize - 12, curtainY + offset);
    }

    this.antiPeekTitle = scene.add
      .text(curtainX + curtainSize / 2, curtainY + curtainSize / 2 - 22, '', {
        fontFamily: 'ui-monospace, Consolas, monospace',
        fontSize: '26px',
        fontStyle: 'bold',
        color: '#67e8f9',
      })
      .setOrigin(0.5);

    this.antiPeekSub = scene.add
      .text(curtainX + curtainSize / 2, curtainY + curtainSize / 2 + 22, '', {
        fontFamily: 'system-ui, -apple-system, Segoe UI, sans-serif',
        fontSize: '17px',
        color: '#94a3b8',
        align: 'center',
        wordWrap: { width: curtainSize - 140 },
      })
      .setOrigin(0.5);

    // 2. Centered frosted pause menu card
    const cardW = 640;
    const cardH = 688;
    const cx = CANVAS_WIDTH / 2;
    const cy = CANVAS_HEIGHT / 2;
    const left = cx - cardW / 2;
    const top = cy - cardH / 2;

    const cardBlocker = scene.add.zone(cx, cy, cardW, cardH).setInteractive();

    const cardBg = scene.add.graphics();
    cardBg.fillStyle(0x0f172a, 0.96);
    cardBg.fillRoundedRect(left, top, cardW, cardH, 24);
    cardBg.lineStyle(2, 0x67e8f9, 0.72);
    cardBg.strokeRoundedRect(left, top, cardW, cardH, 24);

    this.pauseTitle = scene.add
      .text(cx, top + 52, '', {
        fontFamily: 'system-ui, -apple-system, Segoe UI, sans-serif',
        fontSize: '42px',
        fontStyle: 'bold',
        color: '#e0f2fe',
      })
      .setOrigin(0.5);

    // Settings rows
    const prefs = appStorage.getPreferences();
    const labelX = left + 48;
    const controlRightX = left + cardW - 48;

    this.langLabel = scene.add
      .text(labelX, top + 128, '', {
        fontFamily: 'ui-monospace, Consolas, monospace',
        fontSize: '18px',
        color: '#cbd5e1',
      })
      .setOrigin(0, 0.5);
    this.langToggleBtn = createGlassButton(
      scene,
      { x: controlRightX - 90, y: top + 128, w: 180, h: 40, label: '', fontSize: 16 },
      () => {
        toggleLanguage();
      },
    );

    this.bgmLabel = scene.add
      .text(labelX, top + 190, '', {
        fontFamily: 'ui-monospace, Consolas, monospace',
        fontSize: '18px',
        color: '#cbd5e1',
      })
      .setOrigin(0, 0.5);
    this.bgmSlider = createVolumeSlider(
      scene,
      controlRightX - 270,
      top + 190,
      200,
      prefs.bgmVolume,
      0x38bdf8,
      (val) => {
        appStorage.updatePreferences({ bgmVolume: val });
      },
    );

    this.sfxLabel = scene.add
      .text(labelX, top + 252, '', {
        fontFamily: 'ui-monospace, Consolas, monospace',
        fontSize: '18px',
        color: '#cbd5e1',
      })
      .setOrigin(0, 0.5);
    this.sfxSlider = createVolumeSlider(
      scene,
      controlRightX - 270,
      top + 252,
      200,
      prefs.sfxVolume,
      0xa855f7,
      (val) => {
        appStorage.updatePreferences({ sfxVolume: val });
      },
    );

    this.aiLabel = scene.add
      .text(labelX, top + 314, '', {
        fontFamily: 'ui-monospace, Consolas, monospace',
        fontSize: '18px',
        color: '#cbd5e1',
      })
      .setOrigin(0, 0.5);
    this.aiToggleBtn = createGlassButton(
      scene,
      { x: controlRightX - 90, y: top + 314, w: 180, h: 40, label: '', fontSize: 16 },
      () => {
        const cur = appStorage.getPreferences().aiCommentary;
        appStorage.updatePreferences({ aiCommentary: !cur });
      },
    );

    // Action buttons
    this.resumeBtn = createGlassButton(
      scene,
      {
        x: cx,
        y: top + 402,
        w: 440,
        h: 54,
        label: '',
        fontSize: 22,
        fillColor: 0x0c4a6e,
        hoverFillColor: 0x0369a1,
        borderColor: 0x38bdf8,
        textColor: '#f0f9ff',
      },
      callbacks.onResume,
    );

    this.restartBtn = createGlassButton(
      scene,
      { x: cx, y: top + 472, w: 440, h: 50, label: '', fontSize: 19 },
      callbacks.onRestart,
    );

    this.controlsBtn = createGlassButton(
      scene,
      { x: cx, y: top + 538, w: 440, h: 50, label: '', fontSize: 19 },
      callbacks.onOpenControls,
    );

    this.backTitleBtn = createGlassButton(
      scene,
      {
        x: cx,
        y: top + 604,
        w: 440,
        h: 50,
        label: '',
        fontSize: 19,
        fillColor: 0x2b1222,
        hoverFillColor: 0x4c1d33,
        borderColor: 0xf43f5e,
        textColor: '#fecdd3',
      },
      callbacks.onBackToTitle,
    );

    this.container = scene.add
      .container(0, 0, [
        fullDim,
        antiPeekBg,
        this.antiPeekTitle,
        this.antiPeekSub,
        cardBlocker,
        cardBg,
        this.pauseTitle,
        this.langLabel,
        this.langToggleBtn.container,
        this.bgmLabel,
        this.bgmSlider.container,
        this.sfxLabel,
        this.sfxSlider.container,
        this.aiLabel,
        this.aiToggleBtn.container,
        this.resumeBtn.container,
        this.restartBtn.container,
        this.controlsBtn.container,
        this.backTitleBtn.container,
      ])
      .setDepth(45)
      .setVisible(false);

    this.refreshLocale();
  }

  open(): void {
    this.refreshLocale();
    this.openState = true;
    this.container.setVisible(true);
  }

  close(): void {
    this.openState = false;
    this.container.setVisible(false);
  }

  isOpen(): boolean {
    return this.openState;
  }

  refreshLocale(): void {
    const prefs = appStorage.getPreferences();

    this.antiPeekTitle.setText(t('pause.antiPeek'));
    this.antiPeekSub.setText(t('pause.antiPeekSub'));
    this.pauseTitle.setText(t('pause.title'));

    this.langLabel.setText(t('pause.language'));
    this.langToggleBtn.setLabel(t('pause.langValue'));
    this.bgmLabel.setText(t('pause.bgmVol'));
    this.sfxLabel.setText(t('pause.sfxVol'));
    this.bgmSlider.setValue(prefs.bgmVolume);
    this.sfxSlider.setValue(prefs.sfxVolume);

    this.aiLabel.setText(t('pause.aiCommentary'));
    this.aiToggleBtn.setLabel(prefs.aiCommentary ? t('pause.on') : t('pause.off'));
    this.aiToggleBtn.setColors(
      prefs.aiCommentary ? 0x064e3b : 0x334155,
      prefs.aiCommentary ? 0x10b981 : 0x64748b,
      prefs.aiCommentary ? '#6ee7b7' : '#cbd5e1',
      prefs.aiCommentary ? 0x065f46 : 0x475569,
    );

    this.resumeBtn.setLabel(t('pause.resume'));
    this.restartBtn.setLabel(t('pause.restart'));
    this.controlsBtn.setLabel(t('pause.controls'));
    this.backTitleBtn.setLabel(t('pause.backTitle'));
  }

  destroy(): void {
    this.container.destroy(true);
  }
}
